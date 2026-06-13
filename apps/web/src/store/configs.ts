import { changesTable, syncStateTable } from "@will-be-done/slices/common";
import {
  allTasks,
  createInboxIfNotExists,
  generateTasksFromTemplates,
  loadSpaceBackup,
  registeredSpaceSyncableTableNameMap,
  registeredSpaceSyncableTables,
  type Task,
} from "@will-be-done/slices/space";
import { HyperDB, runSelector, syncDispatch } from "@will-be-done/hyperdb-lib";
import {
  registeredUserSyncableTableNameMap,
  registeredUserSyncableTables,
} from "@will-be-done/slices/user";
import { SyncConfig } from "./load";
import { generateDemoBackup } from "@/lib/demoData";

const demoDbId = "e89b6c8f-1d6c-4bf4-9d27-478339773fc9";

export const spaceDBConfig = (dbId: string) => {
  return {
    dbId,
    dbType: "space",
    persistDBTables: [
      ...registeredSpaceSyncableTables,
      changesTable,
      syncStateTable,
    ],
    inmemDBTables: [...registeredSpaceSyncableTables, changesTable],
    syncableDBTables: registeredSpaceSyncableTables,
    tableNameMap: registeredSpaceSyncableTableNameMap,
    afterInit: (db: HyperDB) => {
      syncDispatch(db, createInboxIfNotExists());

      syncDispatch(db, generateTasksFromTemplates());
      setInterval(() => {
        syncDispatch(db, generateTasksFromTemplates());
      }, 60 * 1000);
    },
  } satisfies SyncConfig;
};

export const demoSpaceDBConfig = () => {
  return {
    ...spaceDBConfig(demoDbId),
    disableSync: true,
    afterInit: async (db: HyperDB) => {
      syncDispatch(db, createInboxIfNotExists());
      const tasks = runSelector<Task[]>(
        db,
        function* () {
          return yield* allTasks();
        },
        [],
      );

      if (tasks.length === 0) {
        syncDispatch(db, loadSpaceBackup(generateDemoBackup()));
      }

      syncDispatch(db, generateTasksFromTemplates());
      setInterval(() => {
        syncDispatch(db, generateTasksFromTemplates());
      }, 60 * 1000);
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
