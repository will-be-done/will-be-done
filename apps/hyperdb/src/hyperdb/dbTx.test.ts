import { describe, expect, it } from "vitest";
import { BptreeInmemDriver } from "./drivers/bptree-inmem-driver";
import { table } from "./table";
import { DB, SyncDB, SyncDBTx, type HyperDB, type HyperDBTx } from "./db";
import { SqlDriver } from "./drivers/SqlDriver";
// import { SqlDriver } from "./drivers/SqlDriver";

type Task = {
  id: string;
  title: string;
};

const tasksTable = table<Task>("tasks").withIndexes({
  byId: { cols: ["id"], type: "hash" },
  byIds: { cols: ["id"], type: "btree" },
  byTitle: { cols: ["title"], type: "hash" },
  byTitles: { cols: ["title"], type: "btree" },
});

describe("Database Transactions", async () => {
  for (const [driver, name] of [
    // new InmemDriver(),
    [async () => SqlDriver.init(), "SqlDriver"],
    [async () => new BptreeInmemDriver(), "BptreeInmemDriver"],
  ] as const) {
    describe(`${name}`, () => {
      it("basic transaction operations", async () => {
        const db = new SyncDB(new DB(await driver()));
        db.loadTables([tasksTable]);

        const tx = db.beginTx();

        const makeScan = (idxName: "byId" | "byIds", d: SyncDBTx | SyncDB) =>
          d.intervalScan(tasksTable, idxName, [
            {
              eq: [{ col: "id", val: "task-1" }],
            },
          ]);

        const task1: Task = {
          id: "task-1",
          title: "Task 1",
        };
        const task2: Task = {
          id: "task-2",
          title: "Task 2",
        };
        tx.insert(tasksTable, [task1, task2]);

        const btreeTxData = makeScan("byIds", tx);
        const hashTxData = makeScan("byId", tx);
        expect(btreeTxData.length).toBe(1);
        expect(btreeTxData).toEqual(hashTxData);

        tx.update(tasksTable, [{ ...task1, title: "Task 11" }]);
        tx.rollback();

        const btreeData = makeScan("byIds", db);
        const hashData = makeScan("byId", db);

        expect(btreeData.length).toBe(0);
        expect(hashData.length).toBe(0);
      });

      it.skip("transaction commit makes changes visible", async () => {
        const db = new SyncDB(new DB(await driver()));
        db.loadTables([tasksTable]);
        const tx = db.beginTx();

        const task: Task = {
          id: "task-commit",
          title: "Commit Test",
        };

        tx.insert(tasksTable, [task]);

        // Changes should not be visible in main db before commit
        const beforeCommit = Array.from(
          db.intervalScan(tasksTable, "byId", [
            { eq: [{ col: "id", val: "task-commit" }] },
          ]),
        );
        expect(beforeCommit.length).toBe(0);

        tx.commit();

        // Changes should be visible in main db after commit
        const afterCommit = Array.from(
          db.intervalScan(tasksTable, "byId", [
            { eq: [{ col: "id", val: "task-commit" }] },
          ]),
        );
        expect(afterCommit.length).toBe(1);
        expect(afterCommit[0]).toEqual(task);
      });

      it("transaction rollback discards changes", async () => {
        const db = new SyncDB(new DB(await driver()));
        db.loadTables([tasksTable]);

        // Insert initial data
        const initialTask: Task = {
          id: "task-initial",
          title: "Initial Task",
        };
        db.insert(tasksTable, [initialTask]);

        const tx = db.beginTx();

        // Insert new task in transaction
        const newTask: Task = {
          id: "task-rollback",
          title: "Rollback Test",
        };
        tx.insert(tasksTable, [newTask]);

        // Update existing task in transaction
        tx.update(tasksTable, [{ ...initialTask, title: "Updated Title" }]);

        // Delete existing task in transaction
        tx.delete(tasksTable, ["task-initial"]);

        // Rollback changes
        tx.rollback();

        // New task should not exist
        const newTaskResult = db.intervalScan(tasksTable, "byId", [
          { eq: [{ col: "id", val: "task-rollback" }] },
        ]);
        expect(newTaskResult.length).toBe(0);

        // Original task should be unchanged
        const originalTaskResult = db.intervalScan(tasksTable, "byId", [
          { eq: [{ col: "id", val: "task-initial" }] },
        ]);
        expect(originalTaskResult.length).toBe(1);
        expect(originalTaskResult[0]).toEqual(initialTask);
      });

      it.skip("transaction isolation - reads don't see uncommitted changes", async () => {
        const db = new SyncDB(new DB(await driver()));
        db.loadTables([tasksTable]);

        const task1: Task = {
          id: "task-isolation-1",
          title: "Isolation Test 1",
        };

        const tx1 = db.beginTx();
        tx1.insert(tasksTable, [task1]);

        // Another transaction should not see uncommitted changes
        const tx2 = db.beginTx();
        const tx2Result = Array.from(
          tx2.intervalScan(tasksTable, "byId", [
            { eq: [{ col: "id", val: "task-isolation-1" }] },
          ]),
        );
        expect(tx2Result.length).toBe(0);

        // Main db should not see uncommitted changes
        const dbResult = Array.from(
          db.intervalScan(tasksTable, "byId", [
            { eq: [{ col: "id", val: "task-isolation-1" }] },
          ]),
        );
        expect(dbResult.length).toBe(0);

        tx1.commit();
        tx2.rollback();

        // Now the committed changes should be visible
        const finalResult = Array.from(
          db.intervalScan(tasksTable, "byId", [
            { eq: [{ col: "id", val: "task-isolation-1" }] },
          ]),
        );
        expect(finalResult.length).toBe(1);
      });

      it("transaction with multiple operations", async () => {
        const db = new SyncDB(new DB(await driver()));
        db.loadTables([tasksTable]);

        // Insert initial data
        const task1: Task = { id: "task-1", title: "Task 1" };
        const task2: Task = { id: "task-2", title: "Task 2" };
        db.insert(tasksTable, [task1, task2]);

        const tx = db.beginTx();

        // Insert new task
        const task3: Task = { id: "task-3", title: "Task 3" };
        tx.insert(tasksTable, [task3]);

        // Update existing task
        tx.update(tasksTable, [{ ...task1, title: "Updated Task 1" }]);

        // Delete existing task
        tx.delete(tasksTable, ["task-2"]);

        // Check transaction state before commit
        const txTask1 = Array.from(
          tx.intervalScan(tasksTable, "byId", [
            { eq: [{ col: "id", val: "task-1" }] },
          ]),
        );
        const txTask2 = Array.from(
          tx.intervalScan(tasksTable, "byId", [
            { eq: [{ col: "id", val: "task-2" }] },
          ]),
        );
        const txTask3 = Array.from(
          tx.intervalScan(tasksTable, "byId", [
            { eq: [{ col: "id", val: "task-3" }] },
          ]),
        );

        expect(txTask1[0].title).toBe("Updated Task 1");
        expect(txTask2.length).toBe(0); // Deleted
        expect(txTask3[0]).toEqual(task3);

        tx.commit();

        // Verify final state in main db
        const finalTask1 = Array.from(
          db.intervalScan(tasksTable, "byId", [
            { eq: [{ col: "id", val: "task-1" }] },
          ]),
        );
        const finalTask2 = Array.from(
          db.intervalScan(tasksTable, "byId", [
            { eq: [{ col: "id", val: "task-2" }] },
          ]),
        );
        const finalTask3 = Array.from(
          db.intervalScan(tasksTable, "byId", [
            { eq: [{ col: "id", val: "task-3" }] },
          ]),
        );

        expect(finalTask1[0].title).toBe("Updated Task 1");
        expect(finalTask2.length).toBe(0);
        expect(finalTask3[0]).toEqual(task3);
      });

      it("transaction with btree range queries", async () => {
        const db = new SyncDB(new DB(await driver()));
        db.loadTables([tasksTable]);

        const tx = db.beginTx();

        const tasks: Task[] = [
          { id: "task-a", title: "Apple" },
          { id: "task-b", title: "Banana" },
          { id: "task-c", title: "Cherry" },
          { id: "task-d", title: "Date" },
        ];

        tx.insert(tasksTable, tasks);

        // Range query on title
        const rangeResult = Array.from(
          tx.intervalScan(tasksTable, "byTitles", [
            {
              gte: [{ col: "title", val: "Banana" }],
              lt: [{ col: "title", val: "Date" }],
            },
          ]),
        );

        expect(rangeResult.length).toBe(2);
        expect(rangeResult.map((t) => t.title).sort()).toEqual([
          "Banana",
          "Cherry",
        ]);

        tx.commit();

        // Verify range query works after commit
        const postCommitResult = Array.from(
          db.intervalScan(tasksTable, "byTitles", [
            {
              gte: [{ col: "title", val: "Banana" }],
              lt: [{ col: "title", val: "Date" }],
            },
          ]),
        );

        expect(postCommitResult.length).toBe(2);
        expect(postCommitResult.map((t) => t.title).sort()).toEqual([
          "Banana",
          "Cherry",
        ]);
      });

      it("transaction error handling - double commit throws", async () => {
        const db = new SyncDB(new DB(await driver()));
        db.loadTables([tasksTable]);
        const tx = db.beginTx();

        const task: Task = { id: "task-error", title: "Error Test" };
        tx.insert(tasksTable, [task]);

        tx.commit();

        // Second commit should throw
        expect(() => tx.commit()).toThrow();
      });

      it("transaction error handling - double rollback throws", async () => {
        const db = new SyncDB(new DB(await driver()));
        db.loadTables([tasksTable]);
        const tx = db.beginTx();

        const task: Task = { id: "task-error", title: "Error Test" };
        tx.insert(tasksTable, [task]);

        tx.rollback();

        // Second rollback should throw
        expect(() => tx.rollback()).toThrow();
      });

      it("transaction error handling - operations after commit throw", async () => {
        const db = new SyncDB(new DB(await driver()));
        db.loadTables([tasksTable]);
        const tx = db.beginTx();

        const task: Task = { id: "task-error", title: "Error Test" };
        tx.insert(tasksTable, [task]);
        tx.commit();

        // Operations after commit should throw
        expect(() => tx.insert(tasksTable, [task])).toThrow();
        expect(() => tx.update(tasksTable, [task])).toThrow();
        expect(() => tx.delete(tasksTable, ["task-error"])).toThrow();
      });

      it("transaction error handling - operations after rollback throw", async () => {
        const db = new SyncDB(new DB(await driver()));
        db.loadTables([tasksTable]);
        const tx = db.beginTx();

        const task: Task = { id: "task-error", title: "Error Test" };
        tx.insert(tasksTable, [task]);
        tx.rollback();

        // Operations after rollback should throw
        expect(() => tx.insert(tasksTable, [task])).toThrow();
        expect(() => tx.update(tasksTable, [task])).toThrow();
        expect(() => tx.delete(tasksTable, ["task-error"])).toThrow();
      });

      it("transaction empty operations", async () => {
        const db = new SyncDB(new DB(await driver()));
        db.loadTables([tasksTable]);
        const tx = db.beginTx();

        // Empty operations should not throw
        tx.insert(tasksTable, []);
        tx.update(tasksTable, []);
        tx.delete(tasksTable, []);

        tx.commit();

        // Should complete without errors
        expect(true).toBe(true);
      });

      it("hash index equality queries in transactions", async () => {
        const db = new SyncDB(new DB(await driver()));
        db.loadTables([tasksTable]);

        const tasks: Task[] = [
          { id: "task-1", title: "Same Title" },
          { id: "task-2", title: "Same Title" },
          { id: "task-3", title: "Different Title" },
        ];

        const tx = db.beginTx();
        tx.insert(tasksTable, tasks);

        // Hash index query for same title
        const sameTitleResults = Array.from(
          tx.intervalScan(tasksTable, "byTitle", [
            { eq: [{ col: "title", val: "Same Title" }] },
          ]),
        );

        expect(sameTitleResults.length).toBe(2);
        expect(sameTitleResults.map((t) => t.id).sort()).toEqual([
          "task-1",
          "task-2",
        ]);

        // Hash index query for different title
        const differentTitleResults = Array.from(
          tx.intervalScan(tasksTable, "byTitle", [
            { eq: [{ col: "title", val: "Different Title" }] },
          ]),
        );

        expect(differentTitleResults.length).toBe(1);
        expect(differentTitleResults[0].id).toBe("task-3");

        tx.commit();

        // Verify after commit
        const postCommitResults = Array.from(
          db.intervalScan(tasksTable, "byTitle", [
            { eq: [{ col: "title", val: "Same Title" }] },
          ]),
        );
        expect(postCommitResults.length).toBe(2);
      });

      it("btree index range queries in transactions", async () => {
        const db = new SyncDB(new DB(await driver()));
        db.loadTables([tasksTable]);

        const tasks: Task[] = [
          { id: "task-1", title: "Apple" },
          { id: "task-2", title: "Banana" },
          { id: "task-3", title: "Cherry" },
          { id: "task-4", title: "Date" },
          { id: "task-5", title: "Elderberry" },
        ];

        const tx = db.beginTx();
        tx.insert(tasksTable, tasks);

        // Range query: titles >= "Banana" and < "Date"
        const rangeResults = Array.from(
          tx.intervalScan(tasksTable, "byTitles", [
            {
              gte: [{ col: "title", val: "Banana" }],
              lt: [{ col: "title", val: "Date" }],
            },
          ]),
        );

        expect(rangeResults.length).toBe(2);
        expect(rangeResults.map((t) => t.title).sort()).toEqual([
          "Banana",
          "Cherry",
        ]);

        // Range query: titles > "Cherry"
        const greaterResults = Array.from(
          tx.intervalScan(tasksTable, "byTitles", [
            {
              gt: [{ col: "title", val: "Cherry" }],
            },
          ]),
        );

        expect(greaterResults.length).toBe(2);
        expect(greaterResults.map((t) => t.title).sort()).toEqual([
          "Date",
          "Elderberry",
        ]);

        tx.commit();
      });

      it("transaction updates visible through both hash and btree indexes", async () => {
        const db = new SyncDB(new DB(await driver()));
        db.loadTables([tasksTable]);

        // Insert initial data
        const task: Task = { id: "task-update", title: "Original" };
        db.insert(tasksTable, [task]);

        const tx = db.beginTx();

        // Update task
        const updatedTask: Task = { id: "task-update", title: "Updated" };
        tx.update(tasksTable, [updatedTask]);

        // Query via hash index (id)
        const hashResult = Array.from(
          tx.intervalScan(tasksTable, "byId", [
            { eq: [{ col: "id", val: "task-update" }] },
          ]),
        );

        // Query via btree index (id)
        const btreeResult = Array.from(
          tx.intervalScan(tasksTable, "byIds", [
            { eq: [{ col: "id", val: "task-update" }] },
          ]),
        );

        // Query via hash index (title)
        const titleHashResult = Array.from(
          tx.intervalScan(tasksTable, "byTitle", [
            { eq: [{ col: "title", val: "Updated" }] },
          ]),
        );

        // Query via btree index (title)
        const titleBtreeResult = Array.from(
          tx.intervalScan(tasksTable, "byTitles", [
            { eq: [{ col: "title", val: "Updated" }] },
          ]),
        );

        expect(hashResult.length).toBe(1);
        expect(btreeResult.length).toBe(1);
        expect(titleHashResult.length).toBe(1);
        expect(titleBtreeResult.length).toBe(1);

        expect(hashResult[0]).toEqual(updatedTask);
        expect(btreeResult[0]).toEqual(updatedTask);
        expect(titleHashResult[0]).toEqual(updatedTask);
        expect(titleBtreeResult[0]).toEqual(updatedTask);

        // Old title should not be found
        const oldTitleResult = Array.from(
          tx.intervalScan(tasksTable, "byTitle", [
            { eq: [{ col: "title", val: "Original" }] },
          ]),
        );
        expect(oldTitleResult.length).toBe(0);

        tx.commit();
      });

      it("transaction deletes remove from both hash and btree indexes", async () => {
        const db = new SyncDB(new DB(await driver()));
        db.loadTables([tasksTable]);

        // Insert initial data
        const tasks: Task[] = [
          { id: "task-1", title: "Keep" },
          { id: "task-2", title: "Delete" },
          { id: "task-3", title: "Keep" },
        ];
        db.insert(tasksTable, tasks);

        const tx = db.beginTx();

        // Delete one task
        tx.delete(tasksTable, ["task-2"]);

        // Check via hash index (id)
        const hashIdResult = Array.from(
          tx.intervalScan(tasksTable, "byId", [
            { eq: [{ col: "id", val: "task-2" }] },
          ]),
        );

        // Check via btree index (id)
        const btreeIdResult = Array.from(
          tx.intervalScan(tasksTable, "byIds", [
            { eq: [{ col: "id", val: "task-2" }] },
          ]),
        );

        // Check via hash index (title)
        const hashTitleResult = Array.from(
          tx.intervalScan(tasksTable, "byTitle", [
            { eq: [{ col: "title", val: "Delete" }] },
          ]),
        );

        // Check via btree index (title)
        const btreeTitleResult = Array.from(
          tx.intervalScan(tasksTable, "byTitles", [
            { eq: [{ col: "title", val: "Delete" }] },
          ]),
        );

        expect(hashIdResult.length).toBe(0);
        expect(btreeIdResult.length).toBe(0);
        expect(hashTitleResult.length).toBe(0);
        expect(btreeTitleResult.length).toBe(0);

        // Remaining tasks should still be visible
        const remainingTasks = Array.from(
          tx.intervalScan(tasksTable, "byTitle", [
            { eq: [{ col: "title", val: "Keep" }] },
          ]),
        );
        expect(remainingTasks.length).toBe(2);

        tx.commit();
      });

      it("transaction with mixed operations on different indexes", async () => {
        const db = new SyncDB(new DB(await driver()));
        db.loadTables([tasksTable]);

        // Initial data
        const initialTasks: Task[] = [
          { id: "task-1", title: "Alpha" },
          { id: "task-2", title: "Beta" },
        ];
        db.insert(tasksTable, initialTasks);

        const tx = db.beginTx();

        // Insert new task
        tx.insert(tasksTable, [{ id: "task-3", title: "Gamma" }]);

        // Update existing task
        tx.update(tasksTable, [{ id: "task-1", title: "Alpha-Updated" }]);

        // Delete existing task
        tx.delete(tasksTable, ["task-2"]);

        // Test range query on btree
        const rangeResult = Array.from(
          tx.intervalScan(tasksTable, "byTitles", [
            {
              gte: [{ col: "title", val: "Alpha" }],
            },
          ]),
        );

        expect(rangeResult.length).toBe(2);
        expect(rangeResult.map((t) => t.title).sort()).toEqual([
          "Alpha-Updated",
          "Gamma",
        ]);

        // Test exact query on hash
        const exactResult = Array.from(
          tx.intervalScan(tasksTable, "byTitle", [
            { eq: [{ col: "title", val: "Gamma" }] },
          ]),
        );

        expect(exactResult.length).toBe(1);
        expect(exactResult[0].id).toBe("task-3");

        tx.commit();

        // Verify final state
        const finalTasks = Array.from(
          db.intervalScan(tasksTable, "byIds", [
            {
              gte: [{ col: "id", val: "" }],
            },
          ]),
        );

        expect(finalTasks.length).toBe(2);
        expect(finalTasks.map((t) => t.id).sort()).toEqual([
          "task-1",
          "task-3",
        ]);
      });

      it("transaction rollback preserves original index state", async () => {
        const db = new SyncDB(new DB(await driver()));
        db.loadTables([tasksTable]);

        // Initial data
        const initialTasks: Task[] = [
          { id: "task-1", title: "Keep" },
          { id: "task-2", title: "Keep" },
        ];
        db.insert(tasksTable, initialTasks);

        const tx = db.beginTx();

        // Make various changes
        tx.insert(tasksTable, [{ id: "task-3", title: "New" }]);
        tx.update(tasksTable, [{ id: "task-1", title: "Modified" }]);
        tx.delete(tasksTable, ["task-2"]);

        // Verify changes are visible in transaction
        const txResults = Array.from(
          tx.intervalScan(tasksTable, "byIds", [
            {
              gte: [{ col: "id", val: "" }],
            },
          ]),
        );
        expect(txResults.length).toBe(2); // task-1 (modified) and task-3 (new)

        tx.rollback();

        // Verify original state is preserved
        const finalHashResults = Array.from(
          db.intervalScan(tasksTable, "byTitle", [
            { eq: [{ col: "title", val: "Keep" }] },
          ]),
        );

        const finalBtreeResults = Array.from(
          db.intervalScan(tasksTable, "byTitles", [
            { eq: [{ col: "title", val: "Keep" }] },
          ]),
        );

        expect(finalHashResults.length).toBe(2);
        expect(finalBtreeResults.length).toBe(2);

        // New task should not exist
        const newTaskResults = Array.from(
          db.intervalScan(tasksTable, "byId", [
            { eq: [{ col: "id", val: "task-3" }] },
          ]),
        );
        expect(newTaskResults.length).toBe(0);
      });

      it("transaction with limit on different index types", async () => {
        const db = new SyncDB(new DB(await driver()));
        db.loadTables([tasksTable]);

        const tasks: Task[] = [
          { id: "task-1", title: "Same" },
          { id: "task-2", title: "Same" },
          { id: "task-3", title: "Same" },
          { id: "task-4", title: "Same" },
          { id: "task-5", title: "Same" },
        ];

        const tx = db.beginTx();
        tx.insert(tasksTable, tasks);

        // Test limit on hash index
        const hashLimited = Array.from(
          tx.intervalScan(
            tasksTable,
            "byTitle",
            [{ eq: [{ col: "title", val: "Same" }] }],
            { limit: 3 },
          ),
        );
        expect(hashLimited.length).toBe(3);

        // Test limit on btree index
        const btreeLimited = Array.from(
          tx.intervalScan(
            tasksTable,
            "byTitles",
            [{ eq: [{ col: "title", val: "Same" }] }],
            { limit: 2 },
          ),
        );
        expect(btreeLimited.length).toBe(2);

        // Test limit on btree range query
        const rangeApple = Array.from(
          tx.intervalScan(
            tasksTable,
            "byIds",
            [
              {
                gte: [{ col: "id", val: "task-1" }],
              },
            ],
            { limit: 4 },
          ),
        );
        expect(rangeApple.length).toBe(4);

        tx.commit();
      });

      it("complex query patterns - multiple where clauses", async () => {
        const db = new SyncDB(new DB(await driver()));
        db.loadTables([tasksTable]);

        const tasks: Task[] = [
          { id: "task-1", title: "Alpha" },
          { id: "task-2", title: "Beta" },
          { id: "task-3", title: "Gamma" },
        ];

        const tx = db.beginTx();
        tx.insert(tasksTable, tasks);

        // Multiple where clauses on btree index
        const multiClauseResults = Array.from(
          tx.intervalScan(tasksTable, "byTitles", [
            { eq: [{ col: "title", val: "Alpha" }] },
            { eq: [{ col: "title", val: "Gamma" }] },
          ]),
        );

        expect(multiClauseResults.length).toBe(2);
        expect(multiClauseResults.map((t) => t.title).sort()).toEqual([
          "Alpha",
          "Gamma",
        ]);

        tx.commit();
      });

      it("edge case - empty results", async () => {
        const db = new SyncDB(new DB(await driver()));
        db.loadTables([tasksTable]);

        const tx = db.beginTx();

        // Query empty database
        const emptyResults = Array.from(
          tx.intervalScan(tasksTable, "byId", [
            { eq: [{ col: "id", val: "nonexistent" }] },
          ]),
        );
        expect(emptyResults.length).toBe(0);

        // Insert some data then query for nonexistent
        tx.insert(tasksTable, [{ id: "task-1", title: "Exists" }]);

        const noMatchResults = Array.from(
          tx.intervalScan(tasksTable, "byTitle", [
            { eq: [{ col: "title", val: "DoesNotExist" }] },
          ]),
        );
        expect(noMatchResults.length).toBe(0);

        tx.commit();
      });

      it("edge case - duplicate inserts and updates", async () => {
        const db = new SyncDB(new DB(await driver()));
        db.loadTables([tasksTable]);

        const tx = db.beginTx();

        const task: Task = { id: "task-dup", title: "Original" };

        // Insert same task multiple times
        tx.insert(tasksTable, [task]);
        tx.insert(tasksTable, [task]);

        // Should only have one instance
        const afterInserts = Array.from(
          tx.intervalScan(tasksTable, "byId", [
            { eq: [{ col: "id", val: "task-dup" }] },
          ]),
        );
        expect(afterInserts.length).toBe(1);

        // Multiple updates
        tx.update(tasksTable, [{ ...task, title: "Updated1" }]);
        tx.update(tasksTable, [{ ...task, title: "Updated2" }]);

        // Should have latest update
        const afterUpdates = Array.from(
          tx.intervalScan(tasksTable, "byId", [
            { eq: [{ col: "id", val: "task-dup" }] },
          ]),
        );
        expect(afterUpdates.length).toBe(1);
        expect(afterUpdates[0].title).toBe("Updated2");

        tx.commit();
      });

      it("edge case - update then delete in transaction", async () => {
        const db = new SyncDB(new DB(await driver()));
        db.loadTables([tasksTable]);

        // Insert initial data
        const task: Task = { id: "task-ud", title: "Original" };
        db.insert(tasksTable, [task]);

        const tx = db.beginTx();

        // Update then delete
        tx.update(tasksTable, [{ ...task, title: "Updated" }]);
        tx.delete(tasksTable, ["task-ud"]);

        // Should not exist
        const result = Array.from(
          tx.intervalScan(tasksTable, "byId", [
            { eq: [{ col: "id", val: "task-ud" }] },
          ]),
        );
        expect(result.length).toBe(0);

        tx.commit();

        // Should not exist after commit
        const finalResult = Array.from(
          db.intervalScan(tasksTable, "byId", [
            { eq: [{ col: "id", val: "task-ud" }] },
          ]),
        );
        expect(finalResult.length).toBe(0);
      });

      it("edge case - insert then delete in transaction", async () => {
        const db = new SyncDB(new DB(await driver()));
        db.loadTables([tasksTable]);

        const tx = db.beginTx();

        const task: Task = { id: "task-id", title: "Temp" };

        // Insert then delete
        tx.insert(tasksTable, [task]);
        tx.delete(tasksTable, ["task-id"]);

        // Should not exist
        const result = Array.from(
          tx.intervalScan(tasksTable, "byId", [
            { eq: [{ col: "id", val: "task-id" }] },
          ]),
        );
        expect(result.length).toBe(0);

        tx.commit();

        // Should not exist after commit
        const finalResult = Array.from(
          db.intervalScan(tasksTable, "byId", [
            { eq: [{ col: "id", val: "task-id" }] },
          ]),
        );
        expect(finalResult.length).toBe(0);
      });

      it("edge case - delete nonexistent record", async () => {
        const db = new SyncDB(new DB(await driver()));
        db.loadTables([tasksTable]);

        const tx = db.beginTx();

        // Delete nonexistent record should not throw
        tx.delete(tasksTable, ["nonexistent"]);

        // Insert some data
        tx.insert(tasksTable, [{ id: "task-1", title: "Exists" }]);

        // Delete nonexistent again
        tx.delete(tasksTable, ["still-nonexistent"]);

        // Existing data should still be there
        const result = Array.from(
          tx.intervalScan(tasksTable, "byId", [
            { eq: [{ col: "id", val: "task-1" }] },
          ]),
        );
        expect(result.length).toBe(1);

        tx.commit();
      });

      it("edge case - boundary values in btree queries", async () => {
        const db = new SyncDB(new DB(await driver()));
        db.loadTables([tasksTable]);

        const tasks: Task[] = [
          { id: "task-1", title: "" }, // Empty string
          { id: "task-2", title: "A" },
          { id: "task-3", title: "Z" },
          { id: "task-4", title: "ZZZZZ" },
        ];

        const tx = db.beginTx();
        tx.insert(tasksTable, tasks);

        // Query including empty string
        const fromEmpty = Array.from(
          tx.intervalScan(tasksTable, "byTitles", [
            {
              gte: [{ col: "title", val: "" }],
              lte: [{ col: "title", val: "A" }],
            },
          ]),
        );
        expect(fromEmpty.length).toBe(2);

        // Query at upper boundary
        const upperBoundary = Array.from(
          tx.intervalScan(tasksTable, "byTitles", [
            {
              gte: [{ col: "title", val: "Z" }],
            },
          ]),
        );
        expect(upperBoundary.length).toBe(2);
        expect(upperBoundary.map((t) => t.title).sort()).toEqual([
          "Z",
          "ZZZZZ",
        ]);

        tx.commit();
      });

      it("performance test - large transaction with mixed operations", async () => {
        const db = new SyncDB(new DB(await driver()));
        db.loadTables([tasksTable]);

        const tx = db.beginTx();

        // Insert many records
        const insertTasks: Task[] = [];
        for (let i = 0; i < 100; i++) {
          insertTasks.push({
            id: `task-${i.toString().padStart(3, "0")}`,
            title: `Task ${i}`,
          });
        }
        tx.insert(tasksTable, insertTasks);

        // Update some records
        const updateTasks: Task[] = [];
        for (let i = 0; i < 50; i += 2) {
          updateTasks.push({
            id: `task-${i.toString().padStart(3, "0")}`,
            title: `Updated Task ${i}`,
          });
        }
        tx.update(tasksTable, updateTasks);

        // Delete some records
        const deleteIds: string[] = [];
        for (let i = 1; i < 50; i += 2) {
          deleteIds.push(`task-${i.toString().padStart(3, "0")}`);
        }
        tx.delete(tasksTable, deleteIds);

        // Query to verify state
        const remainingTasks = Array.from(
          tx.intervalScan(tasksTable, "byIds", [
            {
              gte: [{ col: "id", val: "task-000" }],
              lt: [{ col: "id", val: "task-050" }],
            },
          ]),
        );

        // Should have 25 tasks (0, 2, 4, ..., 48) in range 0-49
        expect(remainingTasks.length).toBe(25);

        // Verify updates are reflected
        const updatedTask = remainingTasks.find((t) => t.id === "task-000");
        expect(updatedTask?.title).toBe("Updated Task 0");

        tx.commit();

        // Final verification
        const finalCount = Array.from(
          db.intervalScan(tasksTable, "byIds", [
            {
              gte: [{ col: "id", val: "" }],
            },
          ]),
        );
        expect(finalCount.length).toBe(75); // 100 - 25 deleted
      });

      it("hash index with multiple records having same value", async () => {
        const db = new SyncDB(new DB(await driver()));
        db.loadTables([tasksTable]);

        // Insert multiple tasks with same title (hash index value)
        const tasks: Task[] = [
          { id: "task-1", title: "Duplicate" },
          { id: "task-2", title: "Duplicate" },
          { id: "task-3", title: "Duplicate" },
          { id: "task-4", title: "Unique" },
        ];

        const tx = db.beginTx();
        tx.insert(tasksTable, tasks);

        // Query for duplicate titles via hash index
        const duplicateResults = Array.from(
          tx.intervalScan(tasksTable, "byTitle", [
            { eq: [{ col: "title", val: "Duplicate" }] },
          ]),
        );

        expect(duplicateResults.length).toBe(3);
        expect(duplicateResults.map((t) => t.id).sort()).toEqual([
          "task-1",
          "task-2",
          "task-3",
        ]);

        // Query for unique title
        const uniqueResults = Array.from(
          tx.intervalScan(tasksTable, "byTitle", [
            { eq: [{ col: "title", val: "Unique" }] },
          ]),
        );

        expect(uniqueResults.length).toBe(1);
        expect(uniqueResults[0].id).toBe("task-4");

        tx.commit();

        // Verify after commit
        const postCommitDuplicates = Array.from(
          db.intervalScan(tasksTable, "byTitle", [
            { eq: [{ col: "title", val: "Duplicate" }] },
          ]),
        );
        expect(postCommitDuplicates.length).toBe(3);
      });

      it.skip("hash index consistency between transaction and direct operations", async () => {
        const db = new SyncDB(new DB(await driver()));
        db.loadTables([tasksTable]);

        // Direct operations outside transaction
        const directTasks: Task[] = [
          { id: "direct-1", title: "Direct" },
          { id: "direct-2", title: "Direct" },
        ];
        db.insert(tasksTable, directTasks);

        // Transaction operations
        const tx = db.beginTx();
        const txTasks: Task[] = [
          { id: "tx-1", title: "Direct" }, // Same title as direct operations
          { id: "tx-2", title: "TxOnly" },
        ];
        tx.insert(tasksTable, txTasks);

        // Query within transaction should see both direct and tx operations
        const txResults = Array.from(
          tx.intervalScan(tasksTable, "byTitle", [
            { eq: [{ col: "title", val: "Direct" }] },
          ]),
        );
        expect(txResults.length).toBe(3); // 2 direct + 1 tx
        expect(txResults.map((t) => t.id).sort()).toEqual([
          "direct-1",
          "direct-2",
          "tx-1",
        ]);

        // Query outside transaction should only see direct operations
        const directResults = Array.from(
          db.intervalScan(tasksTable, "byTitle", [
            { eq: [{ col: "title", val: "Direct" }] },
          ]),
        );
        expect(directResults.length).toBe(2);
        expect(directResults.map((t) => t.id).sort()).toEqual([
          "direct-1",
          "direct-2",
        ]);

        tx.commit();

        // After commit, all should be visible
        const finalResults = Array.from(
          db.intervalScan(tasksTable, "byTitle", [
            { eq: [{ col: "title", val: "Direct" }] },
          ]),
        );
        expect(finalResults.length).toBe(3);
      });

      it.skip("hash index update and delete with multiple values", async () => {
        const db = new SyncDB(new DB(await driver()));
        db.loadTables([tasksTable]);

        // Insert tasks with duplicate titles
        const tasks: Task[] = [
          { id: "task-1", title: "Same" },
          { id: "task-2", title: "Same" },
          { id: "task-3", title: "Same" },
          { id: "task-4", title: "Different" },
        ];
        db.insert(tasksTable, tasks);

        const tx = db.beginTx();

        // Update one of the tasks with "Same" title
        tx.update(tasksTable, [{ id: "task-2", title: "Updated" }]);

        // Delete another task with "Same" title
        tx.delete(tasksTable, ["task-3"]);

        // Check remaining "Same" titled tasks
        const sameResults = Array.from(
          tx.intervalScan(tasksTable, "byTitle", [
            { eq: [{ col: "title", val: "Same" }] },
          ]),
        );
        expect(sameResults.length).toBe(1);
        expect(sameResults[0].id).toBe("task-1");

        // Check updated task
        const updatedResults = Array.from(
          tx.intervalScan(tasksTable, "byTitle", [
            { eq: [{ col: "title", val: "Updated" }] },
          ]),
        );
        expect(updatedResults.length).toBe(1);
        expect(updatedResults[0].id).toBe("task-2");

        // Check different task still exists
        const differentResults = Array.from(
          tx.intervalScan(tasksTable, "byTitle", [
            { eq: [{ col: "title", val: "Different" }] },
          ]),
        );
        expect(differentResults.length).toBe(1);
        expect(differentResults[0].id).toBe("task-4");

        tx.commit();

        // Verify final state
        const finalSame = Array.from(
          db.intervalScan(tasksTable, "byTitle", [
            { eq: [{ col: "title", val: "Same" }] },
          ]),
        );
        expect(finalSame.length).toBe(1);
        expect(finalSame[0].id).toBe("task-1");
      });

      it("hash index rollback with multiple values", async () => {
        const db = new SyncDB(new DB(await driver()));
        db.loadTables([tasksTable]);

        // Insert initial data with duplicates
        const initialTasks: Task[] = [
          { id: "keep-1", title: "Keep" },
          { id: "keep-2", title: "Keep" },
          { id: "keep-3", title: "Keep" },
        ];
        db.insert(tasksTable, initialTasks);

        const tx = db.beginTx();

        // Add more tasks with same title
        tx.insert(tasksTable, [{ id: "temp-1", title: "Keep" }]);
        tx.insert(tasksTable, [{ id: "temp-2", title: "Keep" }]);

        // Update one existing task
        tx.update(tasksTable, [{ id: "keep-1", title: "Modified" }]);

        // Delete one existing task
        tx.delete(tasksTable, ["keep-2"]);

        // Verify transaction state
        const txKeepResults = Array.from(
          tx.intervalScan(tasksTable, "byTitle", [
            { eq: [{ col: "title", val: "Keep" }] },
          ]),
        );
        expect(txKeepResults.length).toBe(3); // keep-3 + temp-1 + temp-2

        tx.rollback();

        // Verify original state is preserved
        const finalResults = Array.from(
          db.intervalScan(tasksTable, "byTitle", [
            { eq: [{ col: "title", val: "Keep" }] },
          ]),
        );
        expect(finalResults.length).toBe(3);
        expect(finalResults.map((t) => t.id).sort()).toEqual([
          "keep-1",
          "keep-2",
          "keep-3",
        ]);

        // Modified title should not exist
        const modifiedResults = Array.from(
          db.intervalScan(tasksTable, "byTitle", [
            { eq: [{ col: "title", val: "Modified" }] },
          ]),
        );
        expect(modifiedResults.length).toBe(0);
      });

      it("hash index with limit and multiple values", async () => {
        const db = new SyncDB(new DB(await driver()));
        db.loadTables([tasksTable]);

        // Insert many tasks with same title
        const tasks: Task[] = [];
        for (let i = 0; i < 10; i++) {
          tasks.push({
            id: `task-${i.toString().padStart(2, "0")}`,
            title: "Many",
          });
        }

        const tx = db.beginTx();
        tx.insert(tasksTable, tasks);

        // Test limit functionality
        const limitedResults = Array.from(
          tx.intervalScan(
            tasksTable,
            "byTitle",
            [{ eq: [{ col: "title", val: "Many" }] }],
            { limit: 5 },
          ),
        );

        expect(limitedResults.length).toBe(5);

        // Test limit 0
        const zeroLimitResults = Array.from(
          tx.intervalScan(
            tasksTable,
            "byTitle",
            [{ eq: [{ col: "title", val: "Many" }] }],
            { limit: 0 },
          ),
        );

        expect(zeroLimitResults.length).toBe(0);

        // Test no limit
        const noLimitResults = Array.from(
          tx.intervalScan(tasksTable, "byTitle", [
            { eq: [{ col: "title", val: "Many" }] },
          ]),
        );

        expect(noLimitResults.length).toBe(10);

        tx.commit();

        // Test limit after commit
        const postCommitLimited = Array.from(
          db.intervalScan(
            tasksTable,
            "byTitle",
            [{ eq: [{ col: "title", val: "Many" }] }],
            { limit: 3 },
          ),
        );

        expect(postCommitLimited.length).toBe(3);
      });

      it("hash index mixed operations preserving value groups", async () => {
        const db = new SyncDB(new DB(await driver()));
        db.loadTables([tasksTable]);

        // Initial data with multiple value groups
        const initialTasks: Task[] = [
          { id: "a1", title: "Alpha" },
          { id: "a2", title: "Alpha" },
          { id: "b1", title: "Beta" },
          { id: "b2", title: "Beta" },
          { id: "g1", title: "Gamma" },
        ];
        db.insert(tasksTable, initialTasks);

        const tx = db.beginTx();

        // Add to existing groups
        tx.insert(tasksTable, [{ id: "a3", title: "Alpha" }]);
        tx.insert(tasksTable, [{ id: "b3", title: "Beta" }]);

        // Create new group
        tx.insert(tasksTable, [{ id: "d1", title: "Delta" }]);

        // Update within group (move from one group to another)
        tx.update(tasksTable, [{ id: "g1", title: "Alpha" }]); // Gamma -> Alpha

        // Delete from groups
        tx.delete(tasksTable, ["a2", "b1"]);

        // Verify Alpha group (a1, a3, g1 - a2)
        const alphaResults = Array.from(
          tx.intervalScan(tasksTable, "byTitle", [
            { eq: [{ col: "title", val: "Alpha" }] },
          ]),
        );
        expect(alphaResults.length).toBe(3);
        expect(alphaResults.map((t) => t.id).sort()).toEqual([
          "a1",
          "a3",
          "g1",
        ]);

        // Verify Beta group (b2, b3 - b1)
        const betaResults = Array.from(
          tx.intervalScan(tasksTable, "byTitle", [
            { eq: [{ col: "title", val: "Beta" }] },
          ]),
        );
        expect(betaResults.length).toBe(2);
        expect(betaResults.map((t) => t.id).sort()).toEqual(["b2", "b3"]);

        // Verify Gamma group (empty)
        const gammaResults = Array.from(
          tx.intervalScan(tasksTable, "byTitle", [
            { eq: [{ col: "title", val: "Gamma" }] },
          ]),
        );
        expect(gammaResults.length).toBe(0);

        // Verify Delta group (d1)
        const deltaResults = Array.from(
          tx.intervalScan(tasksTable, "byTitle", [
            { eq: [{ col: "title", val: "Delta" }] },
          ]),
        );
        expect(deltaResults.length).toBe(1);
        expect(deltaResults[0].id).toBe("d1");

        tx.commit();

        // Verify consistency after commit
        const finalAlpha = Array.from(
          db.intervalScan(tasksTable, "byTitle", [
            { eq: [{ col: "title", val: "Alpha" }] },
          ]),
        );
        expect(finalAlpha.length).toBe(3);
        expect(finalAlpha.map((t) => t.id).sort()).toEqual(["a1", "a3", "g1"]);
      });
    });
  }
});
