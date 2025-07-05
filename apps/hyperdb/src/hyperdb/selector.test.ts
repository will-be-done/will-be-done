import { describe, test } from "vitest";
import { DB, table } from "./db";
import { selectRange, selector, initSelector, selectEqual } from "./selector";
import { SubscribableDB } from "./subscribable-db";
import { BptreeInmemDriver } from "./drivers/bptree-inmem-driver";

type Task = {
  type: "task";
  id: string;
  title: string;
  state: "todo" | "done";
  projectId: string;
  orderToken: string;
};

const tasksTable = table<Task>("tasks", {
  id: { col: "id", type: "equal" },
  projectIdState: { cols: ["projectId", "state"], type: "range" },
});

const driver = new BptreeInmemDriver();
export const db = new SubscribableDB(new DB(driver, [tasksTable]));

const allTasks = selector(function* () {
  const tasks = yield* selectRange(tasksTable, "projectIdState", {
    gte: ["1"],
    lte: ["1"],
  });

  return tasks;
});

const allDoneTasks = selector(function* (state: Task["state"]) {
  const tasks = yield* allTasks();

  return tasks.filter((task) => task.state === state);
});

const specificTask = selector(function* (id: string) {
  const tasks = yield* selectEqual(tasksTable, "id", [id]);
  return tasks[0];
});

describe("selector", () => {
  test("works with range", () => {
    const selector = initSelector(db, () => allDoneTasks("done"));

    selector.subscribe(() => {
      console.log("new tasks!", selector.getSnapshot());
    });

    db.insert(tasksTable, [
      {
        id: "task-1",
        title: "inserted",
        state: "done",
        projectId: "1",
        orderToken: "d",
        type: "task",
      },
    ]);

    db.update(tasksTable, [
      {
        id: "task-1",
        title: "updated",
        state: "todo",
        projectId: "2",
        orderToken: "d",
        type: "task",
      },
    ]);

    db.delete(tasksTable, ["task-1"]);
  });

  test("works with equal", () => {
    const selector = initSelector(db, () => specificTask("task-1"));

    console.log("current state", selector.getSnapshot());
    selector.subscribe(() => {
      console.log("new state!", selector.getSnapshot());
    });

    db.insert(tasksTable, [
      {
        id: "task-1",
        title: "inserted",
        state: "done",
        projectId: "1",
        orderToken: "d",
        type: "task",
      },
    ]);

    db.update(tasksTable, [
      {
        id: "task-1",
        title: "updated",
        state: "todo",
        projectId: "2",
        orderToken: "d",
        type: "task",
      },
    ]);

    db.delete(tasksTable, ["task-1"]);
  });
});
