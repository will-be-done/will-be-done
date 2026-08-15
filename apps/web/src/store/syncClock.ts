import { nanoid } from "nanoid";
import {
  getPersistentDriverKind,
  type PersistentDriverKind,
} from "./persistentDriver";
import type { SyncConfig } from "./syncTypes";
import { createHlcClock } from "@will-be-done/slices/common";

export const getDbName = (syncConfig: Pick<SyncConfig, "dbType" | "dbId">) => {
  return syncConfig.dbType + "-" + syncConfig.dbId;
};

const writerInstanceId = nanoid();

// A persisted client id identifies the replica on the server; the ephemeral
// suffix identifies this tab/window so concurrent writers never emit the same
// HLC timestamp.
export const initClock = (clientId: string) =>
  createHlcClock(`${clientId}:${writerInstanceId}`);

export const getClientId = (
  dbName: string,
  driverKind: PersistentDriverKind = getPersistentDriverKind(dbName),
) => {
  const key =
    driverKind === "wa-sqlite"
      ? "clientId-" + dbName
      : `clientId-${dbName}-${driverKind}`;

  let id: string | null = null;
  try {
    id = localStorage.getItem(key);
  } catch (e) {
    console.warn("Failed to read client id from localStorage", e);
  }

  if (id) return id;

  const newId = nanoid();
  try {
    localStorage.setItem(key, newId);
  } catch (e) {
    console.warn("Failed to save client id to localStorage", e);
  }

  return newId;
};
