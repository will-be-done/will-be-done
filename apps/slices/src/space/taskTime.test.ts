import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAction,
  DB,
  execSync,
  insert,
  selectFrom,
  selectSync,
  syncDispatch,
} from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import { dbIdTrait } from "../traits";
import { getSpaceBackup, loadSpaceBackup, type Backup } from "./backup";
import {
  dailyEntryByTaskId,
  removeFromDailyList,
  scheduleTask,
} from "./dailyEntries";
import { taskById, updateTask } from "./tasks";
import {
  createTaskTemplateFromTask,
  generateTasksForTemplate,
  updateTemplate,
} from "./taskTemplates";
import { registeredSpaceSyncableTables } from "./syncMap";
import {
  dailyEntriesTable,
  tasksTable,
  taskTemplatesTable,
  type DailyEntry,
  type Task,
  type TaskTemplate,
} from "./tables";

const action = createAction();

function createDB() {
  vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(0);
  const db = new DB(new BptreeInmemDriver(), {
    traits: [dbIdTrait("space", "a0000000-0000-4000-8000-000000000001")],
  });
  execSync(db.loadTables(registeredSpaceSyncableTables));
  return db;
}

function insertRows(
  db: DB,
  rows: { tasks?: Task[]; templates?: TaskTemplate[] },
) {
  syncDispatch(
    db,
    action({
      name: "insertTaskTimeRows",
      args: {},
      handler: function* () {
        if (rows.tasks) yield* insert(tasksTable, rows.tasks);
        if (rows.templates) yield* insert(taskTemplatesTable, rows.templates);
      },
    })({}),
  );
}

function allRows(db: DB) {
  return syncDispatch(
    db,
    action({
      name: "readTaskTimeRows",
      args: {},
      handler: function* () {
        return {
          tasks: (yield* selectFrom(tasksTable, "byIds")) as Task[],
          entries: (yield* selectFrom(
            dailyEntriesTable,
            "byIds",
          )) as DailyEntry[],
        };
      },
    })({}),
  );
}

function entryOf(db: DB, taskId: string) {
  return selectSync(db, { selector: dailyEntryByTaskId, args: { taskId } });
}

const task = (id: string): Task => ({
  type: "task",
  id,
  title: id,
  state: "todo",
  projectSectionId: "section-1",
  orderToken: "a0",
  lastToggledAt: 0,
  createdAt: 0,
  nature: "unknown",
  templateId: null,
  templateDate: null,
});

const template = (overrides: Partial<TaskTemplate>): TaskTemplate => ({
  type: "template",
  id: "template-1",
  title: "Standup",
  orderToken: "a0",
  repeatRule: "FREQ=DAILY;INTERVAL=1",
  repeatRuleDtStart: Date.parse("2026-03-01T00:00:00Z"),
  createdAt: Date.parse("2026-03-01T00:00:00Z"),
  lastGeneratedAt: Date.parse("2026-03-01T00:00:00Z"),
  projectSectionId: "section-1",
  ...overrides,
});

describe("task time and duration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("gives generated tasks the template time and duration", () => {
    const db = createDB();
    insertRows(db, {
      templates: [template({ time: "09:30", durationMinutes: 45 })],
    });

    syncDispatch(
      db,
      generateTasksForTemplate({
        templateId: "template-1",
        toDate: Date.parse("2026-03-03T12:00:00Z"),
      }),
    );

    const { tasks, entries } = allRows(db);
    expect(tasks).toHaveLength(3);
    expect(tasks.map((t) => t.durationMinutes)).toEqual([45, 45, 45]);
    expect(entries.map((e) => e.time)).toEqual(["09:30", "09:30", "09:30"]);
  });

  it("ignores the template time for sub-daily rules", () => {
    const db = createDB();
    insertRows(db, {
      templates: [
        template({
          repeatRule: "FREQ=MINUTELY;INTERVAL=30",
          time: "09:30",
        }),
      ],
    });

    syncDispatch(
      db,
      generateTasksForTemplate({
        templateId: "template-1",
        toDate: Date.parse("2026-03-01T00:45:00Z"),
      }),
    );

    const { entries } = allRows(db);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((e) => e.time == null)).toBe(true);
  });

  it("keeps the time across reschedules and drops it when unscheduled", () => {
    const db = createDB();
    insertRows(db, { tasks: [task("task-1")] });

    syncDispatch(
      db,
      scheduleTask({
        taskId: "task-1",
        date: "2026-03-01",
        position: "append",
        time: "10:00",
      }),
    );
    syncDispatch(
      db,
      scheduleTask({
        taskId: "task-1",
        date: "2026-03-02",
        position: "append",
      }),
    );
    expect(entryOf(db, "task-1")?.time).toBe("10:00");

    syncDispatch(
      db,
      scheduleTask({
        taskId: "task-1",
        date: "2026-03-02",
        position: "append",
        time: null,
      }),
    );
    expect(entryOf(db, "task-1")?.time).toBeNull();

    syncDispatch(
      db,
      scheduleTask({
        taskId: "task-1",
        date: "2026-03-02",
        position: "append",
        time: "11:00",
      }),
    );
    syncDispatch(db, removeFromDailyList({ taskId: "task-1" }));
    expect(entryOf(db, "task-1")).toBeUndefined();

    syncDispatch(
      db,
      scheduleTask({
        taskId: "task-1",
        date: "2026-03-03",
        position: "append",
      }),
    );
    expect(entryOf(db, "task-1")?.time).toBeUndefined();
  });

  it("carries time and duration over when a task becomes a template", () => {
    const db = createDB();
    const now = Date.parse("2026-03-04T17:05:00Z");
    insertRows(db, { tasks: [task("task-1")] });
    syncDispatch(
      db,
      scheduleTask({
        taskId: "task-1",
        date: "2026-03-04",
        position: "append",
        time: "08:15",
      }),
    );
    syncDispatch(
      db,
      updateTask({ id: "task-1", task: { durationMinutes: 20 } }),
    );
    const current = selectSync(db, {
      selector: taskById,
      args: { id: "task-1" },
    })!;

    const created = syncDispatch(
      db,
      createTaskTemplateFromTask({ task: current, data: {}, now }),
    );

    expect(created.time).toBe("08:15");
    expect(created.durationMinutes).toBe(20);
    const { tasks, entries } = allRows(db);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].durationMinutes).toBe(20);
    expect(entries).toHaveLength(1);
    expect(entries[0].time).toBe("08:15");
  });

  it("rejects malformed times and durations", () => {
    const db = createDB();
    insertRows(db, { tasks: [task("task-1")], templates: [template({})] });

    expect(() =>
      syncDispatch(
        db,
        scheduleTask({
          taskId: "task-1",
          date: "2026-03-01",
          position: "append",
          time: "9:00",
        }),
      ),
    ).toThrow(/Invalid task time/);
    expect(() =>
      syncDispatch(
        db,
        updateTask({ id: "task-1", task: { durationMinutes: 0 } }),
      ),
    ).toThrow(/Invalid task duration/);
    expect(() =>
      syncDispatch(
        db,
        updateTemplate({ id: "template-1", template: { time: "24:00" } }),
      ),
    ).toThrow(/Invalid task time/);
  });

  it("round-trips time and duration through backups", () => {
    const db = createDB();
    insertRows(db, {
      tasks: [{ ...task("task-1"), durationMinutes: 90 }],
      templates: [template({ time: "07:00", durationMinutes: 15 })],
    });
    syncDispatch(
      db,
      scheduleTask({
        taskId: "task-1",
        date: "2026-03-01",
        position: "append",
        time: "13:45",
      }),
    );
    const backup = selectSync(db, {
      selector: getSpaceBackup,
      args: {},
    }) as Backup;
    backup.projectSections = [
      {
        id: "section-1",
        title: "Section",
        projectId: "project-1",
        createdAt: 0,
        orderToken: "a0",
      },
    ];

    const restored = createDB();
    syncDispatch(restored, loadSpaceBackup({ backup }));

    expect(
      selectSync(restored, { selector: taskById, args: { id: "task-1" } })
        ?.durationMinutes,
    ).toBe(90);
    expect(entryOf(restored, "task-1")?.time).toBe("13:45");
    const restoredTemplate = syncDispatch(
      restored,
      action({
        name: "readRestoredTemplate",
        args: {},
        handler: function* () {
          return (yield* selectFrom(taskTemplatesTable, "byIds"))[0];
        },
      })({}),
    );
    expect(restoredTemplate?.time).toBe("07:00");
    expect(restoredTemplate?.durationMinutes).toBe(15);
  });
});
