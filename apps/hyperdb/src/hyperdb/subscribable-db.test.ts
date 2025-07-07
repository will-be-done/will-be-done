import { describe, expect, it } from "vitest";
import { SubscribableDB, type Op } from "./subscribable-db";
import { DB } from "./db";
import { BptreeInmemDriver } from "./drivers/bptree-inmem-driver";
import { table } from "./table";
// import { SqlDriver } from "./drivers/SqlDriver";

type Task = {
  id: string;
  title: string;
  state: "todo" | "done";
  projectId: string;
  orderToken: string;
};

const tasksTable = table<Task>("tasks").withIndexes({
  ids: { cols: ["id"], type: "hash" },
  projectIdState: { cols: ["projectId", "state"], type: "btree" },
});

describe("SubscribableDB", () => {
  for (const driver of [new BptreeInmemDriver()]) {
    describe(`with ${driver.constructor.name}`, () => {
      it("should subscribe to operations and receive correct notifications", () => {
        const db = new DB(driver, [tasksTable]);
        const subscribableDB = new SubscribableDB(db);

        const operations: Op[] = [];
        const unsubscribe = subscribableDB.subscribe((op) => {
          operations.push(...op);
        });

        const tasks: Task[] = [
          {
            id: "task-1",
            title: "Task 1",
            state: "todo",
            projectId: "project-1",
            orderToken: "a",
          },
          {
            id: "task-2",
            title: "Task 2",
            state: "done",
            projectId: "project-1",
            orderToken: "b",
          },
        ];

        // Test insert operations
        subscribableDB.insert(tasksTable, tasks);

        expect(operations).toHaveLength(2);
        expect(operations[0]).toEqual({
          type: "insert",
          table: tasksTable,
          newValue: tasks[0],
        });
        expect(operations[1]).toEqual({
          type: "insert",
          table: tasksTable,
          newValue: tasks[1],
        });

        // Test update operations
        const updatedTasks: Task[] = [
          {
            id: "task-1",
            title: "Updated Task 1",
            state: "done",
            projectId: "project-1",
            orderToken: "a",
          },
        ];

        subscribableDB.update(tasksTable, updatedTasks);

        expect(operations).toHaveLength(3);
        expect(operations[2]).toEqual({
          type: "update",
          table: tasksTable,
          oldValue: tasks[0],
          newValue: updatedTasks[0],
        });

        // Test delete operations
        subscribableDB.delete(tasksTable, ["task-2"]);

        expect(operations).toHaveLength(4);
        expect(operations[3]).toEqual({
          type: "delete",
          table: tasksTable,
          oldValue: tasks[1],
        });

        unsubscribe();
      });

      it("should handle multiple subscribers correctly", () => {
        const db = new DB(driver, [tasksTable]);
        const subscribableDB = new SubscribableDB(db);

        const operations1: Op[] = [];
        const operations2: Op[] = [];

        const unsubscribe1 = subscribableDB.subscribe((op) => {
          operations1.push(...op);
        });
        const unsubscribe2 = subscribableDB.subscribe((op) => {
          operations2.push(...op);
        });

        const task: Task = {
          id: "task-1",
          title: "Task 1",
          state: "todo",
          projectId: "project-1",
          orderToken: "a",
        };

        subscribableDB.insert(tasksTable, [task]);

        expect(operations1).toHaveLength(1);
        expect(operations2).toHaveLength(1);
        expect(operations1[0]).toEqual(operations2[0]);

        unsubscribe1();
        unsubscribe2();
      });

      it("should properly unsubscribe and not receive further notifications", () => {
        const db = new DB(driver, [tasksTable]);
        const subscribableDB = new SubscribableDB(db);

        const operations: Op[] = [];
        const unsubscribe = subscribableDB.subscribe((op) => {
          operations.push(...op);
        });

        const task: Task = {
          id: "task-1",
          title: "Task 1",
          state: "todo",
          projectId: "project-1",
          orderToken: "a",
        };

        subscribableDB.insert(tasksTable, [task]);
        expect(operations).toHaveLength(1);

        unsubscribe();

        subscribableDB.insert(tasksTable, [
          {
            id: "task-2",
            title: "Task 2",
            state: "todo",
            projectId: "project-1",
            orderToken: "b",
          },
        ]);

        expect(operations).toHaveLength(1);
      });

      it("should handle update operations with non-existent records", () => {
        const db = new DB(driver, [tasksTable]);
        const subscribableDB = new SubscribableDB(db);

        const nonExistentTask: Task = {
          id: "non-existent",
          title: "Non-existent Task",
          state: "todo",
          projectId: "project-1",
          orderToken: "a",
        };

        expect(() => {
          subscribableDB.update(tasksTable, [nonExistentTask]);
        }).toThrow("Failed to update record, no previous record found");
      });

      it("should handle delete operations with non-existent records", () => {
        const db = new DB(driver, [tasksTable]);
        const subscribableDB = new SubscribableDB(db);

        const operations: Op[] = [];
        subscribableDB.subscribe((op) => {
          operations.push(...op);
        });

        // Delete non-existent record should not throw or notify
        subscribableDB.delete(tasksTable, ["non-existent"]);

        expect(operations).toHaveLength(0);
      });

      it("should delegate scan operations correctly", () => {
        const db = new DB(driver, [tasksTable]);
        const subscribableDB = new SubscribableDB(db);

        const tasks: Task[] = [
          {
            id: "task-1",
            title: "Task 1",
            state: "todo",
            projectId: "project-1",
            orderToken: "a",
          },
          {
            id: "task-2",
            title: "Task 2",
            state: "done",
            projectId: "project-1",
            orderToken: "b",
          },
        ];

        subscribableDB.insert(tasksTable, tasks);

        // Test intervalScan
        const intervalResults = Array.from(
          subscribableDB.intervalScan(tasksTable, "ids", [
            {
              gte: ["task-1"],
              lte: ["task-1"],
            },
          ]),
        );
        expect(intervalResults).toHaveLength(1);
        expect(intervalResults[0]).toEqual(tasks[0]);
      });

      it("should handle batch operations correctly", () => {
        const db = new DB(driver, [tasksTable]);
        const subscribableDB = new SubscribableDB(db);

        const operations: Op[] = [];
        subscribableDB.subscribe((op) => {
          operations.push(...op);
        });

        const tasks: Task[] = [
          {
            id: "task-1",
            title: "Task 1",
            state: "todo",
            projectId: "project-1",
            orderToken: "a",
          },
          {
            id: "task-2",
            title: "Task 2",
            state: "done",
            projectId: "project-1",
            orderToken: "b",
          },
          {
            id: "task-3",
            title: "Task 3",
            state: "todo",
            projectId: "project-2",
            orderToken: "c",
          },
        ];

        // Batch insert
        subscribableDB.insert(tasksTable, tasks);

        expect(operations).toHaveLength(3);
        operations.forEach((op, index) => {
          expect(op.type).toBe("insert");
          if (op.type === "insert") {
            expect(op.newValue).toEqual(tasks[index]);
          }
        });

        // Batch update
        const updatedTasks = tasks.map((task) => ({
          ...task,
          title: `Updated ${task.title}`,
        }));

        subscribableDB.update(tasksTable, updatedTasks);

        expect(operations).toHaveLength(6);
        for (let i = 3; i < 6; i++) {
          const op = operations[i];
          expect(op.type).toBe("update");
          if (op.type === "update") {
            expect(op.oldValue).toEqual(tasks[i - 3]);
            expect(op.newValue).toEqual(updatedTasks[i - 3]);
          }
        }

        // Batch delete
        subscribableDB.delete(tasksTable, ["task-1", "task-3"]);

        expect(operations).toHaveLength(8);
        const op6 = operations[6];
        const op7 = operations[7];

        expect(op6.type).toBe("delete");
        if (op6.type === "delete") {
          expect(op6.oldValue).toEqual(updatedTasks[0]);
        }

        expect(op7.type).toBe("delete");
        if (op7.type === "delete") {
          expect(op7.oldValue).toEqual(updatedTasks[2]);
        }
      });

      it("should handle operations with empty arrays", () => {
        const db = new DB(driver, [tasksTable]);
        const subscribableDB = new SubscribableDB(db);

        const operations: Op[] = [];
        subscribableDB.subscribe((op) => {
          operations.push(...op);
        });

        // Empty insert
        subscribableDB.insert(tasksTable, []);
        expect(operations).toHaveLength(0);

        // Empty update
        subscribableDB.update(tasksTable, []);
        expect(operations).toHaveLength(0);

        // Empty delete
        subscribableDB.delete(tasksTable, []);
        expect(operations).toHaveLength(0);
      });

      it("should handle complex workflow with mixed operations", () => {
        const db = new DB(driver, [tasksTable]);
        const subscribableDB = new SubscribableDB(db);

        const operations: Op[] = [];
        subscribableDB.subscribe((op) => {
          operations.push(...op);
        });

        // Step 1: Insert initial tasks
        const initialTasks: Task[] = [
          {
            id: "task-1",
            title: "Task 1",
            state: "todo",
            projectId: "project-1",
            orderToken: "a",
          },
          {
            id: "task-2",
            title: "Task 2",
            state: "todo",
            projectId: "project-1",
            orderToken: "b",
          },
        ];

        subscribableDB.insert(tasksTable, initialTasks);

        // Step 2: Update one task
        const updatedTask: Task = {
          ...initialTasks[0],
          state: "done",
          title: "Completed Task 1",
        };

        subscribableDB.update(tasksTable, [updatedTask]);

        // Step 3: Insert another task
        const newTask: Task = {
          id: "task-3",
          title: "Task 3",
          state: "todo",
          projectId: "project-2",
          orderToken: "c",
        };

        subscribableDB.insert(tasksTable, [newTask]);

        // Step 4: Delete a task
        subscribableDB.delete(tasksTable, ["task-2"]);

        // Verify all operations were captured correctly
        expect(operations).toHaveLength(5);

        // Check insert operations
        expect(operations[0]).toEqual({
          type: "insert",
          table: tasksTable,
          newValue: initialTasks[0],
        });
        expect(operations[1]).toEqual({
          type: "insert",
          table: tasksTable,
          newValue: initialTasks[1],
        });

        // Check update operation
        expect(operations[2]).toEqual({
          type: "update",
          table: tasksTable,
          oldValue: initialTasks[0],
          newValue: updatedTask,
        });

        // Check second insert operation
        expect(operations[3]).toEqual({
          type: "insert",
          table: tasksTable,
          newValue: newTask,
        });

        // Check delete operation
        expect(operations[4]).toEqual({
          type: "delete",
          table: tasksTable,
          oldValue: initialTasks[1],
        });

        // Verify final state by scanning
        const finalTasks = Array.from(
          subscribableDB.intervalScan(tasksTable, "projectIdState", [{}]),
        );
        expect(finalTasks).toHaveLength(2);
        expect(finalTasks.find((t) => t.id === "task-1")).toEqual(updatedTask);
        expect(finalTasks.find((t) => t.id === "task-3")).toEqual(newTask);
      });
    });
  }
});
