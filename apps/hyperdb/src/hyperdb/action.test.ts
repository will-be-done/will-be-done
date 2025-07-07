import { describe, expect, it } from "vitest";
import { table } from "./table";
import { DB } from "./db";
import { BptreeInmemDriver } from "./drivers/bptree-inmem-driver";
import { action, deleteRows, dispatch, insert, update } from "./action";
import { runQuery } from "./selector";
import { selectFrom } from "./query";

type Task = {
  type: "task";
  id: string;
  title: string;
  state: "todo" | "done";
  projectId: string;
  orderToken: string;
};

const tasksTables = table<Task>("tasks").withIndexes({
  id: { type: "hash", cols: ["id"] },
  title: { type: "btree", cols: ["title"] },
});

const updateAction = action(function* () {
  const task: Task = {
    type: "task",
    id: "task-1",
    title: "Task 1",
    state: "todo",
    projectId: "project-1",
    orderToken: "b",
  };

  yield* update(tasksTables, [task]);
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
    const db = new DB(driver, [tasksTables]);

    expect(dispatch(db, insertAction())).toEqual([
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
