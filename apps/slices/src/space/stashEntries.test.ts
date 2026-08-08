import { describe, expect, test } from "vitest";
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
  doneStashEntryChildrenForDisplay,
  doneStashEntryChildrenIds,
  stashEntryChildrenIds,
  stashTasksByState,
  updateStashEntry,
} from "./stashEntries";
import {
  checklistItemsTable,
  dailyEntriesTable,
  dailyListsTable,
  projectSectionsTable,
  projectSectionType,
  projectsTable,
  projectType,
  stashEntriesTable,
  stashEntryType,
  tasksTable,
  taskType,
  type StashEntry,
  type Task,
} from "./tables";

const action = createAction();
const seedStash = action({
  name: "seedStashTasksByStateTest",
  args: {},
  handler: function* () {
    const tasks: Task[] = [
      {
        type: taskType,
        id: "todo-second",
        title: "Todo second",
        state: "todo",
        projectSectionId: "section",
        orderToken: "b",
        lastToggledAt: 0,
        nature: "unknown",
        createdAt: 0,
        templateId: null,
        templateDate: null,
      },
      {
        type: taskType,
        id: "done-old",
        title: "Done old",
        state: "done",
        projectSectionId: "section",
        orderToken: "c",
        lastToggledAt: 100,
        nature: "unknown",
        createdAt: 0,
        templateId: null,
        templateDate: null,
      },
      {
        type: taskType,
        id: "todo-first",
        title: "Todo first",
        state: "todo",
        projectSectionId: "section",
        orderToken: "a",
        lastToggledAt: 0,
        nature: "unknown",
        createdAt: 0,
        templateId: null,
        templateDate: null,
      },
      {
        type: taskType,
        id: "done-new",
        title: "Done new",
        state: "done",
        projectSectionId: "section",
        orderToken: "d",
        lastToggledAt: 200,
        nature: "unknown",
        createdAt: 0,
        templateId: null,
        templateDate: null,
      },
      {
        type: taskType,
        id: "done-zeta",
        title: "Done zeta",
        state: "done",
        projectSectionId: "section",
        orderToken: "e",
        lastToggledAt: 200,
        nature: "unknown",
        createdAt: 0,
        templateId: null,
        templateDate: null,
      },
      {
        type: taskType,
        id: "done-alpha",
        title: "Done alpha",
        state: "done",
        projectSectionId: "section",
        orderToken: "f",
        lastToggledAt: 200,
        nature: "unknown",
        createdAt: 0,
        templateId: null,
        templateDate: null,
      },
    ];
    const entries: StashEntry[] = [
      {
        type: stashEntryType,
        id: "entry-todo-first",
        taskId: "todo-first",
        orderToken: "a",
        createdAt: 0,
      },
      {
        type: stashEntryType,
        id: "entry-done-old",
        taskId: "done-old",
        orderToken: "b",
        createdAt: 0,
      },
      {
        type: stashEntryType,
        id: "entry-todo-second",
        taskId: "todo-second",
        orderToken: "c",
        createdAt: 0,
      },
      {
        type: stashEntryType,
        id: "entry-done-new",
        taskId: "done-new",
        orderToken: "d",
        createdAt: 0,
      },
      {
        type: stashEntryType,
        id: "entry-done-zeta",
        taskId: "done-zeta",
        orderToken: "e",
        createdAt: 0,
      },
      {
        type: stashEntryType,
        id: "entry-done-alpha",
        taskId: "done-alpha",
        orderToken: "f",
        createdAt: 0,
      },
      {
        type: stashEntryType,
        id: "entry-missing-task",
        taskId: "missing-task",
        orderToken: "g",
        createdAt: 0,
      },
    ];

    yield* insert(projectsTable, [
      {
        type: projectType,
        id: "project",
        title: "Project",
        icon: "",
        isInbox: false,
        orderToken: "a",
        createdAt: 0,
      },
    ]);
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
    yield* insert(tasksTable, tasks);
    yield* insert(stashEntriesTable, entries);
  },
});

describe("stash task selectors", () => {
  test("batch joins entries with tasks and applies state-specific ordering", () => {
    const db = new DB(new BptreeInmemDriver());
    execSync(
      db.loadTables([
        tasksTable,
        stashEntriesTable,
        projectsTable,
        projectSectionsTable,
        dailyEntriesTable,
        dailyListsTable,
        checklistItemsTable,
      ]),
    );
    syncDispatch(db, seedStash({}));

    expect(
      selectSync(db, {
        selector: stashTasksByState,
        args: { state: "todo" },
      }).map((task) => task.id),
    ).toEqual(["todo-first", "todo-second"]);
    expect(
      selectSync(db, {
        selector: stashTasksByState,
        args: { state: "done" },
      }).map((task) => task.id),
    ).toEqual(["done-alpha", "done-new", "done-zeta", "done-old"]);
    expect(
      selectSync(db, { selector: stashEntryChildrenIds, args: {} }),
    ).toEqual(["todo-first", "todo-second"]);
    expect(
      selectSync(db, { selector: doneStashEntryChildrenIds, args: {} }),
    ).toEqual(["done-alpha", "done-new", "done-zeta", "done-old"]);
    expect(
      selectSync(db, {
        selector: doneStashEntryChildrenForDisplay,
        args: {},
      }).map(({ item }) => item.id),
    ).toEqual(["done-alpha", "done-new", "done-zeta", "done-old"]);
  });

  test("rejects changing an entry taskId", () => {
    const db = new DB(new BptreeInmemDriver());
    execSync(
      db.loadTables([
        tasksTable,
        stashEntriesTable,
        projectsTable,
        projectSectionsTable,
        dailyEntriesTable,
        dailyListsTable,
        checklistItemsTable,
      ]),
    );
    syncDispatch(db, seedStash({}));

    expect(() =>
      syncDispatch(
        db,
        updateStashEntry({
          id: "entry-todo-first",
          entry: { taskId: "todo-second" },
        }),
      ),
    ).toThrow("Cannot change a stash entry taskId");
  });
});
