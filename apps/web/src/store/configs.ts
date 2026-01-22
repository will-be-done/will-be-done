import { changesTable, syncStateTable } from "@will-be-done/slices/common";
import {
  projectsSlice,
  registeredSpaceSyncableTableNameMap,
  registeredSpaceSyncableTables,
} from "@will-be-done/slices/space";
import { focusTable } from "./focusSlice";
import { HyperDB, syncDispatch } from "@will-be-done/hyperdb";
import {
  registeredUserSyncableTableNameMap,
  registeredUserSyncableTables,
} from "@will-be-done/slices/user";
import { SyncConfig } from "./load";

export const spaceDBConfig = (dbId: string) => {
  return {
    dbId,
    dbType: "space",
    persistDBTables: [
      ...registeredSpaceSyncableTables,
      changesTable,
      syncStateTable,
    ],
    inmemDBTables: [...registeredSpaceSyncableTables, changesTable, focusTable],
    syncableDBTables: registeredSpaceSyncableTables,
    tableNameMap: registeredSpaceSyncableTableNameMap,
    afterInit: (db: HyperDB) => {
      syncDispatch(db, projectsSlice.createInboxIfNotExists());
    },
  } satisfies SyncConfig;
};

export const userDBConfig = (dbId: string) => {
  return {
    dbId,
    dbType: "user",
    persistDBTables: [
      ...registeredUserSyncableTables,
      changesTable,
      syncStateTable,
    ],
    inmemDBTables: [...registeredUserSyncableTables, changesTable],
    syncableDBTables: registeredUserSyncableTables,
    tableNameMap: registeredUserSyncableTableNameMap,
    afterInit: () => {},
  } satisfies SyncConfig;
};
