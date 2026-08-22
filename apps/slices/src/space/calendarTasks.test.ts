import { describe, expect, it } from "vitest";
import {
  DB,
  createAction,
  createSelector,
  execSync,
  insert,
  selectFrom,
  selectSync,
  syncDispatch,
} from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import { dbIdTrait } from "../traits";
import {
  hasTimeBlock,
  setTaskTimeBlock,
  taskTimeBlockEnd,
} from "./calendarTasks";
import { defaultTask } from "./tasks";
import {
  collapseCompletedTimeBlock,
  completedDurationMinutes,
  packDailyListTimeBlocks,
  placeDuration,
  startsAtFromDateAndMinutes,
  workWindows,
} from "./timeBlockPacking";
import { DEFAULT_DAY_START_MINUTES } from "./spacePreferences";
import {
  DailyEntry,
  dailyEntriesTable,
  dailyEntryType,
  dailyListsTable,
  dailyListType,
  spacePreferencesTable,
  Task,
  tasksTable,
  taskType,
} from "./tables";

const action = createAction();
const selector = createSelector();

function runSelector<T>(db: DB, handler: () => Generator<unknown, T, unknown>) {
  const testSelector = selector({
    name: "testSelector",
    args: {},
    handler,
  });
  return selectSync(db, { selector: testSelector, args: {} });
}

describe("hasTimeBlock", () => {
  it("requires both a start and a positive duration", () => {
    expect(hasTimeBlock(defaultTask)).toBe(false);
    expect(hasTimeBlock({ ...defaultTask, startsAt: 1 })).toBe(false);
    expect(
      hasTimeBlock({ ...defaultTask, startsAt: 1, durationMinutes: 0 }),
    ).toBe(false);
    expect(
      hasTimeBlock({ ...defaultTask, startsAt: 1, durationMinutes: 25 }),
    ).toBe(true);
  });
});

describe("taskTimeBlockEnd", () => {
  it("adds duration onto the start", () => {
    expect(
      taskTimeBlockEnd({
        ...defaultTask,
        startsAt: 1_000,
        durationMinutes: 30,
      }),
    ).toBe(1_000 + 30 * 60 * 1000);
  });
});

describe("workWindows", () => {
  it("skips breaks between start and end", () => {
    expect(
      workWindows(9 * 60, 18 * 60, [
        { startMinutes: 13 * 60, endMinutes: 14 * 60 },
      ]),
    ).toEqual([
      { startMinutes: 9 * 60, endMinutes: 13 * 60 },
      { startMinutes: 14 * 60, endMinutes: 18 * 60 },
    ]);
  });
});

describe("placeDuration", () => {
  it("places a block after a gap that is too small", () => {
    const windows = workWindows(9 * 60, 12 * 60, [
      { startMinutes: 9 * 60 + 15, endMinutes: 10 * 60 },
    ]);
    expect(placeDuration(windows, 30).startMinutes).toBe(10 * 60);
  });
});

describe("packDailyListTimeBlocks", () => {
  it("leaves duration-only tasks untimed", () => {
    const db = new DB(new BptreeInmemDriver(), {
      traits: [dbIdTrait("space", "a0000000-0000-4000-8000-000000000001")],
    });
    execSync(
      db.loadTables([
        tasksTable,
        dailyListsTable,
        dailyEntriesTable,
        spacePreferencesTable,
      ]),
    );

    const seed = action({
      name: "seedPackedDay",
      args: {},
      handler: function* seedPackedDay() {
        yield* insert(dailyListsTable, [
          {
            type: dailyListType,
            id: "list-1",
            date: "2026-08-21",
          },
        ]);
        yield* insert(tasksTable, [
          {
            ...defaultTask,
            type: taskType,
            id: "task-a",
            title: "First",
            durationMinutes: 30,
          },
          {
            ...defaultTask,
            type: taskType,
            id: "task-b",
            title: "Second",
            durationMinutes: 60,
          },
          {
            ...defaultTask,
            type: taskType,
            id: "task-c",
            title: "Untimed",
          },
        ]);
        yield* insert(dailyEntriesTable, [
          {
            type: dailyEntryType,
            id: "entry-a",
            taskId: "task-a",
            dailyListId: "list-1",
            orderToken: "a",
            createdAt: 1,
          },
          {
            type: dailyEntryType,
            id: "entry-c",
            taskId: "task-c",
            dailyListId: "list-1",
            orderToken: "b",
            createdAt: 2,
          },
          {
            type: dailyEntryType,
            id: "entry-b",
            taskId: "task-b",
            dailyListId: "list-1",
            orderToken: "c",
            createdAt: 3,
          },
        ] satisfies DailyEntry[]);
      },
    });

    syncDispatch(db, seed({}));
    syncDispatch(db, packDailyListTimeBlocks({ dailyListId: "list-1" }));

    const tasks = runSelector<Task[]>(db, function* () {
      return (yield* selectFrom(tasksTable, "byIds").where((q) => q)) as Task[];
    });
    const byId = new Map(tasks.map((task) => [task.id, task]));

    expect(byId.get("task-a")?.startsAt).toBeUndefined();
    expect(byId.get("task-b")?.startsAt).toBeUndefined();
    expect(byId.get("task-c")?.startsAt).toBeUndefined();
  });

  it("reflows unpinned tasks that already have a start time", () => {
    const db = new DB(new BptreeInmemDriver(), {
      traits: [dbIdTrait("space", "a0000000-0000-4000-8000-000000000001")],
    });
    execSync(
      db.loadTables([
        tasksTable,
        dailyListsTable,
        dailyEntriesTable,
        spacePreferencesTable,
      ]),
    );

    const seed = action({
      name: "seedUnpinnedTimed",
      args: {},
      handler: function* seedUnpinnedTimed() {
        yield* insert(dailyListsTable, [
          {
            type: dailyListType,
            id: "list-1",
            date: "2026-08-21",
          },
        ]);
        yield* insert(tasksTable, [
          {
            ...defaultTask,
            type: taskType,
            id: "task-a",
            title: "First",
            durationMinutes: 30,
            startsAt: startsAtFromDateAndMinutes("2026-08-21", 14 * 60),
          },
          {
            ...defaultTask,
            type: taskType,
            id: "task-b",
            title: "Second",
            durationMinutes: 60,
            startsAt: startsAtFromDateAndMinutes("2026-08-21", 11 * 60),
          },
        ]);
        yield* insert(dailyEntriesTable, [
          {
            type: dailyEntryType,
            id: "entry-a",
            taskId: "task-a",
            dailyListId: "list-1",
            orderToken: "a",
            createdAt: 1,
          },
          {
            type: dailyEntryType,
            id: "entry-b",
            taskId: "task-b",
            dailyListId: "list-1",
            orderToken: "c",
            createdAt: 3,
          },
        ] satisfies DailyEntry[]);
      },
    });

    syncDispatch(db, seed({}));
    syncDispatch(db, packDailyListTimeBlocks({ dailyListId: "list-1" }));

    const tasks = runSelector<Task[]>(db, function* () {
      return (yield* selectFrom(tasksTable, "byIds").where((q) => q)) as Task[];
    });
    const byId = new Map(tasks.map((task) => [task.id, task]));
    const dayStart = startsAtFromDateAndMinutes(
      "2026-08-21",
      DEFAULT_DAY_START_MINUTES,
    );

    expect(byId.get("task-a")?.startsAt).toBe(dayStart);
    expect(byId.get("task-b")?.startsAt).toBe(dayStart + 30 * 60 * 1000);
  });

  it("skips breaks and leaves pinned tasks where they are", () => {
    const db = new DB(new BptreeInmemDriver(), {
      traits: [dbIdTrait("space", "a0000000-0000-4000-8000-000000000001")],
    });
    execSync(
      db.loadTables([
        tasksTable,
        dailyListsTable,
        dailyEntriesTable,
        spacePreferencesTable,
      ]),
    );

    const lunchStart = 9 * 60 + 30;
    const pinnedStart = startsAtFromDateAndMinutes("2026-08-21", 11 * 60);
    const seed = action({
      name: "seedPinnedAndBreaks",
      args: {},
      handler: function* seedPinnedAndBreaks() {
        yield* insert(spacePreferencesTable, [
          {
            type: "spacePreferences",
            id: "space-preferences",
            dayStartMinutes: 9 * 60,
            dayEndMinutes: 18 * 60,
            breaks: [
              {
                id: "lunch",
                startMinutes: lunchStart,
                endMinutes: lunchStart + 30,
              },
            ],
          },
        ]);
        yield* insert(dailyListsTable, [
          {
            type: dailyListType,
            id: "list-1",
            date: "2026-08-21",
          },
        ]);
        yield* insert(tasksTable, [
          {
            ...defaultTask,
            type: taskType,
            id: "task-a",
            title: "Auto",
            durationMinutes: 30,
          },
          {
            ...defaultTask,
            type: taskType,
            id: "task-b",
            title: "Pinned",
            durationMinutes: 30,
            startsAt: pinnedStart,
            timeBlockPinned: true,
          },
        ]);
        yield* insert(dailyEntriesTable, [
          {
            type: dailyEntryType,
            id: "entry-a",
            taskId: "task-a",
            dailyListId: "list-1",
            orderToken: "a",
            createdAt: 1,
          },
          {
            type: dailyEntryType,
            id: "entry-b",
            taskId: "task-b",
            dailyListId: "list-1",
            orderToken: "b",
            createdAt: 2,
          },
        ] satisfies DailyEntry[]);
      },
    });

    syncDispatch(db, seed({}));
    syncDispatch(db, packDailyListTimeBlocks({ dailyListId: "list-1" }));

    const tasks = runSelector<Task[]>(db, function* () {
      return (yield* selectFrom(tasksTable, "byIds").where((q) => q)) as Task[];
    });
    const byId = new Map(tasks.map((task) => [task.id, task]));

    expect(byId.get("task-a")?.startsAt).toBeUndefined();
    expect(byId.get("task-b")?.startsAt).toBe(pinnedStart);
  });
});

describe("setTaskTimeBlock", () => {
  it("sets duration without assigning a start time", () => {
    const db = new DB(new BptreeInmemDriver(), {
      traits: [dbIdTrait("space", "a0000000-0000-4000-8000-000000000001")],
    });
    execSync(
      db.loadTables([
        tasksTable,
        dailyListsTable,
        dailyEntriesTable,
        spacePreferencesTable,
      ]),
    );

    const seed = action({
      name: "seedDurationOnly",
      args: {},
      handler: function* seedDurationOnly() {
        yield* insert(dailyListsTable, [
          {
            type: dailyListType,
            id: "list-1",
            date: "2026-08-21",
          },
        ]);
        yield* insert(tasksTable, [
          {
            ...defaultTask,
            type: taskType,
            id: "task-a",
            title: "Timed estimate",
          },
        ]);
        yield* insert(dailyEntriesTable, [
          {
            type: dailyEntryType,
            id: "entry-a",
            taskId: "task-a",
            dailyListId: "list-1",
            orderToken: "a",
            createdAt: 1,
          },
        ] satisfies DailyEntry[]);
      },
    });

    syncDispatch(db, seed({}));
    const updated = syncDispatch(
      db,
      setTaskTimeBlock({ id: "task-a", durationMinutes: 45 }),
    ) as Task;

    expect(updated.durationMinutes).toBe(45);
    expect(updated.startsAt).toBeUndefined();
  });

  it("clears start time without dropping duration", () => {
    const db = new DB(new BptreeInmemDriver(), {
      traits: [dbIdTrait("space", "a0000000-0000-4000-8000-000000000001")],
    });
    execSync(
      db.loadTables([
        tasksTable,
        dailyListsTable,
        dailyEntriesTable,
        spacePreferencesTable,
      ]),
    );

    const startsAt = startsAtFromDateAndMinutes("2026-08-21", 11 * 60);
    const seed = action({
      name: "seedTimedTask",
      args: {},
      handler: function* seedTimedTask() {
        yield* insert(dailyListsTable, [
          {
            type: dailyListType,
            id: "list-1",
            date: "2026-08-21",
          },
        ]);
        yield* insert(tasksTable, [
          {
            ...defaultTask,
            type: taskType,
            id: "task-a",
            title: "Timed",
            durationMinutes: 45,
            startsAt,
            timeBlockPinned: true,
          },
        ]);
        yield* insert(dailyEntriesTable, [
          {
            type: dailyEntryType,
            id: "entry-a",
            taskId: "task-a",
            dailyListId: "list-1",
            orderToken: "a",
            createdAt: 1,
          },
        ] satisfies DailyEntry[]);
      },
    });

    syncDispatch(db, seed({}));
    const updated = syncDispatch(
      db,
      setTaskTimeBlock({ id: "task-a", startsAt: null }),
    ) as Task;

    expect(updated.durationMinutes).toBe(45);
    expect(updated.startsAt).toBeUndefined();
    expect(updated.timeBlockPinned).toBeUndefined();
  });
});

describe("completedDurationMinutes", () => {
  const startsAt = startsAtFromDateAndMinutes("2026-08-21", 9 * 60);

  it("returns null when the task already reached its planned end", () => {
    expect(
      completedDurationMinutes(startsAt, 30, startsAt + 30 * 60 * 1000),
    ).toBeNull();
    expect(
      completedDurationMinutes(startsAt, 30, startsAt + 45 * 60 * 1000),
    ).toBeNull();
  });

  it("snaps elapsed time down to five minutes at least", () => {
    expect(completedDurationMinutes(startsAt, 30, startsAt)).toBe(5);
    expect(
      completedDurationMinutes(startsAt, 30, startsAt + 18 * 60 * 1000),
    ).toBe(20);
  });
});

describe("collapseCompletedTimeBlock", () => {
  it("shrinks an early finish and pulls later tasks forward", () => {
    const db = new DB(new BptreeInmemDriver(), {
      traits: [dbIdTrait("space", "a0000000-0000-4000-8000-000000000001")],
    });
    execSync(
      db.loadTables([
        tasksTable,
        dailyListsTable,
        dailyEntriesTable,
        spacePreferencesTable,
      ]),
    );

    const firstStart = startsAtFromDateAndMinutes("2026-08-21", 9 * 60);
    const secondStart = startsAtFromDateAndMinutes("2026-08-21", 10 * 60);
    const seed = action({
      name: "seedStackedBlocks",
      args: {},
      handler: function* seedStackedBlocks() {
        yield* insert(dailyListsTable, [
          {
            type: dailyListType,
            id: "list-1",
            date: "2026-08-21",
          },
        ]);
        yield* insert(tasksTable, [
          {
            ...defaultTask,
            type: taskType,
            id: "task-a",
            title: "First",
            state: "done",
            durationMinutes: 60,
            startsAt: firstStart,
            timeBlockPinned: true,
          },
          {
            ...defaultTask,
            type: taskType,
            id: "task-b",
            title: "Second",
            durationMinutes: 60,
            startsAt: secondStart,
            timeBlockPinned: true,
          },
        ]);
        yield* insert(dailyEntriesTable, [
          {
            type: dailyEntryType,
            id: "entry-a",
            taskId: "task-a",
            dailyListId: "list-1",
            orderToken: "a",
            createdAt: 1,
          },
          {
            type: dailyEntryType,
            id: "entry-b",
            taskId: "task-b",
            dailyListId: "list-1",
            orderToken: "b",
            createdAt: 2,
          },
        ] satisfies DailyEntry[]);
      },
    });

    syncDispatch(db, seed({}));
    syncDispatch(
      db,
      collapseCompletedTimeBlock({
        taskId: "task-a",
        now: firstStart + 20 * 60 * 1000,
      }),
    );

    const tasks = runSelector<Task[]>(db, function* () {
      return (yield* selectFrom(tasksTable, "byIds").where((q) => q)) as Task[];
    });
    const byId = new Map(tasks.map((task) => [task.id, task]));

    expect(byId.get("task-a")?.durationMinutes).toBe(20);
    expect(byId.get("task-a")?.startsAt).toBe(firstStart);
    expect(byId.get("task-b")?.startsAt).toBe(firstStart + 20 * 60 * 1000);
    expect(byId.get("task-b")?.durationMinutes).toBe(60);
  });
});
