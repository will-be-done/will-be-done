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
  lastToggledAt: number;
  projectId: string;
  orderToken: string;
};

const tasksTable = table<Task>("tasks", {
  ids: { cols: ["id"] },
  projectIdState: { cols: ["projectId", "state", "lastToggledAt"] },
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
});
