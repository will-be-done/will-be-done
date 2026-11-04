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
import { dailyListGetId } from "./dailyLists";
import { registeredSpaceSyncableTables } from "./syncMap";
import {
  checklistItemsTable,
  checklistItemType,
  dailyEntriesTable,
  dailyEntryType,
  dailyListsTable,
  dailyListType,
  projectSectionsTable,
  projectSectionType,
  stashEntriesTable,
  stashEntryType,
  tasksTable,
  taskType,
  trashedTasksTable,
  type Task,
} from "./tables";
import { getSpaceBackup, loadSpaceBackup } from "./backup";
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
const stashedTask: Task = {
  ...task,
  id: "stashed",
  templateId: null,
  templateDate: null,
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
    const dailyListId = yield* dailyListGetId({ date: "2026-10-30" });
    yield* insert(dailyListsTable, [
      { type: dailyListType, id: dailyListId, date: "2026-10-30" },
    ]);
    yield* insert(tasksTable, [task, stashedTask]);
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
        dailyListId,
        createdAt: 0,
        time: "09:30",
      },
    ]);
    yield* insert(stashEntriesTable, [
      {
        type: stashEntryType,
        id: "stash",
        taskId: stashedTask.id,
        orderToken: "b",
        createdAt: 0,
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
      stashEntries: yield* selectFrom(stashEntriesTable, "byIds"),
      trashRows: yield* selectFrom(trashedTasksTable, "byIds"),
      inboxSectionId: yield* inboxProjectSectionId({}),
    };
  },
});

function createDB(spaceId = "a0000000-0000-4000-8000-000000000001") {
  const db = new DB(new BptreeInmemDriver(), {
    traits: [dbIdTrait("space", spaceId)],
  });
  execSync(db.loadTables(registeredSpaceSyncableTables));
  syncDispatch(db, seed({}));
  return db;
}

describe("trash", () => {
  test("trashing removes the task and restoring brings back its rows", () => {
    const db = createDB();
    syncDispatch(db, trashTasks({ ids: [task.id, stashedTask.id] }));

    const trashed = selectSync(db, { selector: trashedTasks, args: {} });
    expect(trashed).toHaveLength(2);
    const removed = selectSync(db, { selector: liveRows, args: {} });
    expect(removed).toMatchObject({
      tasks: [],
      checklistItems: [],
      dailyEntries: [],
      stashEntries: [],
    });
    // The sync contract only carries primitive row values.
    for (const row of removed.trashRows) {
      for (const value of Object.values(row)) {
        expect(value === null || typeof value !== "object").toBe(true);
      }
    }

    syncDispatch(db, restoreTrashedTasks({ ids: trashed.map(({ id }) => id) }));

    const restored = selectSync(db, { selector: liveRows, args: {} });
    expect(selectSync(db, { selector: trashedTasks, args: {} })).toEqual([]);
    expect(restored.tasks).toEqual([
      stashedTask,
      { ...task, templateId: null, templateDate: null },
    ]);
    expect(restored.checklistItems).toMatchObject([
      { id: "check", parentId: task.id, content: "Outline", state: "done" },
    ]);
    expect(restored.dailyEntries).toMatchObject([
      { id: "entry", taskId: task.id, time: "09:30" },
    ]);
    expect(restored.stashEntries).toMatchObject([
      { id: "stash", taskId: stashedTask.id, orderToken: "b" },
    ]);
  });

  test("backups keep trashed tasks restorable", () => {
    const db = createDB();
    syncDispatch(db, trashTasks({ ids: [task.id] }));
    const backup = selectSync(db, { selector: getSpaceBackup, args: {} });

    syncDispatch(db, loadSpaceBackup({ backup }));
    syncDispatch(db, restoreTrashedTasks({ ids: [task.id] }));

    const restored = selectSync(db, { selector: liveRows, args: {} });
    expect(restored.tasks.map(({ id }) => id)).toContain(task.id);
    expect(restored.checklistItems).toMatchObject([{ id: "check" }]);
  });

  test("backups move trashed entries onto the target space's DailyList", () => {
    const source = createDB();
    syncDispatch(source, trashTasks({ ids: [task.id] }));
    const backup = selectSync(source, { selector: getSpaceBackup, args: {} });
    backup.trashedTasks.push({
      id: "malformed",
      trashedAt: 0,
      snapshot: JSON.stringify({ task: { id: "malformed" } }),
    });
    backup.trashedTasks.push({
      id: "foreign",
      trashedAt: 0,
      snapshot: JSON.stringify({
        task: { ...task, id: "foreign" },
        checklistItems: [],
        dailyEntry: null,
        stashEntry: {
          type: stashEntryType,
          id: "foreign-stash",
          taskId: stashedTask.id,
          orderToken: "c",
          createdAt: 0,
        },
      }),
    });

    const target = createDB("b0000000-0000-4000-8000-000000000002");
    syncDispatch(target, loadSpaceBackup({ backup }));
    expect(
      selectSync(target, { selector: trashedTasks, args: {} }).map(
        ({ id }) => id,
      ),
    ).toEqual([task.id]);
    syncDispatch(target, restoreTrashedTasks({ ids: [task.id] }));

    const { dailyEntries } = selectSync(target, {
      selector: liveRows,
      args: {},
    });
    expect(dailyEntries).toMatchObject([
      {
        id: "entry",
        dailyListId: selectSync(target, {
          selector: dailyListGetId,
          args: { date: "2026-10-30" },
        }),
      },
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
    expect(tasks.find((t) => t.id === task.id)?.projectSectionId).toBe(
      inboxSectionId,
    );
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
