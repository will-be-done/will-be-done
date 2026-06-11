import { describe, expect, it } from "vitest";
import { defineTable } from "./table";
import { DB, execSync } from "./db";
import { BptreeInmemDriver } from "./drivers/bptree-inmem-driver";
import { action, deleteRows, syncDispatch, insert, upsert } from "./action";
import { runQuery } from "./selector";
import { selectFrom } from "./query";
import { v } from "./values";

type Task = {
  type: "task";
  id: string;
  title: string;
  state: "todo" | "done";
  projectId: string;
  orderToken: string;
};

const tasksTables = defineTable("tasks", {
  type: v.literal("task"),
  id: v.string(),
  title: v.string(),
  state: v.union(v.literal("todo"), v.literal("done")),
  projectId: v.string(),
  orderToken: v.string(),
}).index("title", ["title"], { type: "hash" });

const updateAction = action(function* () {
  const task: Task = {
    type: "task",
    id: "task-1",
    title: "Task 1",
    state: "todo",
    projectId: "project-1",
    orderToken: "b",
  };

  yield* upsert(tasksTables, [task]);
});

const insertAction = action(function* () {
  const task: Task = {
    type: "task",
    id: "task-1",
    title: "Task 1",
    state: "todo",
    projectId: "project-1",
    orderToken: "a",
  };

  yield* insert(tasksTables, [task]);

  const tasks = yield* runQuery(
    selectFrom(tasksTables, "title").where((q) => q.eq("title", "Task 1")),
  );

  yield* updateAction();

  const tasks2 = yield* runQuery(
    selectFrom(tasksTables, "title").where((q) => q.eq("title", "Task 1")),
  );

  yield* deleteRows(tasksTables, ["task-1"]);

  const tasks3 = yield* runQuery(
    selectFrom(tasksTables, "title").where((q) => q.eq("title", "Task 1")),
  );

  return [tasks, tasks2, tasks3];
});

describe("action", () => {
  it("should dispatch actions", () => {
    const driver = new BptreeInmemDriver();
    const db = new DB(driver);
    execSync(db.loadTables([tasksTables]));

    expect(syncDispatch(db, insertAction())).toEqual([
      [
        {
          type: "task",
          id: "task-1",
          title: "Task 1",
          state: "todo",
          projectId: "project-1",
          orderToken: "a",
        },
      ],
      [
        {
          type: "task",
          id: "task-1",
          title: "Task 1",
          state: "todo",
          projectId: "project-1",
          orderToken: "b",
        },
      ],
      [],
    ]);
  });
});
