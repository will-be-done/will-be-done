import { changesTable, syncStateTable } from "@will-be-done/slices/common";
import {
  allTasks,
  checklistItemsTable,
  createInboxIfNotExists,
  dailyListsTable,
  generateTasksFromTemplates,
  installProjectTaskStatsHooks,
  installSearchIndexHooks,
  loadSpaceBackup,
  migrateProjectSectionTaskStats,
  migrateScheduledTodoTasks,
  projectSectionsTable,
  projectSectionTaskStatsTable,
  projectsTable,
  notesTable,
  purgeExpiredTrash,
  registeredSpaceSyncableTableNameMap,
  registeredSpaceSyncableTables,
  scheduledTodoTasksTable,
  searchIndexTables,
  spaceMigrationsTable,
  stashEntriesTable,
  dailyEntriesTable,
  taskTemplatesTable,
  tasksTable,
  trashedTasks,
  trashedTasksTable,
} from "@will-be-done/slices/space";
import {
  registeredUserSyncableTableNameMap,
  registeredUserSyncableTables,
  spacesTable,
} from "@will-be-done/slices/user";
import type { SyncConfig } from "./syncTypes";
import { generateDemoBackup } from "@/lib/demoData";
import { Clock, Effect } from "effect";
import { clientSyncV4Tables } from "./syncV4Tables";
import { Database } from "./database";
import { scheduleMaintenance } from "./maintenance";
import { installUndo } from "./undo";

// Background upkeep is not the user's edit, so it stays out of undo history.
const runSpaceMaintenance = Effect.gen(function* () {
  const database = yield* Database;
  const now = yield* Clock.currentTimeMillis;
  yield* database.dispatchWithoutUndo([
    generateTasksFromTemplates({ toDate: now }),
    purgeExpiredTrash({ now }),
  ]);
});

const installSpaceHooks = Effect.gen(function* () {
  const { hyperDB } = yield* Database;
  installProjectTaskStatsHooks(hyperDB);
  installSearchIndexHooks(hyperDB);
});

const demoDbId = "e89b6c8f-1d6c-4bf4-9d27-478339773fc9";
export const spaceDbType = "space";

// Mindmap tables stay out so they load on demand when a mindmap is opened.
const spacePreloadedTables = [
  { table: changesTable, scanIndex: "byUpdatedAtId" },
  { table: tasksTable, scanIndex: "byIds" },
  { table: taskTemplatesTable, scanIndex: "byIds" },
  { table: notesTable, scanIndex: "byIds" },
  { table: trashedTasksTable, scanIndex: "byIds" },
  { table: dailyListsTable, scanIndex: "byIds" },
  { table: dailyEntriesTable, scanIndex: "byIds" },
  { table: projectsTable, scanIndex: "byIds" },
  { table: projectSectionsTable, scanIndex: "byIds" },
  { table: stashEntriesTable, scanIndex: "byIds" },
  { table: projectSectionTaskStatsTable, scanIndex: "byIds" },
  { table: scheduledTodoTasksTable, scanIndex: "byIds" },
  { table: checklistItemsTable, scanIndex: "byIds" },
] as const;

export const spaceDBConfig = (dbId: string) => {
  return {
    dbId,
    dbType: spaceDbType,
    persistDBTables: [
      ...registeredSpaceSyncableTables,
      projectSectionTaskStatsTable,
      scheduledTodoTasksTable,
      ...searchIndexTables,
      spaceMigrationsTable,
      changesTable,
      syncStateTable,
      ...clientSyncV4Tables,
    ],
    uncachedTables: searchIndexTables,
    syncableDBTables: registeredSpaceSyncableTables,
    tableNameMap: registeredSpaceSyncableTableNameMap,
    beforeInit: installSpaceHooks,
    afterInit: Effect.gen(function* () {
      const database = yield* Database;
      yield* database.dispatch(createInboxIfNotExists({}));
      yield* database.preload(spacePreloadedTables);
      yield* database.dispatch(migrateProjectSectionTaskStats({}));
      yield* database.dispatch(migrateScheduledTodoTasks({}));
      installUndo(database.hyperDB);
      // Delayed so the first maintenance run does not slow down loading.
      yield* scheduleMaintenance(runSpaceMaintenance, "2 seconds");
    }),
  } satisfies SyncConfig;
};

export const demoSpaceDBConfig = () => {
  return {
    ...spaceDBConfig(demoDbId),
    disableSync: true,
    beforeInit: installSpaceHooks,
    afterInit: Effect.gen(function* () {
      const database = yield* Database;
      yield* database.dispatch(createInboxIfNotExists({}));
      const tasks = yield* database.select({ selector: allTasks, args: {} });
      const trash = yield* database.select({
        selector: trashedTasks,
        args: {},
      });
      if (tasks.length === 0 && trash.length === 0) {
        yield* database.dispatch(
          loadSpaceBackup({ backup: generateDemoBackup() }),
        );
      }
      yield* database.preload(spacePreloadedTables);
      yield* database.dispatch(migrateProjectSectionTaskStats({}));
      yield* database.dispatch(migrateScheduledTodoTasks({}));
      installUndo(database.hyperDB);
      yield* scheduleMaintenance(runSpaceMaintenance, 0);
    }),
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
    afterInit: Effect.gen(function* () {
      yield* (yield* Database).preload([
        { table: changesTable, scanIndex: "byUpdatedAtId" },
        { table: spacesTable, scanIndex: "byIds" },
      ]);
    }),
  } satisfies SyncConfig;
};
