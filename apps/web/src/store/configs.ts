import { changesTable, syncStateTable } from "@will-be-done/slices/common";
import {
  backupSlice,
  cardsTasksSlice,
  cardsTaskTemplatesSlice,
  projectsSlice,
  registeredSpaceSyncableTableNameMap,
  registeredSpaceSyncableTables,
  type Task,
} from "@will-be-done/slices/space";
import {
  asyncDispatch,
  HyperDB,
  runSelectorAsync,
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
    tableNameMap: registeredSpaceSyncableTableNameMap,
    afterInit: async (db: HyperDB) => {
      await asyncDispatch(db, projectsSlice.createInboxIfNotExists());

      await asyncDispatch(
        db,
        cardsTaskTemplatesSlice.generateTasksFromTemplates(),
      );
      setInterval(() => {
        void asyncDispatch(
          db,
          cardsTaskTemplatesSlice.generateTasksFromTemplates(),
        );
      }, 60 * 1000);
    },
  } satisfies SyncConfig;
};

export const demoSpaceDBConfig = () => {
  return {
    ...spaceDBConfig(demoDbId),
    disableSync: true,
    afterInit: async (db: HyperDB) => {
      await asyncDispatch(db, projectsSlice.createInboxIfNotExists());
      const tasks = await runSelectorAsync<Task[]>(db, function* () {
        return yield* cardsTasksSlice.all();
      });

      if (tasks.length === 0) {
        await asyncDispatch(db, backupSlice.loadBackup(generateDemoBackup()));
      }

      await asyncDispatch(
        db,
        cardsTaskTemplatesSlice.generateTasksFromTemplates(),
      );
      setInterval(() => {
        void asyncDispatch(
          db,
          cardsTaskTemplatesSlice.generateTasksFromTemplates(),
        );
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
    tableNameMap: registeredUserSyncableTableNameMap,
    afterInit: () => {},
  } satisfies SyncConfig;
};
