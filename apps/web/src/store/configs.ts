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
  purgeExpiredTrash,
  registeredSpaceSyncableTableNameMap,
  registeredSpaceSyncableTables,
  scheduledTodoTasksTable,
  spaceMigrationsTable,
  stashEntriesTable,
  mindmapNodesTable,
  mindmapsTable,
  dailyEntriesTable,
  tasksTable,
  trashedTasks,
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
import { withoutUndo } from "@will-be-done/hyperdb/undo";
import { clientSyncV4Tables } from "./syncV4Tables";
import { installUndo } from "./undo";

// Background upkeep is not the user's edit, so it stays out of undo history.
const runSpaceMaintenance = (db: SubscribableDB) =>
  withoutUndo(db, (scopedDb) => {
    void asyncDispatch(
      scopedDb,
      generateTasksFromTemplates({ toDate: Date.now() }),
    );
    void asyncDispatch(scopedDb, purgeExpiredTrash({ now: Date.now() }));
  });

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
      ...clientSyncV4Tables,
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
          { table: changesTable, scanIndex: "byUpdatedAtId" },
          { table: tasksTable, scanIndex: "byIds" },
          { table: dailyListsTable, scanIndex: "byIds" },
          { table: dailyEntriesTable, scanIndex: "byIds" },
          { table: projectsTable, scanIndex: "byIds" },
          { table: projectSectionsTable, scanIndex: "byIds" },
          { table: stashEntriesTable, scanIndex: "byIds" },
          { table: mindmapsTable, scanIndex: "byIds" },
          { table: mindmapNodesTable, scanIndex: "byIds" },
          { table: projectSectionTaskStatsTable, scanIndex: "byIds" },
          { table: scheduledTodoTasksTable, scanIndex: "byIds" },
          { table: checklistItemsTable, scanIndex: "byIds" },
        ]),
      );
      await asyncDispatch(db, migrateProjectSectionTaskStats({}));
      await asyncDispatch(db, migrateScheduledTodoTasks({}));

      installUndo(db);
      const runMaintenance = () => runSpaceMaintenance(db);
      // To make load faster
      setTimeout(runMaintenance, 2000);
      setInterval(runMaintenance, 60 * 1000);
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
      const tasks = await selectAsync(db, { selector: allTasks, args: {} });
      const trash = await selectAsync(db, { selector: trashedTasks, args: {} });

      if (tasks.length === 0 && trash.length === 0) {
        await asyncDispatch(
          db,
          loadSpaceBackup({ backup: generateDemoBackup() }),
        );
      }

      await execAsync(
        db.preloadTables([
          { table: projectsTable, scanIndex: "byIds" },
          { table: projectSectionsTable, scanIndex: "byIds" },
          { table: dailyEntriesTable, scanIndex: "byIds" },
          { table: stashEntriesTable, scanIndex: "byIds" },
          { table: mindmapsTable, scanIndex: "byIds" },
          { table: mindmapNodesTable, scanIndex: "byIds" },
          { table: projectSectionTaskStatsTable, scanIndex: "byIds" },
          { table: scheduledTodoTasksTable, scanIndex: "byIds" },
        ]),
      );
      await asyncDispatch(db, migrateProjectSectionTaskStats({}));
      await asyncDispatch(db, migrateScheduledTodoTasks({}));

      installUndo(db);
      const runMaintenance = () => runSpaceMaintenance(db);
      // To make load faster
      setTimeout(runMaintenance);
      setInterval(runMaintenance, 60 * 1000);
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
      ...clientSyncV4Tables,
    ],
    syncableDBTables: registeredUserSyncableTables,
    tableNameMap: registeredUserSyncableTableNameMap,
    afterInit: () => {},
  } satisfies SyncConfig;
};
