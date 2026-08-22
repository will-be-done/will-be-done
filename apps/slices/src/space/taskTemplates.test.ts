import { describe, expect, it, vi, afterEach } from "vitest";
import {
  DB,
  execSync,
  syncDispatch,
  createSelector,
  selectSync,
  insert,
  createAction,
  selectFrom,
} from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import {
  taskTemplateNewTasksInRange,
  newTasksToGenForTaskTemplate,
  createTaskTemplateFromTask,
  generateSpaceTasksIfDue,
  generateTasksForTemplate,
  taskTemplateById,
  upcomingTemplateOccurrencesInRange,
  type UpcomingTemplateOccurrence,
} from "./taskTemplates";
import { dbIdTrait } from "@/traits";
import {
  checklistItemsTable,
  DailyList,
  dailyListsTable,
  Task,
  DailyEntry,
  dailyEntriesTable,
  spacePreferencesTable,
  tasksTable,
  TaskTemplate,
  taskTemplatesTable,
  stashEntriesTable,
  projectSectionsTable,
  projectsTable,
} from "./tables";

const action = createAction();
const selector = createSelector();

function runSelector<T>(
  db: DB,
  handler: () => Generator<unknown, T, unknown>,
  _deps: unknown[],
): T {
  const testSelector = selector({
    name: "testSelector",
    args: {},
    handler,
  });
  return selectSync(db, { selector: testSelector, args: {} });
}

function createDB(timezoneOffsetMinutes: number) {
  // Mock timezone before creating DB/running selectors
  vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(
    timezoneOffsetMinutes,
  );

  const driver = new BptreeInmemDriver();
  const spaceId = "a0000000-0000-4000-8000-000000000001";
  const db = new DB(driver, { traits: [dbIdTrait("space", spaceId)] });
  execSync(
    db.loadTables([
      checklistItemsTable,
      dailyListsTable,
      dailyEntriesTable,
      spacePreferencesTable,
      tasksTable,
      taskTemplatesTable,
      stashEntriesTable,
      projectSectionsTable,
      projectsTable,
    ]),
  );
  return db;
}

function insertTemplate(db: DB, template: TaskTemplate) {
  syncDispatch(
    db,
    action({
      name: "anonymousAction",
      args: {},
      handler: function* anonymousAction() {
        yield* insert(taskTemplatesTable, [template]);
      },
    })({}),
  );
}

function getNewTasks(db: DB, templateId: string, toDate: Date): Task[] {
  return runSelector<Task[]>(
    db,
    function* () {
      return yield* newTasksToGenForTaskTemplate({
        templateId,
        toDate: toDate.getTime(),
      });
    },
    [],
  );
}

function getNewTasksInRange(db: DB, fromDate: Date, toDate: Date): Task[] {
  return runSelector<Task[]>(
    db,
    function* () {
      return yield* taskTemplateNewTasksInRange({
        fromDate: fromDate.getTime(),
        toDate: toDate.getTime(),
      });
    },
    [],
  );
}

describe("taskTemplates timezone consistency", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("generates tasks with the SAME IDs regardless of timezone", () => {
    // Template created at a fixed epoch: March 1, 2026, 10:00:00 UTC
    const createdAtEpoch = new Date("2026-03-01T10:00:00Z").getTime();
    // lastGeneratedAt = createdAt (no tasks generated yet)
    const lastGeneratedAtEpoch = createdAtEpoch;
    // "Now" is March 4, 2026, 10:00:00 UTC — 3 days later
    const toDate = new Date("2026-03-04T10:00:00Z");

    const template: TaskTemplate = {
      type: "template",
      id: "template-tz-test",
      title: "Daily test template",
      orderToken: "a",

      repeatRule: "RRULE:FREQ=DAILY;INTERVAL=1",
      repeatRuleDtStart: createdAtEpoch,
      createdAt: createdAtEpoch,
      lastGeneratedAt: lastGeneratedAtEpoch,
      projectSectionId: "section-1",
    };

    // --- Run in UTC+3 (getTimezoneOffset returns -180) ---
    const dbTZ3 = createDB(-180);
    insertTemplate(dbTZ3, template);
    const tasksTZ3 = getNewTasks(dbTZ3, template.id, toDate);
    vi.restoreAllMocks();

    // --- Run in UTC-5 (getTimezoneOffset returns 300) ---
    const dbTZM5 = createDB(300);
    insertTemplate(dbTZM5, template);
    const tasksTZM5 = getNewTasks(dbTZM5, template.id, toDate);
    vi.restoreAllMocks();

    // Same number of tasks should be generated
    expect(tasksTZ3.length).toBe(tasksTZM5.length);
    expect(tasksTZ3.length).toBeGreaterThan(0);

    // Task IDs must match across timezones
    const idsTZ3 = tasksTZ3.map((t) => t.id);
    const idsTZM5 = tasksTZM5.map((t) => t.id);
    expect(idsTZ3).toEqual(idsTZM5);
  });

  it("generates deterministic IDs despite 10-second clock drift between devices", () => {
    const createdAtEpoch = new Date("2026-03-01T10:00:00Z").getTime();
    const lastGeneratedAtEpoch = createdAtEpoch;

    // Device A thinks it's 17:05:00, Device B thinks it's 17:05:10 (10s drift)
    const toDateA = new Date("2026-03-04T17:05:00Z");
    const toDateB = new Date("2026-03-04T17:05:10Z");

    const template: TaskTemplate = {
      type: "template",
      id: "template-drift-test",
      title: "Daily drift test",
      orderToken: "a",

      repeatRule: "RRULE:FREQ=DAILY;INTERVAL=1",
      repeatRuleDtStart: createdAtEpoch,
      createdAt: createdAtEpoch,
      lastGeneratedAt: lastGeneratedAtEpoch,
      projectSectionId: "section-1",
    };

    // Device A (UTC+3)
    const dbA = createDB(-180);
    insertTemplate(dbA, template);
    const tasksA = getNewTasks(dbA, template.id, toDateA);
    vi.restoreAllMocks();

    // Device B (UTC-5, 10s later)
    const dbB = createDB(300);
    insertTemplate(dbB, template);
    const tasksB = getNewTasks(dbB, template.id, toDateB);
    vi.restoreAllMocks();

    // Both should generate the same tasks with the same IDs
    expect(tasksA.length).toBe(tasksB.length);
    expect(tasksA.length).toBeGreaterThan(0);
    expect(tasksA.map((t) => t.id)).toEqual(tasksB.map((t) => t.id));
    expect(tasksA.map((t) => t.templateDate)).toEqual(
      tasksB.map((t) => t.templateDate),
    );
  });

  it("generates deterministic IDs despite 10-second clock drift with MINUTELY rule", () => {
    const createdAtEpoch = new Date("2026-03-04T17:00:00Z").getTime();
    const lastGeneratedAtEpoch = createdAtEpoch;

    // 10-second drift: device A at 17:05:00, device B at 17:05:10
    const toDateA = new Date("2026-03-04T17:05:00Z");
    const toDateB = new Date("2026-03-04T17:05:10Z");

    const template: TaskTemplate = {
      type: "template",
      id: "template-minutely-drift",
      title: "Minutely drift test",
      orderToken: "a",

      repeatRule: "RRULE:FREQ=MINUTELY;INTERVAL=1",
      repeatRuleDtStart: createdAtEpoch,
      createdAt: createdAtEpoch,
      lastGeneratedAt: lastGeneratedAtEpoch,
      projectSectionId: "section-1",
    };

    // Device A (UTC+3)
    const dbA = createDB(-180);
    insertTemplate(dbA, template);
    const tasksA = getNewTasks(dbA, template.id, toDateA);
    vi.restoreAllMocks();

    // Device B (UTC-5, 10s later)
    const dbB = createDB(300);
    insertTemplate(dbB, template);
    const tasksB = getNewTasks(dbB, template.id, toDateB);
    vi.restoreAllMocks();

    expect(tasksA.length).toBeGreaterThan(0);
    expect(tasksB.length).toBeGreaterThan(0);

    // Device B may generate one extra task due to 10s drift crossing a minute boundary.
    // The critical invariant: all tasks generated by Device A must also appear
    // in Device B with the SAME IDs (no duplicates after sync).
    const idsA = tasksA.map((t) => t.id);
    const idsB = tasksB.map((t) => t.id);
    const idsBSet = new Set(idsB);
    for (const id of idsA) {
      expect(idsBSet.has(id), `Device A task ${id} missing from Device B`).toBe(
        true,
      );
    }
  });

  it("caps generation window to 2 weeks for a 10-minute rule after 1 year offline", () => {
    const oneYearAgo = new Date("2025-03-05T10:00:00Z").getTime();
    const now = new Date("2026-03-05T10:00:00Z");
    const twoWeeksMs = 14 * 24 * 60 * 60 * 1000;
    const twoWeeksAgo = now.getTime() - twoWeeksMs;

    const template: TaskTemplate = {
      type: "template",
      id: "template-cap-test",
      title: "Every 10 min template",
      orderToken: "a",

      repeatRule: "RRULE:FREQ=MINUTELY;INTERVAL=10",
      repeatRuleDtStart: oneYearAgo,
      createdAt: oneYearAgo,
      lastGeneratedAt: oneYearAgo, // hasn't run in a year
      projectSectionId: "section-1",
    };

    const db = createDB(0); // UTC
    insertTemplate(db, template);
    const tasks = getNewTasks(db, template.id, now);
    vi.restoreAllMocks();

    // Without cap: 1 year / 10 min = 52,560 tasks
    // With 2-week cap: 2 weeks / 10 min = 2,016 tasks
    const maxExpected = twoWeeksMs / (10 * 60 * 1000);
    expect(tasks.length).toBeLessThanOrEqual(maxExpected);
    expect(tasks.length).toBeGreaterThan(0);

    // Verify no task has a date older than 2 weeks
    for (const task of tasks) {
      expect(task.templateDate!).toBeGreaterThanOrEqual(twoWeeksAgo);
    }
  });

  it("generates daily tasks at day start (midnight local), not at template creation time", () => {
    // Template created at March 1, 14:30:00 UTC
    const createdAtEpoch = new Date("2026-03-01T14:30:00Z").getTime();
    const lastGeneratedAtEpoch = createdAtEpoch;
    // "Now" is March 3, 08:00:00 UTC
    const toDate = new Date("2026-03-03T08:00:00Z");

    const template: TaskTemplate = {
      type: "template",
      id: "template-daystart-test",
      title: "Daily daystart template",
      orderToken: "a",

      repeatRule: "RRULE:FREQ=DAILY;INTERVAL=1",
      repeatRuleDtStart: createdAtEpoch,
      createdAt: createdAtEpoch,
      lastGeneratedAt: lastGeneratedAtEpoch,
      projectSectionId: "section-1",
    };

    const db = createDB(0); // UTC
    insertTemplate(db, template);
    const tasks = getNewTasks(db, template.id, toDate);
    vi.restoreAllMocks();

    expect(tasks.length).toBeGreaterThan(0);

    // All generated tasks should have templateDate/createdAt at midnight UTC,
    // NOT at 14:30:00 (the template creation time)
    for (const task of tasks) {
      const d = new Date(task.templateDate!);
      expect(d.getUTCHours()).toBe(0);
      expect(d.getUTCMinutes()).toBe(0);
      expect(d.getUTCSeconds()).toBe(0);
      expect(d.getUTCMilliseconds()).toBe(0);
    }
  });

  it("daily task at midnight is generated when local time passes midnight", () => {
    // Template created March 1, 10:00 UTC
    const createdAtEpoch = new Date("2026-03-01T10:00:00Z").getTime();

    const template: TaskTemplate = {
      type: "template",
      id: "template-midnight-gen",
      title: "Daily midnight test",
      orderToken: "a",

      repeatRule: "RRULE:FREQ=DAILY;INTERVAL=1",
      repeatRuleDtStart: createdAtEpoch,
      createdAt: createdAtEpoch,
      lastGeneratedAt: createdAtEpoch,
      projectSectionId: "section-1",
    };

    // User in UTC+3: it's March 2 00:05 local = March 1 21:05 UTC
    // Both March 1's and March 2's midnight tasks should be generated
    const dbTZ3 = createDB(-180);
    insertTemplate(dbTZ3, template);
    const tasksAt0005Local = getNewTasks(
      dbTZ3,
      template.id,
      new Date("2026-03-01T21:05:00Z"), // 00:05 local in UTC+3
    );
    vi.restoreAllMocks();

    // March 1 (creation day) + March 2 (midnight just passed)
    expect(tasksAt0005Local.length).toBe(2);

    const dates = tasksAt0005Local.map((t) => new Date(t.templateDate!));
    // March 1 midnight
    expect(dates[0].getUTCDate()).toBe(1);
    expect(dates[0].getUTCHours()).toBe(0);
    // March 2 midnight
    expect(dates[1].getUTCDate()).toBe(2);
    expect(dates[1].getUTCHours()).toBe(0);
  });

  it("daily task for next day is NOT generated before local midnight", () => {
    // Template created March 1, 10:00 UTC
    const createdAtEpoch = new Date("2026-03-01T10:00:00Z").getTime();

    const template: TaskTemplate = {
      type: "template",
      id: "template-before-midnight",
      title: "Daily before midnight test",
      orderToken: "a",

      repeatRule: "RRULE:FREQ=DAILY;INTERVAL=1",
      repeatRuleDtStart: createdAtEpoch,
      createdAt: createdAtEpoch,
      lastGeneratedAt: createdAtEpoch,
      projectSectionId: "section-1",
    };

    // User in UTC+3: it's March 1 23:55 local = March 1 20:55 UTC
    const db = createDB(-180);
    insertTemplate(db, template);
    const tasksBefore = getNewTasks(
      db,
      template.id,
      new Date("2026-03-01T20:55:00Z"), // 23:55 local in UTC+3
    );
    vi.restoreAllMocks();

    // March 1's task (creation day) should be generated, but NOT March 2's
    // (midnight March 2 hasn't passed yet — 00:00 abstract > 23:55 abstract)
    expect(tasksBefore.length).toBe(1);
    const taskDate = new Date(tasksBefore[0].templateDate!);
    expect(taskDate.getUTCDate()).toBe(1); // March 1
    expect(taskDate.getUTCHours()).toBe(0);
  });

  it("finds daily tasks in a real-time range that crosses local midnight", () => {
    const createdAtEpoch = new Date("2026-03-01T10:00:00Z").getTime();

    const template: TaskTemplate = {
      type: "template",
      id: "template-range-local-midnight",
      title: "Daily range midnight test",
      orderToken: "a",
      repeatRule: "RRULE:FREQ=DAILY;INTERVAL=1",
      repeatRuleDtStart: createdAtEpoch,
      createdAt: createdAtEpoch,
      lastGeneratedAt: createdAtEpoch,
      projectSectionId: "section-1",
    };

    // UTC+3 client asking for 23:00 Mar 1 -> 01:00 Mar 2 local time.
    // In real UTC that's 20:00 -> 22:00 on March 1. The range crosses
    // local midnight, so it should include the Mar 2 daily occurrence.
    const db = createDB(-180);
    insertTemplate(db, template);
    const tasks = getNewTasksInRange(
      db,
      new Date("2026-03-01T20:00:00Z"),
      new Date("2026-03-01T22:00:00Z"),
    );
    vi.restoreAllMocks();

    expect(tasks).toHaveLength(1);
    const taskDate = new Date(tasks[0].templateDate!);
    expect(taskDate.toISOString()).toBe("2026-03-02T00:00:00.000Z");
  });

  it("generates tasks with the SAME IDs for MINUTELY rule across timezones", () => {
    const createdAtEpoch = new Date("2026-03-04T17:00:00Z").getTime();
    const lastGeneratedAtEpoch = createdAtEpoch;
    // 5 minutes later
    const toDate = new Date("2026-03-04T17:05:00Z");

    const template: TaskTemplate = {
      type: "template",
      id: "template-minutely-tz",
      title: "Minutely test",
      orderToken: "a",

      repeatRule: "RRULE:FREQ=MINUTELY;INTERVAL=1;COUNT=5",
      repeatRuleDtStart: createdAtEpoch,
      createdAt: createdAtEpoch,
      lastGeneratedAt: lastGeneratedAtEpoch,
      projectSectionId: "section-1",
    };

    // --- UTC+3 ---
    const dbTZ3 = createDB(-180);
    insertTemplate(dbTZ3, template);
    const tasksTZ3 = getNewTasks(dbTZ3, template.id, toDate);
    vi.restoreAllMocks();

    // --- UTC-5 ---
    const dbTZM5 = createDB(300);
    insertTemplate(dbTZM5, template);
    const tasksTZM5 = getNewTasks(dbTZM5, template.id, toDate);
    vi.restoreAllMocks();

    expect(tasksTZ3.length).toBe(tasksTZM5.length);
    expect(tasksTZ3.length).toBeGreaterThan(0);

    const idsTZ3 = tasksTZ3.map((t) => t.id);
    const idsTZM5 = tasksTZM5.map((t) => t.id);
    expect(idsTZ3).toEqual(idsTZM5);
  });

  it("immediately generates today's task when converting a task to a template", () => {
    const db = createDB(0);
    const now = new Date("2026-03-04T17:05:00Z").getTime();
    const task: Task = {
      type: "task",
      id: "task-to-template",
      title: "Converted daily task",
      content: "Task body",
      state: "todo",
      projectSectionId: "section-1",
      orderToken: "a0",
      lastToggledAt: now,
      nature: "green",
      createdAt: now,
      templateId: null,
      templateDate: null,
    };

    const template = syncDispatch(
      db,
      action({
        name: "anonymousAction",
        args: {},
        handler: function* anonymousAction() {
          yield* insert(tasksTable, [task]);
          return yield* createTaskTemplateFromTask({ task, data: {}, now });
        },
      })({}),
    ) as TaskTemplate;

    const tasks = runSelector<Task[]>(
      db,
      function* () {
        return yield* selectFrom(tasksTable, "byIds");
      },
      [],
    );
    const entries = runSelector<DailyEntry[]>(
      db,
      function* () {
        return yield* selectFrom(dailyEntriesTable, "byIds");
      },
      [],
    );
    const dailyLists = runSelector<DailyList[]>(
      db,
      function* () {
        return yield* selectFrom(dailyListsTable, "byIds");
      },
      [],
    );

    expect(template.title).toBe(task.title);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).not.toBe(task.id);
    expect(tasks[0].templateId).toBe(template.id);
    expect(tasks[0].title).toBe(task.title);
    expect(tasks[0].projectSectionId).toBe(task.projectSectionId);
    expect(tasks[0].templateDate).toBe(
      new Date("2026-03-04T00:00:00Z").getTime(),
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].taskId).toBe(tasks[0].id);
    expect(dailyLists).toHaveLength(1);
    expect(dailyLists[0].date).toBe("2026-03-04");
  });

  it("checks recurrence only when its persisted generation interval is due", () => {
    const db = createDB(0);
    const createdAt = new Date("2026-01-01T00:00:00Z").getTime();
    const checkpoint = new Date("2026-01-02T00:00:00Z").getTime();
    insertTemplate(db, {
      type: "template",
      id: "template-generation-interval",
      title: "Yearly template",
      orderToken: "a",
      repeatRule: "FREQ=YEARLY;INTERVAL=1",
      repeatRuleDtStart: createdAt,
      createdAt,
      lastGeneratedAt: checkpoint,
      projectSectionId: "section-1",
    });

    syncDispatch(
      db,
      generateSpaceTasksIfDue({
        toDate: checkpoint + 999,
        intervalMs: 1_000,
        force: false,
      }),
    );
    expect(
      selectSync(db, {
        selector: taskTemplateById,
        args: { id: "template-generation-interval" },
      })?.lastGeneratedAt,
    ).toBe(checkpoint);

    syncDispatch(
      db,
      generateSpaceTasksIfDue({
        toDate: checkpoint + 1_000,
        intervalMs: 1_000,
        force: false,
      }),
    );
    expect(
      selectSync(db, {
        selector: taskTemplateById,
        args: { id: "template-generation-interval" },
      })?.lastGeneratedAt,
    ).toBe(checkpoint + 1_000);
    vi.restoreAllMocks();
  });

  it("generates only the requested template", () => {
    const db = createDB(0);
    const createdAt = new Date("2026-01-01T00:00:00Z").getTime();
    const checkpoint = new Date("2026-01-02T00:00:00Z").getTime();
    const template = (id: string): TaskTemplate => ({
      type: "template",
      id,
      title: id,
      orderToken: id,
      repeatRule: "FREQ=YEARLY;INTERVAL=1",
      repeatRuleDtStart: createdAt,
      createdAt,
      lastGeneratedAt: checkpoint,
      projectSectionId: "section-1",
    });
    insertTemplate(db, template("template-target"));
    insertTemplate(db, template("template-untouched"));

    syncDispatch(
      db,
      generateTasksForTemplate({
        templateId: "template-target",
        toDate: checkpoint + 1_000,
      }),
    );

    expect(
      selectSync(db, {
        selector: taskTemplateById,
        args: { id: "template-target" },
      })?.lastGeneratedAt,
    ).toBe(checkpoint + 1_000);
    expect(
      selectSync(db, {
        selector: taskTemplateById,
        args: { id: "template-untouched" },
      })?.lastGeneratedAt,
    ).toBe(checkpoint);
    vi.restoreAllMocks();
  });

  it("previews ungenerated template occurrences in a date range", () => {
    const db = createDB(0);
    const createdAt = new Date("2026-03-01T10:00:00Z").getTime();
    insertTemplate(db, {
      type: "template",
      id: "template-upcoming",
      title: "Standup",
      orderToken: "a",
      repeatRule: "FREQ=DAILY;INTERVAL=1",
      repeatRuleDtStart: createdAt,
      createdAt,
      lastGeneratedAt: createdAt,
      projectSectionId: "section-1",
      startsAtMinutes: 9 * 60,
      durationMinutes: 45,
    });

    const occurrences = runSelector<UpcomingTemplateOccurrence[]>(
      db,
      function* () {
        return yield* upcomingTemplateOccurrencesInRange({
          fromInclusive: new Date("2026-03-04T00:00:00Z").getTime(),
          toExclusive: new Date("2026-03-07T00:00:00Z").getTime(),
        });
      },
      [],
    );

    expect(occurrences.map((occurrence) => occurrence.date)).toEqual([
      "2026-03-04",
      "2026-03-05",
      "2026-03-06",
    ]);
    expect(occurrences[0]?.title).toBe("Standup");
    expect(occurrences[0]?.startsAtMinutes).toBe(540);
    expect(occurrences[0]?.durationMinutes).toBe(45);
    expect(occurrences[0]?.startsAt).toBe(
      new Date("2026-03-04T09:00:00Z").getTime(),
    );
  });

  it("hides preview occurrences once the generated task exists", () => {
    const db = createDB(0);
    const createdAt = new Date("2026-03-01T10:00:00Z").getTime();
    insertTemplate(db, {
      type: "template",
      id: "template-upcoming-skip",
      title: "Daily skip",
      orderToken: "a",
      repeatRule: "FREQ=DAILY;INTERVAL=1",
      repeatRuleDtStart: createdAt,
      createdAt,
      lastGeneratedAt: createdAt,
      projectSectionId: "section-1",
    });

    const generated = getNewTasksInRange(
      db,
      new Date("2026-03-04T00:00:00Z"),
      new Date("2026-03-07T00:00:00Z"),
    );
    expect(generated.length).toBeGreaterThan(0);
    syncDispatch(
      db,
      action({
        name: "anonymousAction",
        args: {},
        handler: function* anonymousAction() {
          yield* insert(tasksTable, [generated[0]!]);
        },
      })({}),
    );

    const occurrences = runSelector<UpcomingTemplateOccurrence[]>(
      db,
      function* () {
        return yield* upcomingTemplateOccurrencesInRange({
          fromInclusive: new Date("2026-03-04T00:00:00Z").getTime(),
          toExclusive: new Date("2026-03-07T00:00:00Z").getTime(),
        });
      },
      [],
    );

    expect(occurrences.map((occurrence) => occurrence.date)).toEqual([
      "2026-03-05",
      "2026-03-06",
    ]);
  });

  it("copies the template clock time onto generated tasks", () => {
    const db = createDB(0);
    const createdAt = new Date("2026-03-01T10:00:00Z").getTime();
    insertTemplate(db, {
      type: "template",
      id: "template-timed-gen",
      title: "Timed daily",
      orderToken: "a",
      repeatRule: "FREQ=DAILY;INTERVAL=1",
      repeatRuleDtStart: createdAt,
      createdAt,
      lastGeneratedAt: createdAt,
      projectSectionId: "section-1",
      startsAtMinutes: 14 * 60 + 30,
    });

    const tasks = getNewTasksInRange(
      db,
      new Date("2026-03-04T00:00:00Z"),
      new Date("2026-03-05T00:00:00Z"),
    );
    expect(tasks.length).toBeGreaterThan(0);
    for (const task of tasks) {
      expect(task.durationMinutes).toBe(30);
      const start = new Date(task.startsAt!);
      expect(start.getUTCHours()).toBe(14);
      expect(start.getUTCMinutes()).toBe(30);
    }
    vi.restoreAllMocks();
  });
});
