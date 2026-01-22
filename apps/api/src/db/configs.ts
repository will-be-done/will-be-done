import { changesTable } from "@will-be-done/slices/common";
import { DBConfig } from "./db";
import {
  registeredUserSyncableTableNameMap,
  registeredUserSyncableTables,
} from "@will-be-done/slices/user";
import {
  assertUnreachable,
  registeredSpaceSyncableTableNameMap,
  registeredSpaceSyncableTables,
} from "@will-be-done/slices/space";

export const userDBConfig = (dbId: string) => {
  return {
    dbId,
    dbType: "user",
    persistDBTables: [...registeredUserSyncableTables, changesTable],
    tableNameMap: registeredUserSyncableTableNameMap,
  } satisfies DBConfig;
};

export const spaceDBConfig = (dbId: string) => {
  return {
    dbId,
    dbType: "space",
    persistDBTables: [...registeredSpaceSyncableTables, changesTable],
    tableNameMap: registeredSpaceSyncableTableNameMap,
  } satisfies DBConfig;
};

export const dbConfigByType = (dbType: "user" | "space", dbId: string) => {
  if (dbType === "user") {
    return userDBConfig(dbId);
  } else if (dbType === "space") {
    return spaceDBConfig(dbId);
  } else {
    assertUnreachable(dbType);
  }
};
