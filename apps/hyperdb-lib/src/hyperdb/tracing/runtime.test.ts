import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DB, execSync } from "../db";
import { BptreeInmemDriver } from "../drivers/inmemory/bptree-inmem-driver";
import { SubscribableDB } from "../runtime/subscribable-db";
import { defineTable } from "../schema/table";
import { v } from "../schema/values";
import {
  action,
  deleteRows,
  getCurrentTraits,
  insert,
  syncDispatch,
  upsert,
} from "../commands/action/builders";
import { selectFrom } from "../commands/query/builder";
import {
  select,
  selector,
} from "../commands/query/selector";
import { getTraceContextFromTraits } from "./context";
import { hyperDBTraceStore } from "./store";

type Task = {
  id: string;
  title: string;
  state: "todo" | "done";
  projectId: string;
};

const tasksTable = defineTable("devtoolTasks", {
  id: v.string(),
  title: v.string(),
  state: v.union(v.literal("todo"), v.literal("done")),
  projectId: v.string(),
}).index("projectState", ["projectId", "state"]);

const task = (overrides: Partial<Task> = {}): Task => ({
  id: "task-1",
  title: "Task 1",
  state: "todo",
  projectId: "project-1",
  ...overrides,
});

const createDB = (): SubscribableDB => {
  const db = new SubscribableDB(new DB(new BptreeInmemDriver()));
  execSync(db.loadTables([tasksTable]));
  return db;
};

let unsubscribeTraceListener: (() => void) | undefined;

beforeEach(() => {
  unsubscribeTraceListener = hyperDBTraceStore.subscribe(() => {});
  hyperDBTraceStore.setMaxTraces(200);
  hyperDBTraceStore.clear();
});

afterEach(() => {
  hyperDBTraceStore.clear();
  unsubscribeTraceListener?.();
  unsubscribeTraceListener = undefined;
});

describe("devtool runtime tracing", () => {
  it("records one root action trace and a select event", () => {
    const db = createDB();
    execSync(db.insert(tasksTable, [task()]));

    const readTaskAction = action(function* readTask() {
      return yield* selectFrom(tasksTable, "projectState")
        .where((q) => q.eq("projectId", "project-1"))
        .limit(5)
        .order("asc");
    });

    const result = syncDispatch(db, readTaskAction());
    const trace = hyperDBTraceStore.getSnapshot()[0]!;

    expect(result).toEqual([task()]);
    expect(trace.kind).toBe("action");
    expect(trace.name).toBe("readTask");
    expect(trace.dbId).toBeDefined();
    expect(trace.dbLabel).toMatch(/^DB \d+$/);
    expect(trace.commandEvents).toHaveLength(1);
    expect(trace.mutationEvents).toHaveLength(0);
    expect(trace.commandEvents[0]).toMatchObject({
      tableName: "devtoolTasks",
      index: "projectState",
      limit: 5,
      order: "asc",
      resultCount: 1,
      result: [task()],
      status: "success",
    });
    expect(trace.commandEvents[0]?.where[0]?.eq).toEqual([
      { col: "projectId", val: "project-1" },
    ]);
    expect(trace.commandEvents[0]?.bounds.length).toBeGreaterThan(0);
  });

  it("keeps the same db identity across traited wrappers", () => {
    const db = createDB();
    expect(db.withTraits({ type: "test.identity" }).getId()).toBe(db.getId());
    const readTaskAction = action(function* readTask() {
      return yield* selectFrom(tasksTable, "projectState").where((q) =>
        q.eq("projectId", "project-1"),
      );
    });

    syncDispatch(db, readTaskAction());
    syncDispatch(
      db.withTraits({
        type: "test.trait",
      }),
      readTaskAction(),
    );

    const dbIds = new Set(
      hyperDBTraceStore.getSnapshot().map((trace) => trace.dbId),
    );

    expect(dbIds.size).toBe(1);
  });

  it("records an action calling an action as one root with a child frame", () => {
    const db = createDB();

    const childTaskAction = action(function* childAction() {
      yield* insert(tasksTable, [task()]);
    });

    const parentTaskAction = action(function* parentAction() {
      yield* childTaskAction();
    });

    syncDispatch(db, parentTaskAction());

    const trace = hyperDBTraceStore.getSnapshot()[0]!;
    expect(trace.name).toBe("parentAction");
    expect(trace.frames[0]?.children).toHaveLength(1);
    expect(trace.frames[0]?.children[0]?.name).toBe("childAction");
    expect(trace.mutationEvents).toHaveLength(1);
    expect(trace.mutationEvents[0]?.frameId).toBe(
      trace.frames[0]?.children[0]?.id,
    );
  });

  it("records a selector calling a selector as one root with a child frame", () => {
    const db = createDB();
    execSync(db.insert(tasksTable, [task({ state: "done" })]));

    const allTasksSelector = selector(function* allTasks() {
      return yield* selectFrom(tasksTable, "projectState").where((q) =>
        q.eq("projectId", "project-1"),
      );
    });

    const doneTasksSelector = selector(function* doneTasks() {
      const rows = yield* allTasksSelector();
      return rows.filter((row) => row.state === "done");
    });

    expect(select(db, doneTasksSelector())).toEqual([task({ state: "done" })]);

    const trace = hyperDBTraceStore.getSnapshot()[0]!;
    expect(trace.kind).toBe("selector");
    expect(trace.name).toBe("doneTasks");
    expect(trace.frames[0]?.children[0]?.name).toBe("allTasks");
    expect(trace.commandEvents).toHaveLength(1);
    expect(trace.commandEvents[0]?.frameId).toBe(
      trace.frames[0]?.children[0]?.id,
    );
  });

  it("records a non-generator selector success as a root trace", () => {
    const db = createDB();

    const plainSelector = selector(function plainValueSelector() {
      return "plain result";
    });

    expect(select(db, plainSelector())).toBe("plain result");

    const trace = hyperDBTraceStore.getSnapshot()[0]!;
    expect(trace.kind).toBe("selector");
    expect(trace.name).toBe("plainValueSelector");
    expect(trace.status).toBe("success");
    expect(trace.commandEvents).toHaveLength(0);
  });

  it("marks non-generator selector errors on the root trace, then rethrows", () => {
    const db = createDB();
    const failingSelector = selector(function failingPlainSelector() {
      throw new Error("plain selector failed");
    });

    expect(() => select(db, failingSelector())).toThrow(
      "plain selector failed",
    );

    const trace = hyperDBTraceStore.getSnapshot()[0]!;
    expect(trace.kind).toBe("selector");
    expect(trace.name).toBe("failingPlainSelector");
    expect(trace.status).toBe("error");
    expect(trace.error?.message).toBe("plain selector failed");
    expect(trace.commandEvents).toHaveLength(0);
  });

  it("marks select errors on the command and root trace, then rethrows", () => {
    const db = new DB(new BptreeInmemDriver());
    const failingSelector = selector(function* failingSelector() {
      return yield* selectFrom(tasksTable, "projectState").where((q) =>
        q.eq("projectId", "project-1"),
      );
    });

    expect(() => select(db, failingSelector())).toThrow();

    const trace = hyperDBTraceStore.getSnapshot()[0]!;
    expect(trace.status).toBe("error");
    expect(trace.error?.message).toBeTruthy();
    expect(trace.commandEvents).toHaveLength(1);
    expect(trace.commandEvents[0]?.status).toBe("error");
    expect(trace.commandEvents[0]?.error?.message).toBeTruthy();
  });

  it("records insert, upsert, and delete payloads through SubscribableDBTx", () => {
    const db = createDB();
    const updatedTask = task({ title: "Updated", state: "done" });

    const mutateTasks = action(function* mutateTasks() {
      yield* insert(tasksTable, [task()]);
      yield* upsert(tasksTable, [updatedTask]);
      yield* deleteRows(tasksTable, [updatedTask.id]);
    });

    syncDispatch(db, mutateTasks());

    const trace = hyperDBTraceStore.getSnapshot()[0]!;
    expect(trace.mutationEvents.map((event) => event.kind)).toEqual([
      "insert",
      "upsert",
      "delete",
    ]);
    expect(trace.mutationEvents[0]?.newValue).toEqual([task()]);
    expect(trace.mutationEvents[1]?.oldValue).toEqual([task()]);
    expect(trace.mutationEvents[1]?.newValue).toEqual([updatedTask]);
    expect(trace.mutationEvents[2]?.ids).toEqual([updatedTask.id]);
    expect(trace.mutationEvents[2]?.oldValue).toEqual([updatedTask]);
  });

  it("passes the trace context through traits", () => {
    const db = createDB();
    const observedSubscriberTraces: (string | undefined)[] = [];

    db.afterChange(function* afterChange(_db, _table, traits) {
      observedSubscriberTraces.push(getTraceContextFromTraits(traits)?.trace.name);
    });

    const readTraceTraitsAction = action(function* traceTraitsAction() {
      const traits = yield* getCurrentTraits();
      yield* insert(tasksTable, [task()]);

      return getTraceContextFromTraits(traits)?.trace.name;
    });

    expect(syncDispatch(db, readTraceTraitsAction())).toBe("traceTraitsAction");
    expect(observedSubscriberTraces).toEqual(["traceTraitsAction"]);
  });

  it("does not create extra roots for synchronous afterChange subscribers", () => {
    const db = createDB();
    db.afterChange(function* afterChange() {
      yield* selectFrom(tasksTable, "projectState").where((q) =>
        q.eq("projectId", "project-1"),
      );
    });

    const mutateTasks = action(function* mutateTasks() {
      yield* insert(tasksTable, [task()]);
    });

    syncDispatch(db, mutateTasks());

    const traces = hyperDBTraceStore.getSnapshot();
    expect(traces).toHaveLength(1);
    expect(traces[0]?.commandEvents).toHaveLength(1);
    expect(traces[0]?.mutationEvents).toHaveLength(1);
  });
});
