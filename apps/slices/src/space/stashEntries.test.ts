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
  doneStashEntryChildrenIds,
  stashEntryChildrenIds,
  stashTasksByState,
} from "./stashEntries";
import {
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
    ];
    const entries: StashEntry[] = [
      { type: stashEntryType, id: "todo-first", orderToken: "a", createdAt: 0 },
      { type: stashEntryType, id: "done-old", orderToken: "b", createdAt: 0 },
      {
        type: stashEntryType,
        id: "todo-second",
        orderToken: "c",
        createdAt: 0,
      },
      { type: stashEntryType, id: "done-new", orderToken: "d", createdAt: 0 },
      {
        type: stashEntryType,
        id: "missing-task",
        orderToken: "e",
        createdAt: 0,
      },
    ];

    yield* insert(tasksTable, tasks);
    yield* insert(stashEntriesTable, entries);
  },
});

describe("stash task selectors", () => {
  test("batch joins entries with tasks and applies state-specific ordering", () => {
    const db = new DB(new BptreeInmemDriver());
    execSync(db.loadTables([tasksTable, stashEntriesTable]));
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
    ).toEqual(["done-new", "done-old"]);
    expect(
      selectSync(db, { selector: stashEntryChildrenIds, args: {} }),
    ).toEqual(["todo-first", "todo-second"]);
    expect(
      selectSync(db, { selector: doneStashEntryChildrenIds, args: {} }),
    ).toEqual(["done-new", "done-old"]);
  });
});
