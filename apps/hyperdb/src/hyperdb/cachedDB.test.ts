/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import { DB, type HyperDBTx, SyncDB, SyncDBTx, execSync } from "./db.ts";
import { BptreeInmemDriver } from "./drivers/bptree-inmem-driver.ts";
import { table } from "./table.ts";
import { initSqlJsWasm } from "./drivers/initSqlJSWasm.ts";
import { CachedDB } from "./cachedDB.ts";

type Task = {
  id: string;
  title: string;
  value: number;
  projectId: string;
};

const tasksTable = table<Task>("tasks").withIndexes({
  id: { cols: ["id"], type: "hash" },
  byValue: { cols: ["value"], type: "btree" },
  byProjectIdValue: { cols: ["projectId", "value"], type: "btree" },
});

describe("CachedDB", async () => {
  const createDBs = async () => {
    const primaryDriver = await initSqlJsWasm();
    const cacheDriver = new BptreeInmemDriver();
    const primary = new DB(primaryDriver);
    const cache = new DB(cacheDriver);
    const cachedDB = new CachedDB(primary, cache);
    const db = new SyncDB(cachedDB);
    db.loadTables([tasksTable]);

    const primaryScanSpy = vi.spyOn(primary, "intervalScan");
    const cacheScanSpy = vi.spyOn(cache, "intervalScan");

    return {
      db,
      primary: new SyncDB(primary),
      cache: new SyncDB(cache),
      primaryScanSpy,
      cacheScanSpy,
    };
  };

  it("serves from cache on second identical scan", async () => {
    const { db, primaryScanSpy, cacheScanSpy } = await createDBs();

    const tasks: Task[] = [
      { id: "1", title: "A", value: 1, projectId: "p1" },
      { id: "2", title: "B", value: 2, projectId: "p1" },
      { id: "3", title: "C", value: 3, projectId: "p1" },
    ];
    db.insert(tasksTable, tasks);

    // First scan — hits primary, populates cache
    const result1 = db.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 3 }] },
    ]);
    expect(result1).toEqual(tasks);
    expect(primaryScanSpy).toHaveBeenCalledTimes(1);
    expect(cacheScanSpy).toHaveBeenCalledTimes(0);

    // Second scan — should come from cache, not primary
    const result2 = db.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 3 }] },
    ]);
    expect(result2).toEqual(tasks);
    expect(primaryScanSpy).toHaveBeenCalledTimes(1); // still 1
    expect(cacheScanSpy).toHaveBeenCalledTimes(1);
  });

  it("hits primary when interval is not fully covered", async () => {
    const { db, primaryScanSpy, cacheScanSpy } = await createDBs();

    const tasks: Task[] = [
      { id: "1", title: "A", value: 1, projectId: "p1" },
      { id: "2", title: "B", value: 2, projectId: "p1" },
      { id: "3", title: "C", value: 3, projectId: "p1" },
      { id: "4", title: "D", value: 4, projectId: "p1" },
    ];
    db.insert(tasksTable, tasks);

    // Cache interval [1, 2]
    db.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 2 }] },
    ]);
    expect(primaryScanSpy).toHaveBeenCalledTimes(1);

    // Query [1, 4] — not fully covered, should hit primary again
    const result = db.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 4 }] },
    ]);
    expect(result).toEqual(tasks);
    expect(primaryScanSpy).toHaveBeenCalledTimes(2);
    expect(cacheScanSpy).toHaveBeenCalledTimes(0);
  });

  it("merges overlapping intervals", async () => {
    const { db, primaryScanSpy, cacheScanSpy } = await createDBs();

    const tasks: Task[] = [
      { id: "1", title: "A", value: 1, projectId: "p1" },
      { id: "2", title: "B", value: 2, projectId: "p1" },
      { id: "3", title: "C", value: 3, projectId: "p1" },
      { id: "4", title: "D", value: 4, projectId: "p1" },
    ];
    db.insert(tasksTable, tasks);

    // Cache [1, 3]
    db.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 3 }] },
    ]);

    // Cache [2, 4] — overlaps with [1, 3], should merge into [1, 4]
    db.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 2 }], lte: [{ col: "value", val: 4 }] },
    ]);
    expect(primaryScanSpy).toHaveBeenCalledTimes(2);

    // Query [1, 4] — should be fully covered by merged interval, uses cache
    const result = db.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 4 }] },
    ]);
    expect(result).toEqual(tasks);
    expect(primaryScanSpy).toHaveBeenCalledTimes(2); // no new primary call
    expect(cacheScanSpy).toHaveBeenCalledTimes(1);
  });

  it("handles limit - only caches up to last returned record", async () => {
    const { db, primaryScanSpy, cacheScanSpy } = await createDBs();

    const tasks: Task[] = [
      { id: "1", title: "A", value: 1, projectId: "p1" },
      { id: "2", title: "B", value: 2, projectId: "p1" },
      { id: "3", title: "C", value: 3, projectId: "p1" },
      { id: "4", title: "D", value: 4, projectId: "p1" },
    ];
    db.insert(tasksTable, tasks);

    // Scan with limit=2 — should only cache up to (value=2, id="2")
    const limitResult = db.intervalScan(
      tasksTable,
      "byValue",
      [{ gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 4 }] }],
      { limit: 2 },
    );
    expect(limitResult).toEqual([tasks[0], tasks[1]]);
    expect(primaryScanSpy).toHaveBeenCalledTimes(1);

    // Query [1, 1] — fully within cached interval, should use cache
    const cachedResult = db.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 1 }] },
    ]);
    expect(cachedResult).toEqual([tasks[0]]);
    expect(primaryScanSpy).toHaveBeenCalledTimes(1); // still 1, served from cache
    expect(cacheScanSpy).toHaveBeenCalledTimes(1);

    // Query [1, 4] should NOT be fully cached (goes beyond last record), hits primary
    const uncachedResult = db.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 4 }] },
    ]);
    expect(uncachedResult).toEqual(tasks);
    expect(primaryScanSpy).toHaveBeenCalledTimes(2); // hit primary again
  });

  it("insert/update/delete propagate to both DBs", async () => {
    const { db, primary, cache } = await createDBs();

    const task: Task = { id: "1", title: "A", value: 1, projectId: "p1" };
    db.insert(tasksTable, [task]);

    // Both have it
    expect(
      primary.intervalScan(tasksTable, "id", [
        { eq: [{ col: "id", val: "1" }] },
      ]),
    ).toEqual([task]);
    expect(
      cache.intervalScan(tasksTable, "id", [
        { eq: [{ col: "id", val: "1" }] },
      ]),
    ).toEqual([task]);

    // Update
    const updated = { ...task, title: "Updated" };
    db.update(tasksTable, [updated]);
    expect(
      primary.intervalScan(tasksTable, "id", [
        { eq: [{ col: "id", val: "1" }] },
      ]),
    ).toEqual([updated]);
    expect(
      cache.intervalScan(tasksTable, "id", [
        { eq: [{ col: "id", val: "1" }] },
      ]),
    ).toEqual([updated]);

    // Delete
    db.delete(tasksTable, ["1"]);
    expect(
      primary.intervalScan(tasksTable, "id", [
        { eq: [{ col: "id", val: "1" }] },
      ]),
    ).toEqual([]);
    expect(
      cache.intervalScan(tasksTable, "id", [
        { eq: [{ col: "id", val: "1" }] },
      ]),
    ).toEqual([]);
  });

  it("works with composite index", async () => {
    const { db, primaryScanSpy, cacheScanSpy } = await createDBs();

    const tasks: Task[] = [
      { id: "1", title: "A", value: 1, projectId: "p1" },
      { id: "2", title: "B", value: 2, projectId: "p1" },
      { id: "3", title: "C", value: 1, projectId: "p2" },
    ];
    db.insert(tasksTable, tasks);

    // Cache projectId=p1
    const p1Tasks = db.intervalScan(tasksTable, "byProjectIdValue", [
      { eq: [{ col: "projectId", val: "p1" }] },
    ]);
    expect(p1Tasks).toEqual([tasks[0], tasks[1]]);
    expect(primaryScanSpy).toHaveBeenCalledTimes(1);

    // Same query should hit cache
    const cached = db.intervalScan(tasksTable, "byProjectIdValue", [
      { eq: [{ col: "projectId", val: "p1" }] },
    ]);
    expect(cached).toEqual([tasks[0], tasks[1]]);
    expect(primaryScanSpy).toHaveBeenCalledTimes(1); // no new primary call
    expect(cacheScanSpy).toHaveBeenCalledTimes(1);

    // Different projectId should NOT be cached — hits primary
    const uncached = db.intervalScan(tasksTable, "byProjectIdValue", [
      { eq: [{ col: "projectId", val: "p2" }] },
    ]);
    expect(uncached).toEqual([tasks[2]]);
    expect(primaryScanSpy).toHaveBeenCalledTimes(2);
  });

  it("limit with duplicate index values must include id in interval tracking", async () => {
    const { db, primaryScanSpy, cacheScanSpy } = await createDBs();

    // All three records have the same value=1, differ only by id
    const tasks: Task[] = [
      { id: "a", title: "A", value: 1, projectId: "p1" },
      { id: "b", title: "B", value: 1, projectId: "p1" },
      { id: "c", title: "C", value: 1, projectId: "p1" },
    ];
    db.insert(tasksTable, tasks);

    // Scan with limit=2 — returns records "a" and "b" (sorted by id within same value)
    const limitResult = db.intervalScan(
      tasksTable,
      "byValue",
      [{ gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 1 }] }],
      { limit: 2 },
    );
    expect(limitResult).toHaveLength(2);
    expect(primaryScanSpy).toHaveBeenCalledTimes(1);

    // Now scan without limit for the same range — record "c" is NOT cached
    // so this MUST hit primary, not cache
    const fullResult = db.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 1 }] },
    ]);
    expect(fullResult).toHaveLength(3);
    expect(primaryScanSpy).toHaveBeenCalledTimes(2); // must hit primary again
    expect(cacheScanSpy).toHaveBeenCalledTimes(0); // should NOT have used cache
  });

  it("transaction commit writes to both primary and cache", async () => {
    const { db, cache } = await createDBs();

    const task: Task = { id: "1", title: "A", value: 1, projectId: "p1" };

    const tx = db.beginTx();
    tx.insert(tasksTable, [task]);
    tx.commit();

    // After commit — cache should have the data
    expect(
      cache.intervalScan(tasksTable, "id", [
        { eq: [{ col: "id", val: "1" }] },
      ]),
    ).toEqual([task]);
  });

  it("transaction commit writes updates and deletes to cache", async () => {
    const { db, cache } = await createDBs();

    const task: Task = { id: "1", title: "A", value: 1, projectId: "p1" };
    db.insert(tasksTable, [task]);

    // Update via tx
    const updated = { ...task, title: "Updated" };
    const tx1 = db.beginTx();
    tx1.update(tasksTable, [updated]);
    tx1.commit();

    expect(
      cache.intervalScan(tasksTable, "id", [
        { eq: [{ col: "id", val: "1" }] },
      ]),
    ).toEqual([updated]);

    // Delete via tx
    const tx2 = db.beginTx();
    tx2.delete(tasksTable, ["1"]);
    tx2.commit();

    expect(
      cache.intervalScan(tasksTable, "id", [
        { eq: [{ col: "id", val: "1" }] },
      ]),
    ).toEqual([]);
  });

  it("transaction scan uses interval cache — hits cache tx when covered", async () => {
    const { db, primaryScanSpy, cacheScanSpy } = await createDBs();

    const tasks: Task[] = [
      { id: "1", title: "A", value: 1, projectId: "p1" },
    ];
    db.insert(tasksTable, tasks);

    // Populate interval cache via a non-tx scan
    db.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 1 }] },
    ]);

    primaryScanSpy.mockClear();
    cacheScanSpy.mockClear();

    // Scan inside transaction — interval is cached, so should hit cache tx
    const tx = db.beginTx();
    const txResult = tx.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 1 }] },
    ]);
    expect(txResult).toEqual(tasks);
    tx.commit();
  });

  it("transaction scan hits primary tx when interval not cached", async () => {
    const { db, cacheScanSpy } = await createDBs();

    const tasks: Task[] = [
      { id: "1", title: "A", value: 1, projectId: "p1" },
    ];
    db.insert(tasksTable, tasks);

    cacheScanSpy.mockClear();

    // Scan inside transaction — interval NOT cached, should hit primary tx (not cache)
    const tx = db.beginTx();
    const txResult = tx.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 1 }] },
    ]);
    expect(txResult).toEqual(tasks);
    // Cache scan spy is on the DB-level cache, not the cache tx, so it should not be called
    expect(cacheScanSpy).not.toHaveBeenCalled();
    tx.commit();

    // After commit, the interval should be in the cache — next non-tx scan should hit cache
    cacheScanSpy.mockClear();
    const result2 = db.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 1 }] },
    ]);
    expect(result2).toEqual(tasks);
    expect(cacheScanSpy).toHaveBeenCalled();
  });

  it("transaction rollback discards changes from both primary and cache", async () => {
    const { db, primary, cache } = await createDBs();

    const tx = db.beginTx();
    tx.insert(tasksTable, [
      { id: "1", title: "A", value: 1, projectId: "p1" },
    ]);
    tx.rollback();

    // Neither primary nor cache should have the data
    expect(
      primary.intervalScan(tasksTable, "id", [
        { eq: [{ col: "id", val: "1" }] },
      ]),
    ).toEqual([]);
    expect(
      cache.intervalScan(tasksTable, "id", [
        { eq: [{ col: "id", val: "1" }] },
      ]),
    ).toEqual([]);
  });

  it("nested transactions commit to both primary and cache on outermost commit", async () => {
    const { db, cache } = await createDBs();

    const tx1 = db.beginTx();
    tx1.insert(tasksTable, [
      { id: "1", title: "A", value: 1, projectId: "p1" },
    ]);

    // SyncDBTx doesn't expose beginTx, use execSync on the underlying HyperDBTx
    const innerHyperTx = execSync<HyperDBTx>(
      (tx1 as any).dbTx.beginTx(),
    );
    const tx2 = new SyncDBTx(innerHyperTx);
    tx2.insert(tasksTable, [
      { id: "2", title: "B", value: 2, projectId: "p1" },
    ]);

    // Inner commit
    tx2.commit();

    // Outer commit
    tx1.commit();

    const result = db.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 2 }] },
    ]);
    expect(result).toHaveLength(2);

    // Cache should have both records
    expect(
      cache.intervalScan(tasksTable, "id", [
        { eq: [{ col: "id", val: "1" }] },
      ]),
    ).toHaveLength(1);
    expect(
      cache.intervalScan(tasksTable, "id", [
        { eq: [{ col: "id", val: "2" }] },
      ]),
    ).toHaveLength(1);
  });
});
