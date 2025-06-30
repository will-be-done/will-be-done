import { describe, it } from "vitest";
import { InmemDB, SELF, table } from "./inmem_simple_hyperdb";

describe("InmemDB", () => {
  it("works with todo app", () => {
    type Task = {
      type: "task";
      id: string;
      title: string;
      state: "todo" | "done";
      projectId: string;
      orderToken: string;
    };

    const tasksTable = table<Task>("task", {
      ids: { path: ["id"], value: SELF },
      projectOrdered: { path: ["projectId", "orderToken"], value: "id" },
    });

    const db = new InmemDB([tasksTable]);

    db.insert(tasksTable, {
      id: "1",
      title: "Task 1",
      state: "todo",
      projectId: "1",
      orderToken: "b",
      type: "task",
    });

    db.insert(tasksTable, {
      id: "2",
      title: "Task 2",
      state: "todo",
      projectId: "1",
      orderToken: "b",
      type: "task",
    });

    db.insert(tasksTable, {
      id: "3",
      title: "Task 2",
      state: "todo",
      projectId: "1",
      orderToken: "c",
      type: "task",
    });

    db.insert(tasksTable, {
      id: "4",
      title: "Task 2",
      state: "todo",
      projectId: "2",
      orderToken: "b",
      type: "task",
    });

    console.log(
      Array.from(db.scan(tasksTable, "ids", { gte: ["1"], lte: ["1"] })),
    );

    const res = Array.from(
      db.scan(tasksTable, "projectOrdered", { gte: ["1"], lte: ["1", true] }),
    ); // res var type should be string[], but it's Task[]

    console.log(res);
  });
});
