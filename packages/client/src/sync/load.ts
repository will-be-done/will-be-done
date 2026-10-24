import { asyncDispatch, type SubscribableDB } from "@will-be-done/hyperdb";
import AwaitLock from "await-lock";
import { createCrossTabChanges } from "./crossTabChanges";
import { createLocalPersistQueue } from "./localPersistQueue";
import {
  getClientId,
  getDbName,
  initClock,
  observePersistedClock,
} from "./syncClock";
import { registerSyncChangeHooks } from "./syncChangeHooks";
import { Syncer } from "./syncer";
import { syncStatusByDB } from "./syncStatus";
import { resetEmptyPersistedSyncCursor } from "./syncActions";
import { createStoreDbs } from "./storeDbs";
import type { SyncConfig } from "./syncTypes";
import type { ClientPlatform } from "./platform";
import { migrateSyncV4Clocks } from "@will-be-done/slices/common";

const lock = new AwaitLock();
const initedDbs: Record<string, SubscribableDB> = {};

export const initDbStore = async (
  platform: ClientPlatform,
  syncConfig: SyncConfig,
): Promise<SubscribableDB> => {
  const dbName = getDbName(syncConfig);
  const storageKind = await platform.persistentStorage.resolveKind(dbName);
  const cacheKey = `${dbName}:${storageKind}`;

  await lock.acquireAsync();
  try {
    if (initedDbs[cacheKey]) {
      return initedDbs[cacheKey];
    }

    const clientId = getClientId(platform.storage, dbName, storageKind);
    const nextClock = initClock(clientId);
    const { syncSubDb } = await createStoreDbs(
      platform,
      dbName,
      syncConfig,
      async (persistentDB) => {
        await asyncDispatch(
          persistentDB.withTraits({ type: "skip-sync" }),
          migrateSyncV4Clocks({}),
        );
        await observePersistedClock(persistentDB, nextClock);
        await asyncDispatch(persistentDB, resetEmptyPersistedSyncCursor({}));
      },
    );

    registerSyncChangeHooks({
      syncSubDb,
      syncableDBTables: syncConfig.syncableDBTables,
      clientId,
      nextClock,
    });
    await syncConfig.beforeInit?.(syncSubDb);

    const syncer = new Syncer(
      syncSubDb,
      clientId,
      syncConfig,
      nextClock,
      platform,
    );

    const crossTabChanges = createCrossTabChanges({
      clientId,
      syncSubDb,
      syncConfig,
      nextClock,
      onApplied: () => syncer.forceSync(),
      coordination: platform.coordination,
    });

    const localPersistQueue = createLocalPersistQueue({
      syncSubDb,
      postChanges: crossTabChanges.postChanges,
      onPersisted: () => syncer.forceSync(),
      lifecycle: platform.lifecycle,
    });
    localPersistQueue.start();

    if (!syncConfig.disableSync) {
      syncStatusByDB.set(syncSubDb, syncer.status);
      syncer.startLoop();
      platform.startAutoBackup?.(dbName, syncSubDb);
    }

    await syncConfig.afterInit(syncSubDb);

    initedDbs[cacheKey] = syncSubDb;

    return syncSubDb;
  } finally {
    lock.release();
  }
};
