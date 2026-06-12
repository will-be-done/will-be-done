import { describe, expect, it } from "vitest";
import { SubscribableDB, type Op } from "./subscribable-db";
import { DB } from "./db";
import { SyncDB } from "./sync-db";
import { BptreeInmemDriver } from "../drivers/inmemory/bptree-inmem-driver";
import { defineTable } from "../schema/table";
import { initSqlJsWasm } from "../drivers/sqlite/init-sql-js-wasm";
import { v } from "../schema/values";
import { selectFrom } from "../commands/query/builder";
import { deleteRows, insert, upsert } from "../commands/action/builders";

type Task = {
  id: string;
  title: string;
  state: "todo" | "done";
  projectId: string;
  orderToken: string;
};

const tasksTable = defineTable("tasks", {
  id: v.string(),
  title: v.string(),
  state: v.union(v.literal("todo"), v.literal("done")),
  projectId: v.string(),
  orderToken: v.string(),
}).index("projectIdState", ["projectId", "state"]);

const taskAuditsTable = defineTable("taskAudits", {
  id: v.string(),
  taskId: v.string(),
  phase: v.union(v.literal("inserted"), v.literal("updated")),
  title: v.string(),
}).index("byTaskId", ["taskId"]);

type TaskCount = {
  id: string;
  todo: number;
  done: number;
};

const taskCountsTable = defineTable("taskCounts", {
  id: v.string(),
  todo: v.number(),
  done: v.number(),
});

describe("SubscribableDB", async () => {
  for (const [driver, driverName] of [
    [async () => new BptreeInmemDriver(), "BptreeInmemDriver"],
    [async () => await initSqlJsWasm(), "SqlDriver"],
  ] as const) {
    describe(`with ${driverName}`, () => {
      it("should subscribe to operations and receive correct notifications", async () => {
        const db = new DB(await driver());
        const subscribableDB = new SubscribableDB(db);

        const operations: Op[] = [];
        const unsubscribe = subscribableDB.subscribe((op) => {
          operations.push(...op);
        });

        const syncDB = new SyncDB(subscribableDB);
        syncDB.loadTables([tasksTable]);

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
        syncDB.insert(tasksTable, tasks);

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

        // Test upsert operations
        const updatedTasks: Task[] = [
          {
            id: "task-1",
            title: "Updated Task 1",
            state: "done",
            projectId: "project-1",
            orderToken: "a",
          },
        ];

        syncDB.upsert(tasksTable, updatedTasks);

        expect(operations).toHaveLength(3);
        expect(operations[2]).toEqual({
          type: "upsert",
          table: tasksTable,
          oldValue: tasks[0],
          newValue: updatedTasks[0],
        });

        // Test delete operations
        syncDB.delete(tasksTable, ["task-2"]);

        expect(operations).toHaveLength(4);
        expect(operations[3]).toEqual({
          type: "delete",
          table: tasksTable,
          oldValue: tasks[1],
        });

        unsubscribe();
      });

      it("should handle multiple subscribers correctly", async () => {
        const db = new DB(await driver());
        const subscribableDB = new SubscribableDB(db);

        const syncDB = new SyncDB(subscribableDB);
        syncDB.loadTables([tasksTable]);

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

        syncDB.insert(tasksTable, [task]);

        expect(operations1).toHaveLength(1);
        expect(operations2).toHaveLength(1);
        expect(operations1[0]).toEqual(operations2[0]);

        unsubscribe1();
        unsubscribe2();
      });

      it("should notify a snapshot of subscribers for each commit", async () => {
        const db = new DB(await driver());
        const subscribableDB = new SubscribableDB(db);
        const traitedDB = subscribableDB.withTraits({
          type: "traited",
        }) as SubscribableDB;

        const syncDB = new SyncDB(subscribableDB);
        syncDB.loadTables([tasksTable]);

        const calls: string[] = [];
        const revisions: number[] = [];
        const withTraitsRevisionObservations: {
          callbackRevision: number;
          baseRevision: number;
          traitedRevision: number;
        }[] = [];

        subscribableDB.subscribe((_ops, _traits, revision) => {
          revisions.push(revision);
        });

        traitedDB.subscribe((_ops, _traits, revision) => {
          withTraitsRevisionObservations.push({
            callbackRevision: revision,
            baseRevision: subscribableDB.getRevision(),
            traitedRevision: traitedDB.getRevision(),
          });
        });

        subscribableDB.subscribe(() => {
          calls.push("first");
          subscribableDB.subscribe(() => {
            calls.push("second");
          });
        });

        syncDB.insert(tasksTable, [
          {
            id: "task-1",
            title: "Task 1",
            state: "todo",
            projectId: "project-1",
            orderToken: "a",
          },
        ]);

        expect(calls).toEqual(["first"]);
        expect(revisions).toEqual([1]);
        expect(withTraitsRevisionObservations).toEqual([
          {
            callbackRevision: 1,
            baseRevision: 1,
            traitedRevision: 1,
          },
        ]);

        syncDB.insert(tasksTable, [
          {
            id: "task-2",
            title: "Task 2",
            state: "todo",
            projectId: "project-1",
            orderToken: "b",
          },
        ]);

        expect(calls).toEqual(["first", "first", "second"]);
        expect(revisions).toEqual([1, 2]);
        expect(revisions[1]).toBeGreaterThan(revisions[0]);
        expect(withTraitsRevisionObservations).toEqual([
          {
            callbackRevision: 1,
            baseRevision: 1,
            traitedRevision: 1,
          },
          {
            callbackRevision: 2,
            baseRevision: 2,
            traitedRevision: 2,
          },
        ]);
      });

      it("should unsubscribe subscribers registered through withTraits", async () => {
        const db = new DB(await driver());
        const subscribableDB = new SubscribableDB(db);
        const traitedDB = subscribableDB.withTraits({
          type: "traited",
        }) as SubscribableDB;

        const syncDB = new SyncDB(subscribableDB);
        syncDB.loadTables([tasksTable]);

        const operations: Op[] = [];
        const unsubscribe = traitedDB.subscribe((op) => {
          operations.push(...op);
        });

        unsubscribe();

        syncDB.insert(tasksTable, [
          {
            id: "task-1",
            title: "Task 1",
            state: "todo",
            projectId: "project-1",
            orderToken: "a",
          },
        ]);

        expect(operations).toEqual([]);
      });

      it("should properly unsubscribe and not receive further notifications", async () => {
        const db = new DB(await driver());
        const subscribableDB = new SubscribableDB(db);
        const syncDB = new SyncDB(subscribableDB);
        syncDB.loadTables([tasksTable]);

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

        syncDB.insert(tasksTable, [task]);
        expect(operations).toHaveLength(1);

        unsubscribe();

        syncDB.insert(tasksTable, [
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

      it("should handle upsert operations with non-existent records", async () => {
        const db = new DB(await driver());
        const subscribableDB = new SubscribableDB(db);

        const syncDB = new SyncDB(subscribableDB);
        syncDB.loadTables([tasksTable]);

        const operations: Op[] = [];
        subscribableDB.subscribe((op) => {
          operations.push(...op);
        });

        const nonExistentTask: Task = {
          id: "non-existent",
          title: "Non-existent Task",
          state: "todo",
          projectId: "project-1",
          orderToken: "a",
        };

        syncDB.upsert(tasksTable, [nonExistentTask]);

        expect(operations).toEqual([
          {
            type: "upsert",
            table: tasksTable,
            oldValue: undefined,
            newValue: nonExistentTask,
          },
        ]);
        expect(
          syncDB.intervalScan(tasksTable, "byId", [
            { eq: [{ col: "id", val: nonExistentTask.id }] },
          ]),
        ).toEqual([nonExistentTask]);
      });

      it("should dedupe duplicate upsert ids before emitting operations", async () => {
        const db = new DB(await driver());
        const subscribableDB = new SubscribableDB(db);

        const syncDB = new SyncDB(subscribableDB);
        syncDB.loadTables([tasksTable]);

        const originalTask: Task = {
          id: "task-1",
          title: "Task 1",
          state: "todo",
          projectId: "project-1",
          orderToken: "a",
        };
        const staleUpdate: Task = {
          ...originalTask,
          title: "Stale update",
        };
        const finalUpdate: Task = {
          ...originalTask,
          title: "Final update",
          state: "done",
        };

        syncDB.insert(tasksTable, [originalTask]);

        const operations: Op[] = [];
        subscribableDB.subscribe((op) => {
          operations.push(...op);
        });

        syncDB.upsert(tasksTable, [staleUpdate, finalUpdate]);

        expect(operations).toEqual([
          {
            type: "upsert",
            table: tasksTable,
            oldValue: originalTask,
            newValue: finalUpdate,
          },
        ]);
        expect(
          syncDB.intervalScan(tasksTable, "byId", [
            { eq: [{ col: "id", val: finalUpdate.id }] },
          ]),
        ).toEqual([finalUpdate]);
      });

      it("should handle delete operations with non-existent records", async () => {
        const db = new DB(await driver());
        const subscribableDB = new SubscribableDB(db);

        const syncDB = new SyncDB(subscribableDB);
        syncDB.loadTables([tasksTable]);

        const operations: Op[] = [];
        subscribableDB.subscribe((op) => {
          operations.push(...op);
        });

        // Delete non-existent record should not throw or notify
        syncDB.delete(tasksTable, ["non-existent"]);

        expect(operations).toHaveLength(0);
      });

      it("should delegate scan operations correctly", async () => {
        const db = new DB(await driver());
        const subscribableDB = new SubscribableDB(db);

        const syncDB = new SyncDB(subscribableDB);
        syncDB.loadTables([tasksTable]);

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

        syncDB.insert(tasksTable, tasks);

        // Test intervalScan
        const intervalResults = syncDB.intervalScan(tasksTable, "byId", [
          {
            eq: [{ col: "id", val: "task-1" }],
          },
        ]);

        expect(intervalResults).toHaveLength(1);
        expect(intervalResults[0]).toEqual(tasks[0]);
      });

      it("should allow after callbacks to use action commands", async () => {
        const db = new DB(await driver());
        const subscribableDB = new SubscribableDB(db);

        const syncDB = new SyncDB(subscribableDB);
        syncDB.loadTables([tasksTable, taskAuditsTable]);

        const snapshots: Task[][] = [];

        subscribableDB.afterInsert(function* (_db, table, _traits, ops) {
          if (table !== tasksTable) return;

          const tasks = yield* selectFrom(tasksTable, "projectIdState").where(
            (q) => q.eq("projectId", "project-1"),
          );

          snapshots.push(tasks);

          yield* insert(
            taskAuditsTable,
            ops.map((op) => {
              const task = op.newValue as Task;

              return {
                id: `audit-${task.id}`,
                taskId: task.id,
                phase: "inserted",
                title: task.title,
              };
            }),
          );
        });

        subscribableDB.afterUpsert(function* (_db, table, _traits, ops) {
          if (table !== tasksTable) return;

          for (const op of ops) {
            const updatedTask = op.newValue as Task;
            const audits = yield* selectFrom(taskAuditsTable, "byTaskId").where(
              (q) => q.eq("taskId", updatedTask.id),
            );

            yield* upsert(taskAuditsTable, [
              {
                ...audits[0],
                phase: "updated",
                title: updatedTask.title,
              },
            ]);
          }
        });

        subscribableDB.afterDelete(function* (_db, table, _traits, ops) {
          if (table !== tasksTable) return;

          yield* deleteRows(
            taskAuditsTable,
            ops.map((op) => `audit-${op.oldValue.id}`),
          );
        });

        const tasks = [
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
        ] satisfies Task[];

        syncDB.insert(tasksTable, tasks);

        expect(snapshots).toHaveLength(1);
        expect(snapshots[0]).toHaveLength(2);
        expect(snapshots[0]).toEqual(expect.arrayContaining(tasks));

        expect(
          syncDB.intervalScan(taskAuditsTable, "byTaskId", [
            { eq: [{ col: "taskId", val: "task-1" }] },
          ]),
        ).toEqual([
          {
            id: "audit-task-1",
            taskId: "task-1",
            phase: "inserted",
            title: "Task 1",
          },
        ]);

        const updatedTask = { ...tasks[0], title: "Updated Task 1" };

        syncDB.upsert(tasksTable, [updatedTask]);

        expect(
          syncDB.intervalScan(taskAuditsTable, "byTaskId", [
            { eq: [{ col: "taskId", val: "task-1" }] },
          ]),
        ).toEqual([
          {
            id: "audit-task-1",
            taskId: "task-1",
            phase: "updated",
            title: "Updated Task 1",
          },
        ]);

        syncDB.delete(tasksTable, ["task-1"]);

        expect(
          syncDB.intervalScan(taskAuditsTable, "byTaskId", [
            { eq: [{ col: "taskId", val: "task-1" }] },
          ]),
        ).toEqual([]);
      });

      it("should allow afterChange callbacks to persist aggregate rows", async () => {
        const db = new DB(await driver());
        const subscribableDB = new SubscribableDB(db);

        const syncDB = new SyncDB(subscribableDB);
        syncDB.loadTables([tasksTable, taskCountsTable]);

        const emptyCount: TaskCount = { id: "tasks", todo: 0, done: 0 };
        const adjust = (
          count: TaskCount,
          state: Task["state"],
          delta: 1 | -1,
        ): TaskCount => ({
          ...count,
          [state]: count[state] + delta,
        });

        subscribableDB.afterChange(function* (_db, table, _traits, ops) {
          if (table !== tasksTable) return;

          let nextCount =
            (yield* selectFrom(taskCountsTable, "byId").where((q) =>
              q.eq("id", "tasks"),
            ))[0] ?? emptyCount;

          for (const op of ops) {
            if (op.type === "insert") {
              nextCount = adjust(nextCount, (op.newValue as Task).state, 1);
            } else if (op.type === "upsert") {
              if (op.oldValue) {
                nextCount = adjust(nextCount, (op.oldValue as Task).state, -1);
              }
              nextCount = adjust(nextCount, (op.newValue as Task).state, 1);
            } else {
              nextCount = adjust(nextCount, (op.oldValue as Task).state, -1);
            }
          }

          yield* upsert(taskCountsTable, [nextCount]);
        });

        const tasks = [
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
        ] satisfies Task[];

        syncDB.insert(tasksTable, tasks);
        syncDB.upsert(tasksTable, [{ ...tasks[0], state: "done" }]);
        syncDB.delete(tasksTable, ["task-2"]);

        expect(
          syncDB.intervalScan(taskCountsTable, "byId", [
            { eq: [{ col: "id", val: "tasks" }] },
          ]),
        ).toEqual([{ id: "tasks", todo: 0, done: 1 }]);
      });

      it("should handle batch operations correctly", async () => {
        const db = new DB(await driver());
        const subscribableDB = new SubscribableDB(db);

        const syncDB = new SyncDB(subscribableDB);
        syncDB.loadTables([tasksTable]);

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
        syncDB.insert(tasksTable, tasks);

        expect(operations).toHaveLength(3);
        operations.forEach((op, index) => {
          expect(op.type).toBe("insert");
          if (op.type === "insert") {
            expect(op.newValue).toEqual(tasks[index]);
          }
        });

        // Batch upsert
        const updatedTasks = tasks.map((task) => ({
          ...task,
          title: `Updated ${task.title}`,
        }));

        syncDB.upsert(tasksTable, updatedTasks);

        expect(operations).toHaveLength(6);
        for (let i = 3; i < 6; i++) {
          const op = operations[i];
          expect(op.type).toBe("upsert");
          if (op.type === "upsert") {
            expect(op.oldValue).toEqual(tasks[i - 3]);
            expect(op.newValue).toEqual(updatedTasks[i - 3]);
          }
        }

        // Batch delete
        syncDB.delete(tasksTable, ["task-1", "task-3"]);

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

      it("should handle large operation batches without argument spread overflow", async () => {
        if (driverName === "SqlDriver") return;

        const db = new DB(await driver());
        const subscribableDB = new SubscribableDB(db);

        const syncDB = new SyncDB(subscribableDB);
        syncDB.loadTables([tasksTable]);

        let operationCount = 0;
        subscribableDB.subscribe((ops) => {
          operationCount += ops.length;
        });

        const tasks = Array.from({ length: 150_000 }, (_, index) => ({
          id: `task-${index}`,
          title: `Task ${index}`,
          state: index % 2 === 0 ? "todo" : "done",
          projectId: `project-${index % 10}`,
          orderToken: String(index).padStart(6, "0"),
        })) satisfies Task[];

        syncDB.insert(tasksTable, tasks);

        expect(operationCount).toBe(tasks.length);
      });

      it("should handle operations with empty arrays", async () => {
        const db = new DB(await driver());
        const subscribableDB = new SubscribableDB(db);

        const syncDB = new SyncDB(subscribableDB);
        syncDB.loadTables([tasksTable]);

        const operations: Op[] = [];
        subscribableDB.subscribe((op) => {
          operations.push(...op);
        });

        // Empty insert
        syncDB.insert(tasksTable, []);
        expect(operations).toHaveLength(0);

        // Empty upsert
        syncDB.upsert(tasksTable, []);
        expect(operations).toHaveLength(0);

        // Empty delete
        syncDB.delete(tasksTable, []);
        expect(operations).toHaveLength(0);
      });

      it("should handle complex workflow with mixed operations", async () => {
        const db = new DB(await driver());
        const subscribableDB = new SubscribableDB(db);

        const syncDB = new SyncDB(subscribableDB);
        syncDB.loadTables([tasksTable]);

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

        syncDB.insert(tasksTable, initialTasks);

        // Step 2: Update one task
        const updatedTask: Task = {
          ...initialTasks[0],
          state: "done",
          title: "Completed Task 1",
        };

        syncDB.upsert(tasksTable, [updatedTask]);

        // Step 3: Insert another task
        const newTask: Task = {
          id: "task-3",
          title: "Task 3",
          state: "todo",
          projectId: "project-2",
          orderToken: "c",
        };

        syncDB.insert(tasksTable, [newTask]);

        // Step 4: Delete a task
        syncDB.delete(tasksTable, ["task-2"]);

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

        // Check upsert operation
        expect(operations[2]).toEqual({
          type: "upsert",
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
        const finalTasks = syncDB.intervalScan(tasksTable, "projectIdState", [
          {},
        ]);

        expect(finalTasks).toHaveLength(2);
        expect(finalTasks.find((t) => t.id === "task-1")).toEqual(updatedTask);
        expect(finalTasks.find((t) => t.id === "task-3")).toEqual(newTask);
      });
    });
  }
});
