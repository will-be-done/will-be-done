import { test } from "vitest";
import { DB, table } from "./db";
import { InmemDriver } from "./drivers/InmemDriver";
import { selectAll, selector, initSelector } from "./selector";
import { SubscribableDB } from "./subscribable-db";

type Task = {
  type: "task";
  id: string;
  title: string;
  state: "todo" | "done";
  projectId: string;
  orderToken: string;
};

const tasksTable = table<Task>("tasks", {
  ids: { cols: ["id"] },
  projectIdState: { cols: ["projectId", "state"] },
});

const driver = new InmemDriver();
export const db = new SubscribableDB(new DB(driver, [tasksTable]));

const allTasks = selector(function* () {
  const tasks = yield* selectAll(tasksTable, "projectIdState", {
    gte: ["1"],
    lte: ["1"],
  });

  return tasks;
});

const allDoneTasks = selector(function* (state: Task["state"]) {
  const tasks = yield* allTasks();

  return tasks.filter((task) => task.state === state);
});

test("works", () => {
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
