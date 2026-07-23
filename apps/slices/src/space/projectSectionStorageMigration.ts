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
export const interimTaskSectionsTableName = "task_sections";
export const projectSectionsTableName = "project_sections";
export const projectSectionStorageMigrationId = "project-section-storage-v1";

export type PersistedSpaceRow = Record<string, unknown> & { id: string };

export type MigratedSpaceRow = {
  tableName: string;
  row: PersistedSpaceRow;
  changed: boolean;
};

const moveProperty = <Row extends Record<string, unknown>>(
  row: Row,
  legacyKey: string,
  nextKey: string,
): Row => {
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
  if (
    tableName === legacyProjectSectionsTableName ||
    tableName === interimTaskSectionsTableName
  ) {
    return {
      tableName: projectSectionsTableName,
      row: {
        ...row,
        type:
          row.type === "projectCategory" || row.type === "taskSection"
            ? "projectSection"
            : row.type,
      },
      changed: true,
    };
  }

  if (tableName === "tasks" || tableName === "task_templates") {
    const withoutInterimField = moveProperty(
      row,
      "taskSectionId",
      "projectSectionId",
    );
    const nextRow = moveProperty(
      withoutInterimField,
      "projectCategoryId",
      "projectSectionId",
    );
    return { tableName, row: nextRow, changed: nextRow !== row };
  }

  if (tableName === "changes") {
    let nextRow = row;
    const changes = row.changes;
    if (typeof changes === "object" && changes !== null) {
      const withoutInterimField = moveProperty(
        changes as Record<string, unknown>,
        "taskSectionId",
        "projectSectionId",
      );
      const nextChanges = moveProperty(
        withoutInterimField,
        "projectCategoryId",
        "projectSectionId",
      );
      if (nextChanges !== changes) {
        nextRow = { ...nextRow, changes: nextChanges };
      }
    }

    if (
      row.tableName === legacyProjectSectionsTableName ||
      row.tableName === interimTaskSectionsTableName
    ) {
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

export const interimTaskSectionsMigrationTable = defineTable(
  interimTaskSectionsTableName,
  {
    type: v.literal("taskSection"),
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
  taskSectionId: v.optional(v.string()),
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
  taskSectionId: v.optional(v.string()),
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
    taskSectionId: v.optional(v.string()),
    projectSectionId: v.optional(v.string()),
  },
).index("byIds", ["id"]);

export const projectSectionStorageMigrationTables = [
  legacyProjectSectionsMigrationTable,
  interimTaskSectionsMigrationTable,
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

    const legacyCategorySections = yield* selectFrom(
      legacyProjectSectionsMigrationTable,
      "byIds",
    );
    const interimTaskSections = yield* selectFrom(
      interimTaskSectionsMigrationTable,
      "byIds",
    );
    const currentSectionIds = new Set(
      (yield* selectFrom(projectSectionsTable, "byIds")).map((row) => row.id),
    );
    const sourceSectionsById = new Map(
      legacyCategorySections.map((row) => [
        row.id,
        {
          ...row,
          type: projectSectionType as "projectSection",
        },
      ]),
    );
    for (const row of interimTaskSections) {
      sourceSectionsById.set(row.id, {
        ...row,
        type: projectSectionType as "projectSection",
      });
    }
    const sectionsToInsert = [...sourceSectionsById.values()].filter(
      (row) => !currentSectionIds.has(row.id),
    );
    if (sectionsToInsert.length > 0) {
      yield* insert(projectSectionsTable, sectionsToInsert);
    }

    const tasks = yield* selectFrom(tasksMigrationTable, "byIds");
    const tasksToMigrate = tasks.flatMap(
      ({ projectCategoryId, taskSectionId, projectSectionId, ...task }) => {
        const nextProjectSectionId =
          projectSectionId ?? taskSectionId ?? projectCategoryId;
        return (projectCategoryId !== undefined ||
          taskSectionId !== undefined) &&
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
      ({ projectCategoryId, taskSectionId, projectSectionId, ...template }) => {
        const nextProjectSectionId =
          projectSectionId ?? taskSectionId ?? projectCategoryId;
        return (projectCategoryId !== undefined ||
          taskSectionId !== undefined) &&
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
      ({
        projectCategoryId,
        taskSectionId,
        projectSectionId,
        ...scheduledTask
      }) => {
        const nextProjectSectionId =
          projectSectionId ?? taskSectionId ?? projectCategoryId;
        return (projectCategoryId !== undefined ||
          taskSectionId !== undefined) &&
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
      "byUpdatedAt",
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
