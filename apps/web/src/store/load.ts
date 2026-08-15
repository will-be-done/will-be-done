import { asyncDispatch, type SubscribableDB } from "@will-be-done/hyperdb";
import AwaitLock from "await-lock";
import { AutoBackuper } from "./autoBackup.ts";
import { createCrossTabChanges } from "./crossTabChanges";
import { createLocalPersistQueue } from "./localPersistQueue";
import { getClientId, getDbName, initClock } from "./syncClock";
import { registerSyncChangeHooks } from "./syncChangeHooks";
import { Syncer } from "./syncer";
import {
  getPersistentDriverKind,
  resolvePersistentDriverKind,
} from "./persistentDriver";
import { resetEmptyPersistedSyncCursor } from "./syncActions";
import { createStoreDbs } from "./storeDbs";
import type { SyncConfig } from "./syncTypes";
import { spaceDbType } from "./configs.ts";
import {
  getLatestChangeCursor,
  migrateSyncV4Clocks,
} from "@will-be-done/slices/common";

export type { SyncConfig } from "./syncTypes";

const lock = new AwaitLock();
const initedDbs: Record<string, SubscribableDB> = {};

export const getDBBySpaceId = (spaceId: string) => {
  const dbName = getDbName({ dbType: spaceDbType, dbId: spaceId });
  // Keep getDBBySpaceId and initDbStore cache keys aligned: initDbStore awaits
  // resolvePersistentDriverKind, which must populate resolvedPersistentDriverKinds
  // before getDBBySpaceId reads initedDbs via getPersistentDriverKind.
  const cacheKey = `${dbName}:${getPersistentDriverKind(dbName)}`;

  const db = initedDbs[cacheKey];
  if (!db) {
    throw new Error("failed to find db for projectId: " + spaceId);
  }

  return db;
};

export const initDbStore = async (
  syncConfig: SyncConfig,
): Promise<SubscribableDB> => {
  const dbName = getDbName(syncConfig);
  const persistentDriverKind = await resolvePersistentDriverKind(dbName);
  const cacheKey = `${dbName}:${persistentDriverKind}`;

  await lock.acquireAsync();
  try {
    if (initedDbs[cacheKey]) {
      return initedDbs[cacheKey];
    }

    const clientId = getClientId(dbName, persistentDriverKind);
    const nextClock = initClock(clientId);
    const { persistentDB, syncSubDb } = await createStoreDbs(
      dbName,
      syncConfig,
    );
    await asyncDispatch(
      persistentDB.withTraits({ type: "skip-sync" }),
      migrateSyncV4Clocks({}),
    );
    const latest = await asyncDispatch(persistentDB, getLatestChangeCursor({}));
    nextClock.observe([latest?.clock]);
    await asyncDispatch(persistentDB, resetEmptyPersistedSyncCursor({}));

    registerSyncChangeHooks({
      syncSubDb,
      syncableDBTables: syncConfig.syncableDBTables,
      clientId,
      nextClock,
    });
    await syncConfig.beforeInit?.(syncSubDb);

    const crossTabChanges = createCrossTabChanges({
      clientId,
      syncSubDb,
      syncConfig,
      nextClock,
    });

    const syncer = new Syncer(syncSubDb, clientId, syncConfig, nextClock);

    const localPersistQueue = createLocalPersistQueue({
      syncSubDb,
      postChanges: crossTabChanges.postChanges,
      onPersisted: () => syncer.forceSync(),
    });
    localPersistQueue.start();

    if (!syncConfig.disableSync) {
      syncer.startLoop();

      const autoBackuper = new AutoBackuper(dbName, syncSubDb);
      autoBackuper.start();
    }

    await syncConfig.afterInit(syncSubDb);

    initedDbs[cacheKey] = syncSubDb;

    return syncSubDb;
  } finally {
    lock.release();
  }
};
