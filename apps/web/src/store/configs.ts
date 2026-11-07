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
  notesTable,
  purgeExpiredTrash,
  registeredSpaceSyncableTableNameMap,
  registeredSpaceSyncableTables,
  scheduledTodoTasksTable,
  spaceMigrationsTable,
  stashEntriesTable,
  dailyEntriesTable,
  taskTemplatesTable,
  tasksTable,
  trashedTasks,
  trashedTasksTable,
} from "@will-be-done/slices/space";
import { asyncDispatch, selectAsync } from "@will-be-done/hyperdb";
import {
  registeredUserSyncableTableNameMap,
  registeredUserSyncableTables,
  spacesTable,
} from "@will-be-done/slices/user";
import type { SyncConfig } from "./syncTypes";
import { generateDemoBackup } from "@/lib/demoData";
import { execAsync, type HyperDB } from "@will-be-done/hyperdb";
import { SubscribableDB } from "@will-be-done/hyperdb";
import { Clock, Effect } from "effect";
import { withoutUndo } from "@will-be-done/hyperdb/undo";
import { clientSyncV4Tables } from "./syncV4Tables";
import { scheduleMaintenance } from "./maintenance";
import { installUndo } from "./undo";

const dispatch = <T>(db: HyperDB, action: Generator<unknown, T, unknown>) =>
  Effect.promise(() => asyncDispatch(db, action));

// Background upkeep is not the user's edit, so it stays out of undo history.
// Both writes start inside withoutUndo, which only covers synchronous work.
const runSpaceMaintenance = (db: SubscribableDB) =>
  Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis;
    yield* Effect.promise(() =>
      Promise.all(
        withoutUndo(db, (scopedDb) => [
          asyncDispatch(scopedDb, generateTasksFromTemplates({ toDate: now })),
          asyncDispatch(scopedDb, purgeExpiredTrash({ now })),
        ]),
      ),
    );
  });

const preload = (
  db: SubscribableDB,
  tables: Parameters<SubscribableDB["preloadTables"]>[0],
) => Effect.promise(() => execAsync(db.preloadTables(tables)));

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
      spaceMigrationsTable,
      changesTable,
      syncStateTable,
      ...clientSyncV4Tables,
    ],
    syncableDBTables: registeredSpaceSyncableTables,
    tableNameMap: registeredSpaceSyncableTableNameMap,
    beforeInit: (db: SubscribableDB) =>
      Effect.sync(() => installProjectTaskStatsHooks(db)),
    afterInit: (db: SubscribableDB) =>
      Effect.gen(function* () {
        yield* dispatch(db, createInboxIfNotExists({}));
        yield* preload(db, spacePreloadedTables);
        yield* dispatch(db, migrateProjectSectionTaskStats({}));
        yield* dispatch(db, migrateScheduledTodoTasks({}));
        installUndo(db);
        // Delayed so the first maintenance run does not slow down loading.
        yield* scheduleMaintenance(runSpaceMaintenance(db), "2 seconds");
      }),
  } satisfies SyncConfig;
};

export const demoSpaceDBConfig = () => {
  return {
    ...spaceDBConfig(demoDbId),
    disableSync: true,
    beforeInit: (db: SubscribableDB) =>
      Effect.sync(() => installProjectTaskStatsHooks(db)),
    afterInit: (db: SubscribableDB) =>
      Effect.gen(function* () {
        yield* dispatch(db, createInboxIfNotExists({}));
        const tasks = yield* Effect.promise(() =>
          selectAsync(db, { selector: allTasks, args: {} }),
        );
        const trash = yield* Effect.promise(() =>
          selectAsync(db, { selector: trashedTasks, args: {} }),
        );
        if (tasks.length === 0 && trash.length === 0) {
          yield* dispatch(
            db,
            loadSpaceBackup({ backup: generateDemoBackup() }),
          );
        }
        yield* preload(db, spacePreloadedTables);
        yield* dispatch(db, migrateProjectSectionTaskStats({}));
        yield* dispatch(db, migrateScheduledTodoTasks({}));
        installUndo(db);
        yield* scheduleMaintenance(runSpaceMaintenance(db), 0);
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
    afterInit: (db: SubscribableDB) =>
      preload(db, [
        { table: changesTable, scanIndex: "byUpdatedAtId" },
        { table: spacesTable, scanIndex: "byIds" },
      ]),
  } satisfies SyncConfig;
};
