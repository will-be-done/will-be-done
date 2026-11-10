import type { HyperDB, SubscribableDB } from "@will-be-done/hyperdb";
import {
  getLatestPersistedClock,
  migrateSyncV4Clocks,
} from "@will-be-done/slices/common";
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
import { makeAttachmentBlobStore } from "./attachments/blobStore";
import {
  attachmentTransfersByDB,
  makeAttachmentTransfers,
} from "./attachments/transfers";
import { makeAutoBackup, readSpaceBackup } from "./autoBackup";
import { makeCrossTabChanges } from "./crossTabChanges";
import { Database, type DatabaseError } from "./database";
import { makeLocalPersistQueue } from "./localPersistQueue";
import type { PersistentDriverKind } from "./persistentDriver";
import { resetEmptyPersistedSyncCursor } from "./syncActions";
import { registerSyncChangeHooks } from "./syncChangeHooks";
import { getDbName, initClock } from "./syncClock";
import { Syncer, type SyncerServices } from "./syncer";
import { syncByDB } from "./syncStatus";
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
      prepare: (persistentDB: HyperDB) => Effect.Effect<void, DatabaseError>,
    ) => Effect.Effect<SubscribableDB, DatabaseError>;
  }
>()("@will-be-done/web/StoreStorage") {}

// Database is provided per store by startStore, not by the app layer.
export type StoreServices =
  | StoreStorage
  | Exclude<SyncerServices, Database>
  | BackupDatabase;

const startStore = (
  syncConfig: SyncConfig,
  dbName: string,
  driverKind: PersistentDriverKind,
) =>
  Effect.gen(function* () {
    const storage = yield* StoreStorage;
    const clientId = storage.clientId(dbName, driverKind);
    const nextClock = initClock(clientId);
    const syncSubDb = yield* storage.open(dbName, syncConfig, (persistentDB) =>
      Effect.gen(function* () {
        const persistent = Database.make(persistentDB);
        yield* persistent.dispatch(migrateSyncV4Clocks({}), { skipSync: true });
        nextClock.observe([
          yield* persistent.dispatch(getLatestPersistedClock({})),
        ]);
        yield* persistent.dispatch(resetEmptyPersistedSyncCursor({}));
      }),
    );
    const database = Database.make(syncSubDb);

    registerSyncChangeHooks({
      syncSubDb,
      syncableDBTables: syncConfig.syncableDBTables,
      clientId,
      nextClock,
    });
    yield* Effect.gen(function* () {
      if (syncConfig.beforeInit) yield* syncConfig.beforeInit;

      const syncer = yield* Syncer.make(clientId, syncConfig, nextClock);
      const crossTabChanges = yield* makeCrossTabChanges({
        clientId,
        syncConfig,
        nextClock,
        onApplied: () => syncer.forceSync(),
      });
      yield* makeLocalPersistQueue({
        postChanges: crossTabChanges.postChanges,
        onPersisted: () => syncer.forceSync(),
      });
      if (syncConfig.dbType === "space") {
        const transfers = yield* makeAttachmentTransfers({
          dbName,
          spaceId: syncConfig.dbId,
          syncEnabled: !syncConfig.disableSync,
          syncStatus: syncer.status,
          store: yield* makeAttachmentBlobStore(indexedDB, dbName),
        });
        attachmentTransfersByDB.set(syncSubDb, transfers);
      }

      if (!syncConfig.disableSync) {
        syncByDB.set(syncSubDb, syncer);
        syncer.startLoop();
        yield* makeAutoBackup(dbName, readSpaceBackup);
      }

      yield* syncConfig.afterInit;
    }).pipe(Effect.provideService(Database, database));

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
      }).pipe(
        // Route error boundaries show what the local database threw.
        Effect.mapError((error) => error.cause),
      ),
    );

  return { init, get: (cacheKey: string) => stores.get(cacheKey) };
};
