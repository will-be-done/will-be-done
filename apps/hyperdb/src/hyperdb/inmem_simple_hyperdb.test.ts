import { describe, expect, it } from "vitest";
import { DB, InmemDriver, SqlDriver, table } from "./inmem_simple_hyperdb";

describe("InmemDB", async () => {
  for (const driver of [await SqlDriver.init(), new InmemDriver()]) {
    it("works with todo app", () => {
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
        projectOrdered: { cols: ["projectId", "orderToken"] },
        done: { cols: ["projectId", "state", "lastToggledAt"] },
      });

      const db = new DB(driver, [tasksTable]);

      const tasks: Task[] = [
        {
          id: "1",
          title: "Task 1",
          state: "done",
          projectId: "1",
          orderToken: "b",
          type: "task",
          lastToggledAt: 0,
        },
        {
          id: "2",
          title: "Task 2",
          state: "todo",
          projectId: "1",
          orderToken: "b",
          type: "task",
          lastToggledAt: 1,
        },
        {
          id: "3",
          title: "Task 2",
          state: "done",
          projectId: "1",
          orderToken: "c",
          type: "task",
          lastToggledAt: 2,
        },
        {
          id: "4",
          title: "Task 2",
          state: "todo",
          projectId: "2",
          orderToken: "b",
          type: "task",
          lastToggledAt: 3,
        },
      ];
      db.insert(tasksTable, tasks);

      const byIds = function (ids: string[]) {
        const tasks: Task[] = [];

        for (const id of ids) {
          tasks.push(
            ...Array.from(db.scan(tasksTable, "ids", { gte: [id], lte: [id] })),
          );
        }

        return tasks;
      };

      const doneChildrenIds = function (
        projectId: string,
        alwaysIncludeTaskIds: string[],
      ) {
        const tasks: Task[] = Array.from(
          db.scan(tasksTable, "done", {
            lte: [projectId, "done"],
            gte: [projectId, "done"],
          }),
        );
        tasks.push(...byIds(alwaysIncludeTaskIds));
        return tasks;
      };

      expect(doneChildrenIds("1", [])).toEqual([tasks[0], tasks[2]]);
      expect(doneChildrenIds("1", ["4"])).toEqual([
        tasks[0],
        tasks[2],
        tasks[3],
      ]);
    });
  }
});
