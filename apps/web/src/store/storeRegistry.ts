import {
  asyncDispatch,
  type DB,
  type SubscribableDB,
} from "@will-be-done/hyperdb";
import { migrateSyncV4Clocks } from "@will-be-done/slices/common";
import { getSpaceBackup } from "@will-be-done/slices/space";
import {
  Context,
  Effect,
  Exit,
  type Layer,
  ManagedRuntime,
  Scope,
  Semaphore,
} from "effect";
import type { BackupDatabase } from "@/services/browser";
import { makeAutoBackup } from "./autoBackup";
import { makeCrossTabChanges } from "./crossTabChanges";
import { makeLocalPersistQueue } from "./localPersistQueue";
import type { PersistentDriverKind } from "./persistentDriver";
import { resetEmptyPersistedSyncCursor } from "./syncActions";
import { registerSyncChangeHooks } from "./syncChangeHooks";
import { getDbName, initClock, observePersistedClock } from "./syncClock";
import { Syncer, type SyncerServices } from "./syncer";
import { syncStatusByDB } from "./syncStatus";
import type { SyncConfig } from "./syncTypes";

export class StoreStorage extends Context.Service<
  StoreStorage,
  {
    readonly driverKind: (
      dbName: string,
    ) => Effect.Effect<PersistentDriverKind>;
    readonly clientId: (dbName: string, kind: PersistentDriverKind) => string;
    readonly open: (
      dbName: string,
      syncConfig: SyncConfig,
      prepare: (persistentDB: DB) => Promise<void>,
    ) => Effect.Effect<SubscribableDB>;
  }
>()("@will-be-done/web/StoreStorage") {}

export type StoreServices = StoreStorage | SyncerServices | BackupDatabase;

const startStore = (
  syncConfig: SyncConfig,
  dbName: string,
  driverKind: PersistentDriverKind,
) =>
  Effect.gen(function* () {
    const storage = yield* StoreStorage;
    const clientId = storage.clientId(dbName, driverKind);
    const nextClock = initClock(clientId);
    const syncSubDb = yield* storage.open(
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
    yield* Effect.promise(async () => syncConfig.beforeInit?.(syncSubDb));

    const syncer = yield* Syncer.make(
      syncSubDb,
      clientId,
      syncConfig,
      nextClock,
    );
    const crossTabChanges = yield* makeCrossTabChanges({
      clientId,
      syncSubDb,
      syncConfig,
      nextClock,
      onApplied: () => syncer.forceSync(),
    });
    yield* makeLocalPersistQueue({
      syncSubDb,
      postChanges: crossTabChanges.postChanges,
      onPersisted: () => syncer.forceSync(),
    });

    if (!syncConfig.disableSync) {
      syncStatusByDB.set(syncSubDb, syncer.status);
      syncer.startLoop();
      yield* makeAutoBackup(
        dbName,
        Effect.promise(() => asyncDispatch(syncSubDb, getSpaceBackup({}))),
      );
    }

    yield* Effect.promise(async () => syncConfig.afterInit(syncSubDb));

    return syncSubDb;
  });

// Stores live for the app's lifetime; one is started per database and kept.
export const makeStoreRegistry = (layer: Layer.Layer<StoreServices>) => {
  const runtime = ManagedRuntime.make(layer);
  const startupLock = Semaphore.makeUnsafe(1);
  const stores = new Map<string, SubscribableDB>();

  const init = (syncConfig: SyncConfig): Promise<SubscribableDB> =>
    runtime.runPromise(
      Effect.gen(function* () {
        const dbName = getDbName(syncConfig);
        const driverKind = yield* (yield* StoreStorage).driverKind(dbName);
        const cacheKey = `${dbName}:${driverKind}`;

        return yield* Effect.gen(function* () {
          const existing = stores.get(cacheKey);
          if (existing) return existing;

          // The scope only closes when startup fails: a retry must not run
          // beside a half-started sync loop.
          const scope = yield* Scope.make();
          const db = yield* startStore(syncConfig, dbName, driverKind).pipe(
            Scope.provide(scope),
            Effect.onExit((exit) =>
              Exit.isFailure(exit) ? Scope.close(scope, exit) : Effect.void,
            ),
          );
          stores.set(cacheKey, db);
          return db;
        }).pipe(startupLock.withPermits(1));
      }),
    );

  return { init, get: (cacheKey: string) => stores.get(cacheKey) };
};
