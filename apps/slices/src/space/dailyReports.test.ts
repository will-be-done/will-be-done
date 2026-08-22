import { describe, expect, it } from "vitest";
import {
  createAction,
  createSelector,
  DB,
  execSync,
  insert,
  selectSync,
  syncDispatch,
} from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import { dbIdTrait } from "../traits";
import {
  completedTasksSnapshotForDate,
  createDailyReport,
  dailyReportByDate,
  dailyReportGetId,
  dailyReportsInDateRange,
  dailyReportsNewest,
  deleteDailyReportByDate,
  upsertDailyReport,
} from "./dailyReports";
import {
  dailyEntriesTable,
  dailyEntryType,
  dailyListsTable,
  dailyListType,
  dailyReportsTable,
  projectSectionsTable,
  projectSectionType,
  tasksTable,
  taskType,
  type DailyReport,
  type Task,
} from "./tables";

const selector = createSelector();
const action = createAction();

function runSelector<T>(
  db: DB,
  handler: () => Generator<unknown, T, unknown>,
): T {
  const testSelector = selector({
    name: "testSelector",
    args: {},
    handler,
  });
  return selectSync(db, { selector: testSelector, args: {} });
}

function createDB() {
  const db = new DB(new BptreeInmemDriver(), {
    traits: [dbIdTrait("space", "a0000000-0000-4000-8000-000000000001")],
  });
  execSync(
    db.loadTables([
      dailyReportsTable,
      dailyListsTable,
      dailyEntriesTable,
      tasksTable,
      projectSectionsTable,
    ]),
  );
  return db;
}

const seedCompletedDay = action({
  name: "seedCompletedDayForDailyReport",
  args: {},
  handler: function* seedCompletedDayForDailyReport() {
    yield* insert(projectSectionsTable, [
      {
        type: projectSectionType,
        id: "section-1",
        title: "Section",
        projectId: "project-1",
        orderToken: "a",
        createdAt: 1,
      },
    ]);
    yield* insert(dailyListsTable, [
      {
        type: dailyListType,
        id: "list-1",
        date: "2026-08-21",
      },
    ]);
    const tasks: Task[] = [
      {
        type: taskType,
        id: "done-task",
        title: "Shipped the report",
        state: "done",
        projectSectionId: "section-1",
        orderToken: "a",
        lastToggledAt: 200,
        nature: "unknown",
        createdAt: 1,
        templateId: null,
        templateDate: null,
      },
      {
        type: taskType,
        id: "todo-task",
        title: "Still open",
        state: "todo",
        projectSectionId: "section-1",
        orderToken: "b",
        lastToggledAt: 1,
        nature: "unknown",
        createdAt: 1,
        templateId: null,
        templateDate: null,
      },
    ];
    yield* insert(tasksTable, tasks);
    yield* insert(dailyEntriesTable, [
      {
        type: dailyEntryType,
        id: "entry-done",
        taskId: "done-task",
        dailyListId: "list-1",
        orderToken: "a",
        createdAt: 1,
      },
      {
        type: dailyEntryType,
        id: "entry-todo",
        taskId: "todo-task",
        dailyListId: "list-1",
        orderToken: "b",
        createdAt: 1,
      },
    ]);
  },
});

describe("daily reports", () => {
  it("uses a deterministic id per date", () => {
    const db = createDB();
    const id = runSelector<string>(db, function* () {
      return yield* dailyReportGetId({ date: "2026-08-21" });
    });
    const report = syncDispatch(
      db,
      createDailyReport({ date: "2026-08-21" }),
    ) as DailyReport;

    expect(report.id).toBe(id);
    expect(report.date).toBe("2026-08-21");
  });

  it("snapshots completed tasks when a report is created", () => {
    const db = createDB();
    syncDispatch(db, seedCompletedDay({}));

    const snapshot = selectSync(db, {
      selector: completedTasksSnapshotForDate,
      args: { date: "2026-08-21" },
    });
    expect(snapshot).toEqual([
      { id: "done-task", title: "Shipped the report" },
    ]);

    const report = syncDispatch(
      db,
      createDailyReport({ date: "2026-08-21", notes: "Good day" }),
    ) as DailyReport;
    expect(report.notes).toBe("Good day");
    expect(report.completedTasks).toEqual(snapshot);
  });

  it("updates notes and ratings without replacing an omitted task snapshot", () => {
    const db = createDB();
    syncDispatch(
      db,
      createDailyReport({
        date: "2026-08-21",
        notes: "Draft",
        completedTasks: [{ id: "task-1", title: "Kept" }],
        mood: 3,
      }),
    );

    const updated = syncDispatch(
      db,
      upsertDailyReport({
        date: "2026-08-21",
        notes: "Closed the day",
        energy: 4,
        mood: null,
      }),
    ) as DailyReport;

    expect(updated.notes).toBe("Closed the day");
    expect(updated.completedTasks).toEqual([{ id: "task-1", title: "Kept" }]);
    expect(updated.energy).toBe(4);
    expect(updated.mood).toBeUndefined();
  });

  it("lists reports newest first with a date cursor", () => {
    const db = createDB();
    syncDispatch(db, createDailyReport({ date: "2026-08-19" }));
    syncDispatch(db, createDailyReport({ date: "2026-08-21" }));
    syncDispatch(db, createDailyReport({ date: "2026-08-20" }));

    const firstPage = selectSync(db, {
      selector: dailyReportsInDateRange,
      args: {
        from: "2026-08-01",
        to: "2026-08-31",
        cursorDate: null,
        cursorId: null,
        limit: 2,
      },
    });
    expect(firstPage.map((report) => report.date)).toEqual([
      "2026-08-21",
      "2026-08-20",
    ]);

    const nextPage = selectSync(db, {
      selector: dailyReportsInDateRange,
      args: {
        from: "2026-08-01",
        to: "2026-08-31",
        cursorDate: firstPage[1]!.date,
        cursorId: firstPage[1]!.id,
        limit: 2,
      },
    });
    expect(nextPage.map((report) => report.date)).toEqual(["2026-08-19"]);
  });

  it("returns every report newest first", () => {
    const db = createDB();
    syncDispatch(db, createDailyReport({ date: "2026-08-19" }));
    syncDispatch(db, createDailyReport({ date: "2026-08-21" }));
    syncDispatch(db, createDailyReport({ date: "2026-08-20" }));

    expect(
      selectSync(db, { selector: dailyReportsNewest, args: {} }).map(
        (report) => report.date,
      ),
    ).toEqual(["2026-08-21", "2026-08-20", "2026-08-19"]);
  });

  it("deletes a report by date", () => {
    const db = createDB();
    syncDispatch(db, createDailyReport({ date: "2026-08-21" }));
    syncDispatch(db, deleteDailyReportByDate({ date: "2026-08-21" }));

    expect(
      selectSync(db, {
        selector: dailyReportByDate,
        args: { date: "2026-08-21" },
      }),
    ).toBeUndefined();
  });
});
