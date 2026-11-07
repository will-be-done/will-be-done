import { asyncDispatch, type SubscribableDB } from "@will-be-done/hyperdb";
import { Effect, Exit, Scope, Semaphore } from "effect";
import { AutoBackuper } from "./autoBackup.ts";
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
import {
  getPersistentDriverKind,
  resolvePersistentDriverKind,
  type PersistentDriverKind,
} from "./persistentDriver";
import { resetEmptyPersistedSyncCursor } from "./syncActions";
import { createStoreDbs } from "./storeDbs";
import type { SyncConfig } from "./syncTypes";
import { spaceDbType } from "./configs.ts";
import { migrateSyncV4Clocks } from "@will-be-done/slices/common";

export type { SyncConfig } from "./syncTypes";

const startupLock = Semaphore.makeUnsafe(1);
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

const startStore = (
  syncConfig: SyncConfig,
  dbName: string,
  persistentDriverKind: PersistentDriverKind,
) =>
  Effect.gen(function* () {
    const clientId = getClientId(dbName, persistentDriverKind);
    const nextClock = initClock(clientId);
    const { syncSubDb } = yield* Effect.promise(() =>
      createStoreDbs(dbName, syncConfig, async (persistentDB) => {
        await asyncDispatch(
          persistentDB.withTraits({ type: "skip-sync" }),
          migrateSyncV4Clocks({}),
        );
        await observePersistedClock(persistentDB, nextClock);
        await asyncDispatch(persistentDB, resetEmptyPersistedSyncCursor({}));
      }),
    );

    registerSyncChangeHooks({
      syncSubDb,
      syncableDBTables: syncConfig.syncableDBTables,
      clientId,
      nextClock,
    });
    yield* Effect.promise(async () => syncConfig.beforeInit?.(syncSubDb));

    const syncer = yield* Effect.acquireRelease(
      Effect.sync(() => new Syncer(syncSubDb, clientId, syncConfig, nextClock)),
      (syncer) => Effect.promise(() => syncer.close()),
    );

    const crossTabChanges = yield* Effect.acquireRelease(
      Effect.sync(() =>
        createCrossTabChanges({
          clientId,
          syncSubDb,
          syncConfig,
          nextClock,
          onApplied: () => syncer.forceSync(),
        }),
      ),
      (crossTabChanges) => Effect.sync(crossTabChanges.close),
    );

    yield* Effect.acquireRelease(
      Effect.sync(() => {
        const localPersistQueue = createLocalPersistQueue({
          syncSubDb,
          postChanges: crossTabChanges.postChanges,
          onPersisted: () => syncer.forceSync(),
        });
        localPersistQueue.start();
        return localPersistQueue;
      }),
      (localPersistQueue) => Effect.sync(localPersistQueue.stop),
    );

    if (!syncConfig.disableSync) {
      syncStatusByDB.set(syncSubDb, syncer.status);
      syncer.startLoop();

      yield* Effect.acquireRelease(
        Effect.sync(() => {
          const autoBackuper = new AutoBackuper(dbName, syncSubDb);
          autoBackuper.start();
          return autoBackuper;
        }),
        (autoBackuper) => Effect.sync(() => autoBackuper.stop()),
      );
    }

    yield* Effect.promise(async () => syncConfig.afterInit(syncSubDb));

    return syncSubDb;
  });

export const initDbStore = async (
  syncConfig: SyncConfig,
): Promise<SubscribableDB> => {
  const dbName = getDbName(syncConfig);
  const persistentDriverKind = await resolvePersistentDriverKind(dbName);
  const cacheKey = `${dbName}:${persistentDriverKind}`;

  return Effect.runPromise(
    Effect.gen(function* () {
      const existing = initedDbs[cacheKey];
      if (existing) return existing;

      // A store lives for the app's lifetime, so its scope only closes when
      // startup fails: a retry must not run beside a half-started sync loop.
      const scope = yield* Scope.make();
      const db = yield* startStore(
        syncConfig,
        dbName,
        persistentDriverKind,
      ).pipe(
        Scope.provide(scope),
        Effect.onExit((exit) =>
          Exit.isFailure(exit) ? Scope.close(scope, exit) : Effect.void,
        ),
      );
      initedDbs[cacheKey] = db;
      return db;
    }).pipe(startupLock.withPermits(1)),
  );
};
