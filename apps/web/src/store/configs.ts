import { changesTable, syncStateTable } from "@will-be-done/slices/common";
import {
  backupSlice,
  cardsTasksSlice,
  projectsSlice,
  registeredSpaceSyncableTableNameMap,
  registeredSpaceSyncableTables,
} from "@will-be-done/slices/space";
import { focusTable } from "./focusSlice";
import {
  asyncDispatch,
  HyperDB,
  runSelectorAsync,
  syncDispatch,
} from "@will-be-done/hyperdb";
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
    inmemDBTables: [...registeredSpaceSyncableTables, changesTable, focusTable],
    syncableDBTables: registeredSpaceSyncableTables,
    tableNameMap: registeredSpaceSyncableTableNameMap,
    afterInit: (db: HyperDB) => {
      syncDispatch(db, projectsSlice.createInboxIfNotExists());
    },
  } satisfies SyncConfig;
};

export const demoSpaceDBConfig = () => {
  return {
    ...spaceDBConfig(demoDbId),
    disableSync: true,
    afterInit: async (db: HyperDB) => {
      syncDispatch(db, projectsSlice.createInboxIfNotExists());
      const tasks = await runSelectorAsync(db, function* () {
        return yield* cardsTasksSlice.all();
      });
      if (tasks.length === 0) {
        await asyncDispatch(db, backupSlice.loadBackup(generateDemoBackup()));
      }
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
