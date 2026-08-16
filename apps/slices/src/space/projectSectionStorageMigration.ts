import {
  defineTable,
  deleteRows,
  insert,
  selectFrom,
  upsert,
  v,
} from "@will-be-done/hyperdb";
import { action, selector } from "../builders";
import { changesTable, type Change } from "../common/tables";
import {
  spaceMigrationsTable,
  projectSectionType,
  projectSectionsTable,
  taskType,
} from "./tables";

export const legacyProjectSectionsTableName = "project_categories";
export const projectSectionsTableName = "project_sections";
export const projectSectionStorageMigrationId = "project-section-storage-v1";

export type PersistedSpaceRow = Record<string, unknown> & { id: string };

export type MigratedSpaceRow = {
  tableName: string;
  row: PersistedSpaceRow;
  changed: boolean;
};

const moveProperty = (
  row: PersistedSpaceRow,
  legacyKey: string,
  nextKey: string,
): PersistedSpaceRow => {
  if (!(legacyKey in row)) return row;

  const nextRow = {
    ...row,
    [nextKey]: nextKey in row ? row[nextKey] : row[legacyKey],
  };
  delete nextRow[legacyKey];
  return nextRow;
};

export function migratePersistedSpaceRow(
  tableName: string,
  row: PersistedSpaceRow,
): MigratedSpaceRow {
  if (tableName === legacyProjectSectionsTableName) {
    return {
      tableName: projectSectionsTableName,
      row: {
        ...row,
        type: row.type === "projectCategory" ? "projectSection" : row.type,
      },
      changed: true,
    };
  }

  if (tableName === "tasks" || tableName === "task_templates") {
    const nextRow = moveProperty(row, "projectCategoryId", "projectSectionId");
    return { tableName, row: nextRow, changed: nextRow !== row };
  }

  if (tableName === "changes") {
    let nextRow = row;
    const changes = row.changes;
    if (
      typeof changes === "object" &&
      changes !== null &&
      "projectCategoryId" in changes
    ) {
      const nextChanges: Record<string, unknown> = {
        ...(changes as Record<string, unknown>),
        projectSectionId:
          "projectSectionId" in changes
            ? (changes as Record<string, unknown>).projectSectionId
            : (changes as Record<string, unknown>).projectCategoryId,
      };
      delete nextChanges.projectCategoryId;
      nextRow = { ...nextRow, changes: nextChanges };
    }

    if (row.tableName === legacyProjectSectionsTableName) {
      nextRow = {
        ...nextRow,
        id: `${projectSectionsTableName}:${String(row.entityId)}`,
        tableName: projectSectionsTableName,
      };
    }

    return { tableName, row: nextRow, changed: nextRow !== row };
  }

  return { tableName, row, changed: false };
}

export const legacyProjectSectionsMigrationTable = defineTable(
  legacyProjectSectionsTableName,
  {
    type: v.literal("projectCategory"),
    id: v.string(),
    orderToken: v.string(),
    title: v.string(),
    projectId: v.string(),
    createdAt: v.number(),
  },
).index("byIds", ["id"]);

export const tasksMigrationTable = defineTable("tasks", {
  type: v.literal(taskType),
  id: v.string(),
  title: v.string(),
  content: v.optional(v.string()),
  state: v.union(v.literal("todo"), v.literal("done")),
  projectCategoryId: v.optional(v.string()),
  projectSectionId: v.optional(v.string()),
  orderToken: v.string(),
  lastToggledAt: v.number(),
  nature: v.optional(
    v.union(v.literal("red"), v.literal("green"), v.literal("unknown")),
  ),
  createdAt: v.number(),
  templateId: v.union(v.string(), v.null()),
  templateDate: v.union(v.number(), v.null()),
}).index("byIds", ["id"]);

export const taskTemplatesMigrationTable = defineTable("task_templates", {
  type: v.literal("template"),
  id: v.string(),
  title: v.string(),
  content: v.optional(v.string()),
  orderToken: v.string(),
  repeatRule: v.string(),
  repeatRuleDtStart: v.number(),
  createdAt: v.number(),
  lastGeneratedAt: v.number(),
  projectCategoryId: v.optional(v.string()),
  projectSectionId: v.optional(v.string()),
  nature: v.optional(
    v.union(v.literal("red"), v.literal("green"), v.literal("unknown")),
  ),
}).index("byIds", ["id"]);

export const scheduledTodoTasksMigrationTable = defineTable(
  "scheduled_todo_tasks",
  {
    id: v.string(),
    scheduledAt: v.number(),
    projectCategoryId: v.optional(v.string()),
    projectSectionId: v.optional(v.string()),
  },
).index("byIds", ["id"]);

export const projectSectionStorageMigrationTables = [
  legacyProjectSectionsMigrationTable,
  projectSectionsTable,
  tasksMigrationTable,
  taskTemplatesMigrationTable,
  scheduledTodoTasksMigrationTable,
  changesTable,
  spaceMigrationsTable,
];

export const isProjectSectionStorageMigrationApplied = selector({
  name: "isProjectSectionStorageMigrationApplied",
  args: {},
  handler: function* isProjectSectionStorageMigrationApplied() {
    return Boolean(
      yield* selectFrom(spaceMigrationsTable, "byId")
        .where((q) => q.eq("id", projectSectionStorageMigrationId))
        .firstOr(null),
    );
  },
});

export const migrateLegacyProjectSections = action({
  name: "migrateLegacyProjectSections",
  args: {},
  handler: function* migrateLegacyProjectSections() {
    const existingMigration = yield* selectFrom(spaceMigrationsTable, "byId")
      .where((q) => q.eq("id", projectSectionStorageMigrationId))
      .firstOr(null);
    if (existingMigration) return;

    const legacySections = yield* selectFrom(
      legacyProjectSectionsMigrationTable,
      "byIds",
    );
    const currentSectionIds = new Set(
      (yield* selectFrom(projectSectionsTable, "byIds")).map((row) => row.id),
    );
    const sectionsToInsert = legacySections
      .filter((row) => !currentSectionIds.has(row.id))
      .map((row) => ({
        ...row,
        type: projectSectionType as "projectSection",
      }));
    if (sectionsToInsert.length > 0) {
      yield* insert(projectSectionsTable, sectionsToInsert);
    }

    const tasks = yield* selectFrom(tasksMigrationTable, "byIds");
    const tasksToMigrate = tasks.flatMap(
      ({ projectCategoryId, projectSectionId, ...task }) => {
        const nextProjectSectionId = projectSectionId ?? projectCategoryId;
        return projectCategoryId !== undefined &&
          nextProjectSectionId !== undefined
          ? [{ ...task, projectSectionId: nextProjectSectionId }]
          : [];
      },
    );
    if (tasksToMigrate.length > 0) {
      yield* upsert(tasksMigrationTable, tasksToMigrate);
    }

    const templates = yield* selectFrom(taskTemplatesMigrationTable, "byIds");
    const templatesToMigrate = templates.flatMap(
      ({ projectCategoryId, projectSectionId, ...template }) => {
        const nextProjectSectionId = projectSectionId ?? projectCategoryId;
        return projectCategoryId !== undefined &&
          nextProjectSectionId !== undefined
          ? [{ ...template, projectSectionId: nextProjectSectionId }]
          : [];
      },
    );
    if (templatesToMigrate.length > 0) {
      yield* upsert(taskTemplatesMigrationTable, templatesToMigrate);
    }

    const scheduledTasks = yield* selectFrom(
      scheduledTodoTasksMigrationTable,
      "byIds",
    );
    const scheduledTasksToMigrate = scheduledTasks.flatMap(
      ({ projectCategoryId, projectSectionId, ...scheduledTask }) => {
        const nextProjectSectionId = projectSectionId ?? projectCategoryId;
        return projectCategoryId !== undefined &&
          nextProjectSectionId !== undefined
          ? [{ ...scheduledTask, projectSectionId: nextProjectSectionId }]
          : [];
      },
    );
    if (scheduledTasksToMigrate.length > 0) {
      yield* upsert(scheduledTodoTasksMigrationTable, scheduledTasksToMigrate);
    }

    const changes = (yield* selectFrom(
      changesTable,
      "byUpdatedAtId",
    )) as Change[];
    const changeIds = new Set(changes.map((change) => change.id));
    const changesToUpsert: Change[] = [];
    const changeIdsToDelete: string[] = [];

    for (const change of changes) {
      const migrated = migratePersistedSpaceRow(changesTable.tableName, change);
      if (!migrated.changed) continue;

      const migratedChange = migrated.row as Change;
      if (migratedChange.id !== change.id) {
        changeIdsToDelete.push(change.id);
        if (changeIds.has(migratedChange.id)) continue;
      }
      changesToUpsert.push(migratedChange);
    }

    if (changesToUpsert.length > 0) {
      yield* upsert(changesTable, changesToUpsert);
    }
    if (changeIdsToDelete.length > 0) {
      yield* deleteRows(changesTable, changeIdsToDelete);
    }

    yield* upsert(spaceMigrationsTable, [
      {
        id: projectSectionStorageMigrationId,
        appliedAt: Date.now(),
      },
    ]);
  },
});
