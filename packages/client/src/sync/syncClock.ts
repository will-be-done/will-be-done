import { nanoid } from "nanoid";
import { asyncDispatch, type HyperDB } from "@will-be-done/hyperdb";
import type { SyncConfig } from "./syncTypes";
import type { KeyValueStorage } from "./platform";
import {
  createHlcClock,
  getLatestPersistedClock,
  type HlcClock,
} from "@will-be-done/slices/common";

export const getDbName = (syncConfig: Pick<SyncConfig, "dbType" | "dbId">) => {
  return syncConfig.dbType + "-" + syncConfig.dbId;
};

const writerInstanceId = nanoid(8);

// A persisted client id identifies the replica on the server; the ephemeral
// suffix identifies this tab/window so concurrent writers never emit the same
// HLC timestamp.
export const initClock = (clientId: string) =>
  createHlcClock(`${clientId}:${writerInstanceId}`);

export const observePersistedClock = async (db: HyperDB, clock: HlcClock) => {
  const persistedClock = await asyncDispatch(db, getLatestPersistedClock({}));
  clock.observe([persistedClock]);
};

export const getClientId = (
  storage: KeyValueStorage,
  dbName: string,
  storageKind: string,
) => {
  // wa-sqlite was the first web storage backend, so its replica keeps the
  // original unsuffixed key.
  const key =
    storageKind === "wa-sqlite"
      ? "clientId-" + dbName
      : `clientId-${dbName}-${storageKind}`;

  let id: string | null = null;
  try {
    id = storage.getItem(key);
  } catch (e) {
    console.warn("Failed to read client id from storage", e);
  }

  if (id) return id;

  const newId = nanoid();
  try {
    storage.setItem(key, newId);
  } catch (e) {
    console.warn("Failed to save client id to storage", e);
  }

  return newId;
};
