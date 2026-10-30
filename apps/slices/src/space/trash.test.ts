import { describe, expect, test } from "vitest";
import {
  createAction,
  createSelector,
  DB,
  deleteRows,
  execSync,
  insert,
  selectFrom,
  selectSync,
  syncDispatch,
} from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import { dbIdTrait } from "../traits";
import { inboxProjectSectionId } from "./projectSections";
import { registeredSpaceSyncableTables } from "./syncMap";
import {
  checklistItemsTable,
  checklistItemType,
  dailyEntriesTable,
  dailyEntryType,
  projectSectionsTable,
  projectSectionType,
  tasksTable,
  taskType,
  type Task,
} from "./tables";
import { trashTasks } from "./tasks";
import {
  purgeExpiredTrash,
  restoreTrashedTasks,
  TRASH_RETENTION_MS,
  trashedTasks,
} from "./trash";

const action = createAction();
const selector = createSelector();

const task: Task = {
  type: taskType,
  id: "task",
  title: "Write report",
  state: "todo",
  projectSectionId: "section",
  orderToken: "a",
  lastToggledAt: 0,
  nature: "unknown",
  createdAt: 0,
  templateId: "missing-template",
  templateDate: 1,
};

const seed = action({
  name: "seedTrashTest",
  args: {},
  handler: function* () {
    yield* insert(projectSectionsTable, [
      {
        type: projectSectionType,
        id: "section",
        title: "Section",
        orderToken: "a",
        projectId: "project",
        createdAt: 0,
      },
    ]);
    yield* insert(tasksTable, [task]);
    yield* insert(checklistItemsTable, [
      {
        type: checklistItemType,
        id: "check",
        parentId: task.id,
        parentType: taskType,
        orderToken: "a",
        state: "done",
        content: "Outline",
        createdAt: 0,
        checkedAt: 5,
      },
    ]);
    yield* insert(dailyEntriesTable, [
      {
        type: dailyEntryType,
        id: "entry",
        taskId: task.id,
        orderToken: "a",
        dailyListId: "list",
        createdAt: 0,
        time: "09:30",
      },
    ]);
  },
});

const removeSection = action({
  name: "removeSectionTrashTest",
  args: {},
  handler: function* () {
    yield* deleteRows(projectSectionsTable, ["section"]);
  },
});

const liveRows = selector({
  name: "liveRowsTrashTest",
  args: {},
  handler: function* () {
    return {
      tasks: yield* selectFrom(tasksTable, "byIds"),
      checklistItems: yield* selectFrom(checklistItemsTable, "byIds"),
      dailyEntries: yield* selectFrom(dailyEntriesTable, "byIds"),
      inboxSectionId: yield* inboxProjectSectionId({}),
    };
  },
});

function createDB() {
  const db = new DB(new BptreeInmemDriver(), {
    traits: [dbIdTrait("space", "a0000000-0000-4000-8000-000000000001")],
  });
  execSync(db.loadTables(registeredSpaceSyncableTables));
  syncDispatch(db, seed({}));
  return db;
}

describe("trash", () => {
  test("trashing removes the task and restoring brings back its rows", () => {
    const db = createDB();
    syncDispatch(db, trashTasks({ ids: [task.id] }));

    const [trashed] = selectSync(db, { selector: trashedTasks, args: {} });
    expect(trashed).toBeDefined();
    expect(selectSync(db, { selector: liveRows, args: {} })).toMatchObject({
      tasks: [],
      checklistItems: [],
      dailyEntries: [],
    });

    syncDispatch(db, restoreTrashedTasks({ ids: [trashed!.id] }));

    const restored = selectSync(db, { selector: liveRows, args: {} });
    expect(selectSync(db, { selector: trashedTasks, args: {} })).toEqual([]);
    expect(restored.tasks).toEqual([
      { ...task, templateId: null, templateDate: null },
    ]);
    expect(restored.checklistItems).toMatchObject([
      { id: "check", parentId: task.id, content: "Outline", state: "done" },
    ]);
    expect(restored.dailyEntries).toMatchObject([
      { id: "entry", taskId: task.id, dailyListId: "list", time: "09:30" },
    ]);
  });

  test("restores into the inbox when the task's section is gone", () => {
    const db = createDB();
    syncDispatch(db, trashTasks({ ids: [task.id] }));
    syncDispatch(db, removeSection({}));
    const [trashed] = selectSync(db, { selector: trashedTasks, args: {} });

    syncDispatch(db, restoreTrashedTasks({ ids: [trashed!.id] }));

    const { tasks, inboxSectionId } = selectSync(db, {
      selector: liveRows,
      args: {},
    });
    expect(tasks.map((t) => t.projectSectionId)).toEqual([inboxSectionId]);
  });

  test("purges only rows trashed more than 30 days ago", () => {
    const db = createDB();
    syncDispatch(db, trashTasks({ ids: [task.id] }));
    const [trashed] = selectSync(db, { selector: trashedTasks, args: {} });
    const expiresAt = trashed!.trashedAt + TRASH_RETENTION_MS;

    syncDispatch(db, purgeExpiredTrash({ now: expiresAt }));
    expect(selectSync(db, { selector: trashedTasks, args: {} })).toHaveLength(
      1,
    );

    syncDispatch(db, purgeExpiredTrash({ now: expiresAt + 1 }));
    expect(selectSync(db, { selector: trashedTasks, args: {} })).toEqual([]);
  });
});
