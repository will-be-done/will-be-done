import { test } from "vitest";
import { DB, table } from "./db";
import { InmemDriver } from "./drivers/InmemDriver";
import { selectAll, selector, subscribe } from "./selector";
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

const allIds = selector(function* () {
  const tasks = yield* selectAll(db, tasksTable, "ids");

  return tasks;
});

test("works", () => {
  subscribe(
    () => allIds(),
    (tasks) => {
      console.log("tasks", tasks);
    },
  );

  db.insert(tasksTable, [
    {
      id: "task-1",
      title: "inserted",
      state: "todo",
      projectId: "2",
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
