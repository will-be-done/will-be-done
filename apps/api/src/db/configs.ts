import { changesTable, syncStateTable } from "@will-be-done/slices/common";
import { DBConfig } from "./db";
import {
  registeredUserSyncableTableNameMap,
  registeredUserSyncableTables,
} from "@will-be-done/slices/user";
import {
  assertUnreachable,
  projectSectionTaskStatsTable,
  registeredSpaceSyncableTableNameMap,
  registeredSpaceSyncableTables,
  scheduledTodoTasksTable,
  spaceMigrationsTable,
} from "@will-be-done/slices/space";
import { serverSyncTables } from "../sync/tables";

export const userDBConfig = (dbId: string) => {
  return {
    dbId,
    dbType: "user",
    persistDBTables: [
      ...registeredUserSyncableTables,
      changesTable,
      syncStateTable,
      ...serverSyncTables,
    ],
    tableNameMap: registeredUserSyncableTableNameMap,
    syncTableNamesInDependencyOrder: ["spaces"],
  } satisfies DBConfig;
};

export const spaceDBConfig = (dbId: string) => {
  return {
    dbId,
    dbType: "space",
    persistDBTables: [
      ...registeredSpaceSyncableTables,
      projectSectionTaskStatsTable,
      scheduledTodoTasksTable,
      spaceMigrationsTable,
      changesTable,
      syncStateTable,
      ...serverSyncTables,
    ],
    tableNameMap: registeredSpaceSyncableTableNameMap,
    syncTableNamesInDependencyOrder: [
      "projects",
      "project_sections",
      "daily_lists",
      "tasks",
      "task_templates",
      "checklist_items",
      "daily_entries",
      "stash_entries",
    ],
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
