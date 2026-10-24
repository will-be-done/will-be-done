import {
  allTasks,
  createInboxIfNotExists,
  dailyEntriesTable,
  generateTasksFromTemplates,
  installProjectTaskStatsHooks,
  loadSpaceBackup,
  migrateProjectSectionTaskStats,
  migrateScheduledTodoTasks,
  projectSectionsTable,
  projectSectionTaskStatsTable,
  projectsTable,
  scheduledTodoTasksTable,
  stashEntriesTable,
} from "@will-be-done/slices/space";
import {
  asyncDispatch,
  execAsync,
  selectAsync,
  SubscribableDB,
} from "@will-be-done/hyperdb";
import { spaceDBConfig, type SyncConfig } from "@will-be-done/client/sync";
import { generateDemoBackup } from "@/lib/demoData";

const demoDbId = "e89b6c8f-1d6c-4bf4-9d27-478339773fc9";

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
          { table: dailyEntriesTable, scanIndex: "byIds" },
          { table: stashEntriesTable, scanIndex: "byIds" },
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
