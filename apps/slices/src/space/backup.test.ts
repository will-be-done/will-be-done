import { describe, expect, it } from "vitest";
import {
  createAction,
  DB,
  execSync,
  insert,
  selectSync,
  syncDispatch,
} from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import {
  getSpaceBackup,
  loadSpaceBackup,
  normalizeSpaceBackup,
  type Backup,
} from "./backup";
import { dailyEntriesTable, dailyListsTable } from "./tables";
import { registeredSpaceSyncableTables } from "./syncMap";
import { dbIdTrait } from "../traits";

const baseBackup = {
  projects: [],
  dailyLists: [],
  dailyEntries: [],
  checklistItems: [],
};
const action = createAction();

const seedDailyEntry = action({
  name: "seedDailyEntryForBackup",
  args: {},
  handler: function* seedDailyEntryForBackup() {
    yield* insert(dailyListsTable, [
      {
        type: "dailyList",
        id: "list-1",
        date: "2026-07-23",
      },
    ]);
    yield* insert(dailyEntriesTable, [
      {
        type: "dailyEntry",
        id: "entry-1",
        taskId: "task-1",
        dailyListId: "list-1",
        orderToken: "a",
        createdAt: 1,
      },
    ]);
  },
});

describe("space backup compatibility", () => {
  it("normalizes the legacy category shape", () => {
    const normalized = normalizeSpaceBackup({
      ...baseBackup,
      projectCategories: [
        {
          id: "section-1",
          title: "Section",
          projectId: "project-1",
          createdAt: 1,
          orderToken: "a",
        },
      ],
      tasks: [
        {
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
      ],
      taskTemplates: [
        {
          id: "template-1",
          title: "Template",
          orderToken: "b",
          repeatRule: "FREQ=DAILY",
          createdAt: 1,
          lastGeneratedAt: 1,
          projectCategoryId: "section-1",
        },
      ],
    });

    expect(normalized.projectSections[0]?.id).toBe("section-1");
    expect(normalized.tasks[0]?.projectSectionId).toBe("section-1");
    expect(normalized.taskTemplates[0]?.projectSectionId).toBe("section-1");
  });

  it("keeps the new format semantically unchanged", () => {
    const backup: Backup = {
      ...baseBackup,
      projectSections: [],
      tasks: [],
      taskTemplates: [],
    };

    expect(normalizeSpaceBackup(backup)).toEqual(backup);
  });

  it("normalizes the legacy daily entry key", () => {
    const normalized = normalizeSpaceBackup({
      projects: [],
      dailyLists: [],
      checklistItems: [],
      projectSections: [],
      tasks: [],
      taskTemplates: [],
      dailyListProjections: [
        {
          id: "task-1",
          listId: "list-1",
          orderToken: "a",
          createdAt: 1,
        },
      ],
    });

    expect(normalized.dailyEntries).toEqual([
      expect.objectContaining({ id: "task-1", listId: "list-1" }),
    ]);
    expect(normalized).not.toHaveProperty("dailyListProjections");
  });

  it("prefers the new daily entry key when both keys are present", () => {
    const normalized = normalizeSpaceBackup({
      projects: [],
      dailyLists: [],
      checklistItems: [],
      projectSections: [],
      tasks: [],
      taskTemplates: [],
      dailyEntries: [],
      dailyListProjections: [
        {
          id: "legacy-task",
          listId: "list-1",
          orderToken: "a",
          createdAt: 1,
        },
      ],
    });

    expect(normalized.dailyEntries).toEqual([]);
    expect(normalized).not.toHaveProperty("dailyListProjections");
  });

  it("keeps only the latest legacy entry per task", () => {
    const db = new DB(new BptreeInmemDriver(), {
      traits: [dbIdTrait("space", "a0000000-0000-4000-8000-000000000001")],
    });
    execSync(db.loadTables(registeredSpaceSyncableTables));

    syncDispatch(
      db,
      loadSpaceBackup({
        backup: {
          projects: [
            {
              id: "project-1",
              title: "Project",
              icon: "",
              isInbox: false,
              orderToken: "a",
              createdAt: 1,
            },
          ],
          projectSections: [
            {
              id: "section-1",
              title: "Section",
              projectId: "project-1",
              orderToken: "a",
              createdAt: 1,
            },
          ],
          tasks: [
            {
              id: "task-1",
              title: "Legacy task",
              state: "todo",
              projectSectionId: "section-1",
              orderToken: "a",
              lastToggledAt: 1,
              createdAt: 1,
              templateId: null,
              templateDate: null,
            },
            {
              id: "task-2",
              title: "Canonical task",
              state: "todo",
              projectSectionId: "section-1",
              orderToken: "b",
              lastToggledAt: 1,
              createdAt: 1,
              templateId: null,
              templateDate: null,
            },
          ],
          dailyLists: [
            { id: "list-1", date: "2026-07-21" },
            { id: "list-2", date: "2026-07-22" },
          ],
          taskTemplates: [],
          checklistItems: [],
          dailyEntries: [
            {
              id: "projection-1",
              taskId: "task-1",
              listId: "list-1",
              orderToken: "old",
              createdAt: 10,
            },
            {
              id: "projection-2",
              taskId: "task-1",
              listId: "list-2",
              orderToken: "latest",
              createdAt: 20,
            },
            {
              id: "task-2",
              listId: "list-1",
              orderToken: "canonical",
              createdAt: 15,
            },
          ],
        },
      }),
    );

    const restored = selectSync(db, { selector: getSpaceBackup, args: {} });

    expect(restored.dailyEntries).toEqual([
      expect.objectContaining({
        taskId: "task-1",
        orderToken: "latest",
        createdAt: 20,
      }),
      expect.objectContaining({
        taskId: "task-2",
        orderToken: "canonical",
        createdAt: 15,
      }),
    ]);
  });

  it("exports only the canonical daily entry key", () => {
    const db = new DB(new BptreeInmemDriver());
    execSync(db.loadTables(registeredSpaceSyncableTables));
    syncDispatch(db, seedDailyEntry({}));

    const backup = selectSync(db, { selector: getSpaceBackup, args: {} });

    expect(backup.dailyEntries).toEqual([
      {
        id: "entry-1",
        taskId: "task-1",
        listId: "list-1",
        orderToken: "a",
        createdAt: 1,
      },
    ]);
    expect(backup).not.toHaveProperty("dailyListProjections");
  });
});
