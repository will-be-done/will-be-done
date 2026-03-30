import { describe, expect, it, vi, afterEach } from "vitest";
import {
  DB,
  execSync,
  syncDispatch,
  runSelector,
  insert,
  action,
} from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/src/hyperdb/drivers/bptree-inmem-driver";
import { tasksTable, type Task } from "./cardsTasks";
import {
  taskTemplatesTable,
  type TaskTemplate,
  newTasksInRange,
  newTasksToGenForTemplate,
} from "./cardsTaskTemplates";
import { dbIdTrait } from "@/traits";

function createDB(timezoneOffsetMinutes: number) {
  // Mock timezone before creating DB/running selectors
  vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(
    timezoneOffsetMinutes,
  );

  const driver = new BptreeInmemDriver();
  const spaceId = "a0000000-0000-4000-8000-000000000001";
  const db = new DB(driver, [], [dbIdTrait("space", spaceId)]);
  execSync(db.loadTables([tasksTable, taskTemplatesTable]));
  return db;
}

function insertTemplate(db: DB, template: TaskTemplate) {
  syncDispatch(
    db,
    action(function* () {
      yield* insert(taskTemplatesTable, [template]);
    })(),
  );
}

function getNewTasks(db: DB, templateId: string, toDate: Date): Task[] {
  return runSelector<Task[]>(
    db,
    function* () {
      return yield* newTasksToGenForTemplate(templateId, toDate);
    },
    [],
  );
}

function getNewTasksInRange(db: DB, fromDate: Date, toDate: Date): Task[] {
  return runSelector<Task[]>(
    db,
    function* () {
      return yield* newTasksInRange(fromDate, toDate);
    },
    [],
  );
}

describe("cardsTaskTemplates timezone consistency", () => {
  afterEach(() => {
    vi.restoreAllMocks();
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
      projectCategoryId: "cat-1",
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
      projectCategoryId: "cat-1",
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
      projectCategoryId: "cat-1",
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
      expect(idsBSet.has(id), `Device A task ${id} missing from Device B`).toBe(true);
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
      projectCategoryId: "cat-1",
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
      projectCategoryId: "cat-1",
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
      projectCategoryId: "cat-1",
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
      projectCategoryId: "cat-1",
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
      projectCategoryId: "cat-1",
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
      projectCategoryId: "cat-1",
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
});
