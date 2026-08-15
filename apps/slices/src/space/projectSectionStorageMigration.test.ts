import { describe, expect, it } from "vitest";
import {
  createAction,
  createSelector,
  DB,
  execSync,
  insert,
  selectFrom,
  selectSync,
  syncDispatch,
} from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import { changesTable } from "../common";
import {
  legacyProjectSectionsMigrationTable,
  migrateLegacyProjectSections,
  scheduledTodoTasksMigrationTable,
  projectSectionStorageMigrationTables,
  taskTemplatesMigrationTable,
  tasksMigrationTable,
} from "./projectSectionStorageMigration";
import {
  scheduledTodoTasksTable,
  spaceMigrationsTable,
  projectSectionsTable,
  taskTemplatesTable,
  tasksTable,
} from "./tables";

const action = createAction();
const selector = createSelector();

const seedLegacyRows = action({
  name: "seedLegacyProjectSectionRows",
  args: {},
  handler: function* seedLegacyRows() {
    yield* insert(legacyProjectSectionsMigrationTable, [
      {
        type: "projectCategory",
        id: "section-1",
        title: "Legacy section",
        projectId: "project-1",
        orderToken: "a",
        createdAt: 1,
      },
    ]);
    yield* insert(tasksMigrationTable, [
      {
        type: "task",
        id: "task-1",
        title: "Task",
        state: "todo",
        projectCategoryId: "section-1",
        orderToken: "a",
        lastToggledAt: 1,
        createdAt: 1,
        templateId: null,
        templateDate: null,
      },
      {
        type: "task",
        id: "task-partially-migrated",
        title: "Partially migrated task",
        state: "todo",
        projectCategoryId: "legacy-section",
        projectSectionId: "section-1",
        orderToken: "b",
        lastToggledAt: 1,
        createdAt: 1,
        templateId: null,
        templateDate: null,
      },
    ]);
    yield* insert(taskTemplatesMigrationTable, [
      {
        type: "template",
        id: "template-1",
        title: "Template",
        orderToken: "b",
        repeatRule: "FREQ=DAILY",
        repeatRuleDtStart: 1,
        createdAt: 1,
        lastGeneratedAt: 1,
        projectCategoryId: "section-1",
      },
    ]);
    yield* insert(scheduledTodoTasksMigrationTable, [
      {
        id: "task-1",
        scheduledAt: 2,
        projectCategoryId: "section-1",
      },
      {
        id: "task-partially-migrated",
        scheduledAt: 3,
        projectCategoryId: "legacy-section",
        projectSectionId: "section-1",
      },
    ]);
    yield* insert(changesTable, [
      {
        id: "project_categories:section-1",
        entityId: "section-1",
        tableName: "project_categories",
        createdAt: "1-client",
        updatedAt: "2-client",
        deletedAt: "2-client",
        clientId: "client",
        changes: { type: "1-client" },
      },
      {
        id: "tasks:task-1",
        entityId: "task-1",
        tableName: "tasks",
        createdAt: "1-client",
        updatedAt: "3-client",
        deletedAt: null,
        clientId: "client",
        changes: {
          title: "1-client",
          projectCategoryId: "3-client",
          projectSectionId: "4-client",
        },
      },
    ]);
  },
});

const migratedRows = selector({
  name: "migratedProjectSectionRows",
  args: {},
  handler: function* migratedRows() {
    return {
      sections: yield* selectFrom(projectSectionsTable, "byIds"),
      tasks: yield* selectFrom(tasksTable, "byIds"),
      templates: yield* selectFrom(taskTemplatesTable, "byIds"),
      scheduledTasks: yield* selectFrom(scheduledTodoTasksTable, "byIds"),
      changes: yield* selectFrom(changesTable, "byUpdatedAtId"),
      migrations: yield* selectFrom(spaceMigrationsTable, "byIds"),
    };
  },
});

const seedLargeLegacyStore = action({
  name: "seedLargeLegacyProjectSectionStore",
  args: {},
  handler: function* seedLargeLegacyStore() {
    yield* insert(
      tasksMigrationTable,
      Array.from({ length: 1_500 }, (_, index) => ({
        type: "task" as const,
        id: `large-task-${index}`,
        title: `Task ${index}`,
        state: "todo" as const,
        projectCategoryId: "section-1",
        orderToken: String(index).padStart(4, "0"),
        lastToggledAt: 1,
        createdAt: 1,
        templateId: null,
        templateDate: null,
      })),
    );
  },
});

describe("ProjectSection storage migration", () => {
  it("copies legacy sections and rewrites dependent rows and sync metadata", () => {
    const db = new DB(new BptreeInmemDriver());
    execSync(db.loadTables(projectSectionStorageMigrationTables));
    syncDispatch(db, seedLegacyRows({}));

    syncDispatch(db, migrateLegacyProjectSections({}));
    const firstResult = selectSync(db, {
      selector: migratedRows,
      args: {},
    });

    expect(firstResult.sections).toEqual([
      expect.objectContaining({
        id: "section-1",
        type: "projectSection",
      }),
    ]);
    expect(firstResult.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "task-1",
          projectSectionId: "section-1",
        }),
        expect.objectContaining({
          id: "task-partially-migrated",
          projectSectionId: "section-1",
        }),
      ]),
    );
    for (const task of firstResult.tasks) {
      expect(task).not.toHaveProperty("projectCategoryId");
    }
    expect(firstResult.templates[0]).toEqual(
      expect.objectContaining({
        projectSectionId: "section-1",
      }),
    );
    expect(firstResult.scheduledTasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "task-1",
          projectSectionId: "section-1",
        }),
        expect.objectContaining({
          id: "task-partially-migrated",
          projectSectionId: "section-1",
        }),
      ]),
    );
    for (const scheduledTask of firstResult.scheduledTasks) {
      expect(scheduledTask).not.toHaveProperty("projectCategoryId");
    }

    const sectionChange = firstResult.changes.find(
      (change) => change.entityId === "section-1",
    );
    expect(sectionChange).toEqual(
      expect.objectContaining({
        id: "project_sections:section-1",
        tableName: "project_sections",
        deletedAt: "2-client",
      }),
    );
    const taskChange = firstResult.changes.find(
      (change) => change.entityId === "task-1",
    );
    expect(taskChange?.changes).toEqual({
      title: "1-client",
      projectSectionId: "4-client",
    });
    expect(firstResult.migrations).toEqual([
      expect.objectContaining({ id: "project-section-storage-v1" }),
    ]);

    syncDispatch(db, migrateLegacyProjectSections({}));
    const secondResult = selectSync(db, {
      selector: migratedRows,
      args: {},
    });
    expect(secondResult).toEqual(firstResult);
  });

  it("migrates a large store in one guarded startup pass", () => {
    const db = new DB(new BptreeInmemDriver());
    execSync(db.loadTables(projectSectionStorageMigrationTables));
    syncDispatch(db, seedLargeLegacyStore({}));

    syncDispatch(db, migrateLegacyProjectSections({}));
    const result = selectSync(db, {
      selector: migratedRows,
      args: {},
    });

    expect(result.tasks).toHaveLength(1_500);
    expect(result.tasks.find((task) => task.id === "large-task-1499")).toEqual(
      expect.objectContaining({
        id: "large-task-1499",
        projectSectionId: "section-1",
      }),
    );
    expect(result.tasks.every((task) => !("projectCategoryId" in task))).toBe(
      true,
    );
    expect(result.migrations).toHaveLength(1);
  });
});
