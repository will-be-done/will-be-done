import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DB, execSync } from "../../hyperdb/db";
import { BptreeInmemDriver } from "../../hyperdb/drivers/inmemory/bptree-inmem-driver";
import { SubscribableDB } from "../../hyperdb/runtime/subscribable-db";
import { defineTable } from "../../hyperdb/schema/table";
import { v } from "../../hyperdb/schema/values";
import {
  action,
  deleteRows,
  insert,
  syncDispatch,
  upsert,
} from "../../hyperdb/commands/action/builders";
import { selectFrom } from "../../hyperdb/commands/query/builder";
import {
  select,
  selector,
} from "../../hyperdb/commands/query/selector";
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
