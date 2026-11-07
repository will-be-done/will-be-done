import { Effect, Layer } from "effect";
import { BrowserLive } from "@/services/browserLive";
import { spaceDbType } from "./configs.ts";
import {
  getPersistentDriverKind,
  resolvePersistentDriverKind,
} from "./persistentDriver";
import { createStoreDbs } from "./storeDbs";
import { makeStoreRegistry, StoreStorage } from "./storeRegistry";
import { getClientId, getDbName } from "./syncClock";

export type { SyncConfig } from "./syncTypes";

const StoreStorageLive = Layer.succeed(StoreStorage, {
  driverKind: (dbName) =>
    Effect.promise(() => resolvePersistentDriverKind(dbName)),
  clientId: getClientId,
  open: (dbName, syncConfig, prepare) =>
    Effect.promise(() =>
      createStoreDbs(dbName, syncConfig, (persistentDB) =>
        Effect.runPromise(prepare(persistentDB)),
      ),
    ).pipe(Effect.map(({ syncSubDb }) => syncSubDb)),
});

const stores = makeStoreRegistry(Layer.mergeAll(BrowserLive, StoreStorageLive));

export const initDbStore = stores.init;

export const getDBBySpaceId = (spaceId: string) => {
  const dbName = getDbName({ dbType: spaceDbType, dbId: spaceId });
  // Keep getDBBySpaceId and initDbStore cache keys aligned: initDbStore awaits
  // resolvePersistentDriverKind, which must populate resolvedPersistentDriverKinds
  // before getDBBySpaceId reads the store via getPersistentDriverKind.
  const db = stores.get(`${dbName}:${getPersistentDriverKind(dbName)}`);
  if (!db) {
    throw new Error("failed to find db for projectId: " + spaceId);
  }
  return db;
};
