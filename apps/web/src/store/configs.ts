import { changesTable, syncStateTable } from "@will-be-done/slices/common";
import {
  allTasks,
  checklistItemsTable,
  createInboxIfNotExists,
  dailyListsTable,
  generateTasksFromTemplates,
  installProjectTaskStatsHooks,
  loadSpaceBackup,
  migrateProjectSectionTaskStats,
  migrateScheduledTodoTasks,
  projectSectionsTable,
  projectSectionTaskStatsTable,
  projectsTable,
  registeredSpaceSyncableTableNameMap,
  registeredSpaceSyncableTables,
  scheduledTodoTasksTable,
  spaceMigrationsTable,
  stashProjectionsTable,
  taskProjectionsTable,
  tasksTable,
} from "@will-be-done/slices/space";
import { asyncDispatch, selectAsync } from "@will-be-done/hyperdb";
import {
  registeredUserSyncableTableNameMap,
  registeredUserSyncableTables,
} from "@will-be-done/slices/user";
import type { SyncConfig } from "./syncTypes";
import { generateDemoBackup } from "@/lib/demoData";
import { execAsync } from "@will-be-done/hyperdb";
import { SubscribableDB } from "@will-be-done/hyperdb";

const demoDbId = "e89b6c8f-1d6c-4bf4-9d27-478339773fc9";
export const spaceDbType = "space";

export const spaceDBConfig = (dbId: string) => {
  return {
    dbId,
    dbType: spaceDbType,
    persistDBTables: [
      ...registeredSpaceSyncableTables,
      projectSectionTaskStatsTable,
      scheduledTodoTasksTable,
      spaceMigrationsTable,
      changesTable,
      syncStateTable,
    ],
    syncableDBTables: registeredSpaceSyncableTables,
    tableNameMap: registeredSpaceSyncableTableNameMap,
    beforeInit: (db: SubscribableDB) => {
      installProjectTaskStatsHooks(db);
    },
    afterInit: async (db: SubscribableDB) => {
      await asyncDispatch(db, createInboxIfNotExists({}));

      await execAsync(
        db.preloadTables([
          { table: changesTable, scanIndex: "byEntityIdAndTableName" },
          { table: tasksTable, scanIndex: "byIds" },
          { table: dailyListsTable, scanIndex: "byIds" },
          { table: taskProjectionsTable, scanIndex: "byIds" },
          { table: projectsTable, scanIndex: "byIds" },
          { table: projectSectionsTable, scanIndex: "byIds" },
          { table: stashProjectionsTable, scanIndex: "byIds" },
          { table: projectSectionTaskStatsTable, scanIndex: "byIds" },
          { table: scheduledTodoTasksTable, scanIndex: "byIds" },
          { table: checklistItemsTable, scanIndex: "byIds" },
        ]),
      );
      await asyncDispatch(db, migrateProjectSectionTaskStats({}));
      await asyncDispatch(db, migrateScheduledTodoTasks({}));

      // To make load faster
      setTimeout(() => {
        void asyncDispatch(
          db,
          generateTasksFromTemplates({ toDate: Date.now() }),
        );
      }, 2000);
      setInterval(() => {
        void asyncDispatch(
          db,
          generateTasksFromTemplates({ toDate: Date.now() }),
        );
      }, 60 * 1000);
    },
  } satisfies SyncConfig;
};

export const demoSpaceDBConfig = () => {
  return {
    ...spaceDBConfig(demoDbId),
    disableSync: true,
    beforeInit: (db: SubscribableDB) => {
      installProjectTaskStatsHooks(db);
    },
    afterInit: async (db: SubscribableDB) => {
      await asyncDispatch(db, createInboxIfNotExists({}));
      const tasks = await selectAsync(db, {
        selector: allTasks,
        args: {},
      });

      if (tasks.length === 0) {
        await asyncDispatch(
          db,
          loadSpaceBackup({ backup: generateDemoBackup() }),
        );
      }

      await execAsync(
        db.preloadTables([
          { table: projectsTable, scanIndex: "byIds" },
          { table: projectSectionsTable, scanIndex: "byIds" },
          { table: taskProjectionsTable, scanIndex: "byIds" },
          { table: stashProjectionsTable, scanIndex: "byIds" },
          { table: projectSectionTaskStatsTable, scanIndex: "byIds" },
          { table: scheduledTodoTasksTable, scanIndex: "byIds" },
        ]),
      );
      await asyncDispatch(db, migrateProjectSectionTaskStats({}));
      await asyncDispatch(db, migrateScheduledTodoTasks({}));

      // To make load faster
      setTimeout(() => {
        void asyncDispatch(
          db,
          generateTasksFromTemplates({ toDate: Date.now() }),
        );
      });
      setInterval(() => {
        void asyncDispatch(
          db,
          generateTasksFromTemplates({ toDate: Date.now() }),
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
    syncableDBTables: registeredUserSyncableTables,
    tableNameMap: registeredUserSyncableTableNameMap,
    afterInit: () => {},
  } satisfies SyncConfig;
};
