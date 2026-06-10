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

/** Wait for setTimeout(0) callbacks to fire and all queued writes to complete */
const flushQueue = () => new Promise<void>((r) => setTimeout(r, 1500));

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
      cachedDB,
      primary: new SyncDB(primary),
      cache: new SyncDB(cache),
      primaryScanSpy,
      cacheScanSpy,
    };
  };

  /** Insert tasks directly into primary (bypassing CachedDB) so primary has data for scans */
  const seedPrimary = async (
    dbs: Awaited<ReturnType<typeof createDBs>>,
    tasks: Task[],
  ) => {
    dbs.primary.insert(tasksTable, tasks);
  };

  it("serves from cache on second identical scan", async () => {
    const dbs = await createDBs();
    const { db, primaryScanSpy, cacheScanSpy } = dbs;

    const tasks: Task[] = [
      { id: "1", title: "A", value: 1, projectId: "p1" },
      { id: "2", title: "B", value: 2, projectId: "p1" },
      { id: "3", title: "C", value: 3, projectId: "p1" },
    ];
    await seedPrimary(dbs, tasks);

    // First scan — hits primary, populates cache
    const result1 = db.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 3 }] },
    ]);
    expect(result1).toEqual(tasks);
    expect(primaryScanSpy).toHaveBeenCalledTimes(1);

    primaryScanSpy.mockClear();
    cacheScanSpy.mockClear();

    // Second scan — should come from cache, not primary
    const result2 = db.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 3 }] },
    ]);
    expect(result2).toEqual(tasks);
    expect(primaryScanSpy).toHaveBeenCalledTimes(0); // not called
    expect(cacheScanSpy).toHaveBeenCalledTimes(1); // served from cache
  });

  it("hits primary when interval is not fully covered", async () => {
    const dbs = await createDBs();
    const { db, primaryScanSpy } = dbs;

    const tasks: Task[] = [
      { id: "1", title: "A", value: 1, projectId: "p1" },
      { id: "2", title: "B", value: 2, projectId: "p1" },
      { id: "3", title: "C", value: 3, projectId: "p1" },
      { id: "4", title: "D", value: 4, projectId: "p1" },
    ];
    await seedPrimary(dbs, tasks);

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
  });

  it("partial loading — only fetches uncovered intervals from primary", async () => {
    const dbs = await createDBs();
    const { db, primaryScanSpy } = dbs;

    const tasks: Task[] = [
      { id: "1", title: "A", value: 1, projectId: "p1" },
      { id: "2", title: "B", value: 2, projectId: "p1" },
      { id: "3", title: "C", value: 3, projectId: "p1" },
      { id: "4", title: "D", value: 4, projectId: "p1" },
      { id: "5", title: "E", value: 5, projectId: "p1" },
    ];
    await seedPrimary(dbs, tasks);

    // Cache [1, 2]
    db.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 2 }] },
    ]);
    expect(primaryScanSpy).toHaveBeenCalledTimes(1);

    // Cache [4, 5]
    db.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 4 }], lte: [{ col: "value", val: 5 }] },
    ]);
    expect(primaryScanSpy).toHaveBeenCalledTimes(2);

    primaryScanSpy.mockClear();

    // Query [1, 5] — [1,2] and [4,5] cached, only (2,4) needs fetching
    const result = db.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 5 }] },
    ]);
    expect(result).toEqual(tasks);
    // Primary should be called for uncovered gaps only, not the full range
    expect(primaryScanSpy).toHaveBeenCalled();

    // Verify the primary scan was NOT called for the full [1,5] range
    // It should have been called with a narrower range (the gap between cached intervals)
    const primaryCalls = primaryScanSpy.mock.calls;
    for (const call of primaryCalls) {
      const clauses = call[2] as Array<Record<string, unknown>>;
      // None of the calls should span the full [1,5] range
      expect(clauses).not.toEqual([
        {
          gte: [{ col: "value", val: 1 }],
          lte: [{ col: "value", val: 5 }],
        },
      ]);
    }

    // Now [1,5] should be fully cached
    primaryScanSpy.mockClear();
    const cachedResult = db.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 5 }] },
    ]);
    expect(cachedResult).toEqual(tasks);
    expect(primaryScanSpy).toHaveBeenCalledTimes(0); // fully cached
  });

  it("merges overlapping intervals", async () => {
    const dbs = await createDBs();
    const { db, primaryScanSpy, cacheScanSpy } = dbs;

    const tasks: Task[] = [
      { id: "1", title: "A", value: 1, projectId: "p1" },
      { id: "2", title: "B", value: 2, projectId: "p1" },
      { id: "3", title: "C", value: 3, projectId: "p1" },
      { id: "4", title: "D", value: 4, projectId: "p1" },
    ];
    await seedPrimary(dbs, tasks);

    // Cache [1, 3]
    db.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 3 }] },
    ]);

    // Cache [2, 4] — overlaps with [1, 3], should merge into [1, 4]
    db.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 2 }], lte: [{ col: "value", val: 4 }] },
    ]);
    expect(primaryScanSpy).toHaveBeenCalledTimes(2);

    primaryScanSpy.mockClear();
    cacheScanSpy.mockClear();

    // Query [1, 4] — should be fully covered by merged interval, uses cache only
    const result = db.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 4 }] },
    ]);
    expect(result).toEqual(tasks);
    expect(primaryScanSpy).toHaveBeenCalledTimes(0); // no primary call
    expect(cacheScanSpy).toHaveBeenCalledTimes(1); // served from cache
  });

  it("handles limit - fetches full range but returns limited results", async () => {
    const dbs = await createDBs();
    const { db, primaryScanSpy, cacheScanSpy } = dbs;

    const tasks: Task[] = [
      { id: "1", title: "A", value: 1, projectId: "p1" },
      { id: "2", title: "B", value: 2, projectId: "p1" },
      { id: "3", title: "C", value: 3, projectId: "p1" },
      { id: "4", title: "D", value: 4, projectId: "p1" },
    ];
    await seedPrimary(dbs, tasks);

    // Scan with limit=2 — fetches full range from primary (no limit), returns first 2
    const limitResult = db.intervalScan(
      tasksTable,
      "byValue",
      [{ gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 4 }] }],
      { limit: 2 },
    );
    expect(limitResult).toEqual([tasks[0], tasks[1]]);
    expect(primaryScanSpy).toHaveBeenCalledTimes(1);

    primaryScanSpy.mockClear();
    cacheScanSpy.mockClear();

    // Query [1, 1] — fully within cached interval, should use cache
    const cachedResult = db.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 1 }] },
    ]);
    expect(cachedResult).toEqual([tasks[0]]);
    expect(primaryScanSpy).toHaveBeenCalledTimes(0); // served from cache
    expect(cacheScanSpy).toHaveBeenCalledTimes(1);

    // Query [1, 4] IS fully cached now (full range was fetched), uses cache only
    primaryScanSpy.mockClear();
    cacheScanSpy.mockClear();
    const cachedFullResult = db.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 4 }] },
    ]);
    expect(cachedFullResult).toEqual(tasks);
    expect(primaryScanSpy).toHaveBeenCalledTimes(0); // no primary call
    expect(cacheScanSpy).toHaveBeenCalledTimes(1); // served from cache
  });

  it("insert/update/delete write to cache immediately and defer primary", async () => {
    const { db, primary, cache } = await createDBs();

    const task: Task = { id: "1", title: "A", value: 1, projectId: "p1" };
    db.insert(tasksTable, [task]);

    // Cache has it immediately
    expect(
      cache.intervalScan(tasksTable, "id", [
        { eq: [{ col: "id", val: "1" }] },
      ]),
    ).toEqual([task]);

    // Primary does NOT have it yet (deferred)
    expect(
      primary.intervalScan(tasksTable, "id", [
        { eq: [{ col: "id", val: "1" }] },
      ]),
    ).toEqual([]);

    // After flushing the queue, primary should have it
    await flushQueue();
    expect(
      primary.intervalScan(tasksTable, "id", [
        { eq: [{ col: "id", val: "1" }] },
      ]),
    ).toEqual([task]);

    // Update — cache immediate, primary deferred
    const updated = { ...task, title: "Updated" };
    db.update(tasksTable, [updated]);
    expect(
      cache.intervalScan(tasksTable, "id", [
        { eq: [{ col: "id", val: "1" }] },
      ]),
    ).toEqual([updated]);

    await flushQueue();
    expect(
      primary.intervalScan(tasksTable, "id", [
        { eq: [{ col: "id", val: "1" }] },
      ]),
    ).toEqual([updated]);

    // Delete — cache immediate, primary deferred
    db.delete(tasksTable, ["1"]);
    expect(
      cache.intervalScan(tasksTable, "id", [
        { eq: [{ col: "id", val: "1" }] },
      ]),
    ).toEqual([]);

    await flushQueue();
    expect(
      primary.intervalScan(tasksTable, "id", [
        { eq: [{ col: "id", val: "1" }] },
      ]),
    ).toEqual([]);
  });

  it("works with composite index", async () => {
    const dbs = await createDBs();
    const { db, primaryScanSpy, cacheScanSpy } = dbs;

    const tasks: Task[] = [
      { id: "1", title: "A", value: 1, projectId: "p1" },
      { id: "2", title: "B", value: 2, projectId: "p1" },
      { id: "3", title: "C", value: 1, projectId: "p2" },
    ];
    await seedPrimary(dbs, tasks);

    // Cache projectId=p1
    const p1Tasks = db.intervalScan(tasksTable, "byProjectIdValue", [
      { eq: [{ col: "projectId", val: "p1" }] },
    ]);
    expect(p1Tasks).toEqual([tasks[0], tasks[1]]);
    expect(primaryScanSpy).toHaveBeenCalledTimes(1);

    primaryScanSpy.mockClear();
    cacheScanSpy.mockClear();

    // Same query should hit cache
    const cached = db.intervalScan(tasksTable, "byProjectIdValue", [
      { eq: [{ col: "projectId", val: "p1" }] },
    ]);
    expect(cached).toEqual([tasks[0], tasks[1]]);
    expect(primaryScanSpy).toHaveBeenCalledTimes(0); // no primary call
    expect(cacheScanSpy).toHaveBeenCalledTimes(1);

    // Different projectId should NOT be cached — hits primary
    primaryScanSpy.mockClear();
    const uncached = db.intervalScan(tasksTable, "byProjectIdValue", [
      { eq: [{ col: "projectId", val: "p2" }] },
    ]);
    expect(uncached).toEqual([tasks[2]]);
    expect(primaryScanSpy).toHaveBeenCalledTimes(1);
  });

  it("limit with duplicate index values — full range cached even with limit", async () => {
    const dbs = await createDBs();
    const { db, primaryScanSpy } = dbs;

    // All three records have the same value=1, differ only by id
    const tasks: Task[] = [
      { id: "a", title: "A", value: 1, projectId: "p1" },
      { id: "b", title: "B", value: 1, projectId: "p1" },
      { id: "c", title: "C", value: 1, projectId: "p1" },
    ];
    await seedPrimary(dbs, tasks);

    // Scan with limit=2 — fetches full range from primary (no limit), returns first 2
    const limitResult = db.intervalScan(
      tasksTable,
      "byValue",
      [{ gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 1 }] }],
      { limit: 2 },
    );
    expect(limitResult).toHaveLength(2);
    expect(primaryScanSpy).toHaveBeenCalledTimes(1);

    primaryScanSpy.mockClear();

    // Full range is now cached — all 3 records served from cache
    const fullResult = db.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 1 }] },
    ]);
    expect(fullResult).toHaveLength(3);
    expect(primaryScanSpy).toHaveBeenCalledTimes(0); // served from cache
  });

  it("deferred writes are visible via cache on subsequent scans", async () => {
    const { db } = await createDBs();

    const task: Task = { id: "1", title: "A", value: 1, projectId: "p1" };
    db.insert(tasksTable, [task]);

    // Even though primary doesn't have it yet, cache does.
    // Scan for an uncached interval — primary returns nothing,
    // but cache has the record from the deferred insert.
    const result = db.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 1 }] },
    ]);
    expect(result).toEqual([task]);
  });

  it("transaction commit writes to cache immediately, defers primary", async () => {
    const { db, primary, cache } = await createDBs();

    const task: Task = { id: "1", title: "A", value: 1, projectId: "p1" };

    const tx = db.beginTx();
    tx.insert(tasksTable, [task]);
    tx.commit();

    // After commit — cache should have the data immediately
    expect(
      cache.intervalScan(tasksTable, "id", [
        { eq: [{ col: "id", val: "1" }] },
      ]),
    ).toEqual([task]);

    // Primary should NOT have it yet (deferred)
    expect(
      primary.intervalScan(tasksTable, "id", [
        { eq: [{ col: "id", val: "1" }] },
      ]),
    ).toEqual([]);

    // After flush — primary should have it
    await flushQueue();
    expect(
      primary.intervalScan(tasksTable, "id", [
        { eq: [{ col: "id", val: "1" }] },
      ]),
    ).toEqual([task]);
  });

  it("transaction commit defers updates and deletes to primary", async () => {
    const { db, primary, cache } = await createDBs();

    const task: Task = { id: "1", title: "A", value: 1, projectId: "p1" };
    db.insert(tasksTable, [task]);
    await flushQueue(); // flush the initial insert to primary

    // Update via tx
    const updated = { ...task, title: "Updated" };
    const tx1 = db.beginTx();
    tx1.update(tasksTable, [updated]);
    tx1.commit();

    // Cache has the update immediately
    expect(
      cache.intervalScan(tasksTable, "id", [
        { eq: [{ col: "id", val: "1" }] },
      ]),
    ).toEqual([updated]);

    await flushQueue();
    expect(
      primary.intervalScan(tasksTable, "id", [
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

    await flushQueue();
    expect(
      primary.intervalScan(tasksTable, "id", [
        { eq: [{ col: "id", val: "1" }] },
      ]),
    ).toEqual([]);
  });

  it("transaction scan uses interval cache — hits cache tx when covered", async () => {
    const dbs = await createDBs();
    const { db, primaryScanSpy, cacheScanSpy } = dbs;

    const tasks: Task[] = [
      { id: "1", title: "A", value: 1, projectId: "p1" },
    ];
    await seedPrimary(dbs, tasks);

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

  it("transaction scan hits primary DB when interval not cached", async () => {
    const dbs = await createDBs();
    const { db, cacheScanSpy } = dbs;

    const tasks: Task[] = [
      { id: "1", title: "A", value: 1, projectId: "p1" },
    ];
    await seedPrimary(dbs, tasks);

    cacheScanSpy.mockClear();

    // Scan inside transaction — interval NOT cached, hits primary DB
    const tx = db.beginTx();
    const txResult = tx.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 1 }] },
    ]);
    expect(txResult).toEqual(tasks);
    tx.commit();

    // After commit, the interval should be cached
    cacheScanSpy.mockClear();
    const result2 = db.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 1 }] },
    ]);
    expect(result2).toEqual(tasks);
    expect(cacheScanSpy).toHaveBeenCalled();
  });

  it("transaction rollback does not enqueue primary writes", async () => {
    const { db, primary, cache } = await createDBs();

    const tx = db.beginTx();
    tx.insert(tasksTable, [
      { id: "1", title: "A", value: 1, projectId: "p1" },
    ]);
    tx.rollback();

    await flushQueue();

    // Neither should have the data
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

  it("hash lookup after btree full scan — serves from cache, no primary hit", async () => {
    const dbs = await createDBs();
    const { db, primaryScanSpy, cacheScanSpy } = dbs;

    const tasks: Task[] = [
      { id: "1", title: "A", value: 1, projectId: "p1" },
      { id: "2", title: "B", value: 2, projectId: "p1" },
      { id: "3", title: "C", value: 3, projectId: "p2" },
    ];
    await seedPrimary(dbs, tasks);

    // Load all tasks via btree index
    db.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 3 }] },
    ]);
    expect(primaryScanSpy).toHaveBeenCalledTimes(1);

    primaryScanSpy.mockClear();
    cacheScanSpy.mockClear();

    // Hash lookup by id — should serve from cache since btree populated hash keys
    const result = db.intervalScan(tasksTable, "id", [
      { eq: [{ col: "id", val: "2" }] },
    ]);
    expect(result).toEqual([tasks[1]]);
    expect(primaryScanSpy).toHaveBeenCalledTimes(0); // no primary hit
    expect(cacheScanSpy).toHaveBeenCalledTimes(1); // served from cache
  });

  it("hash lookup caches individual keys — second lookup serves from cache", async () => {
    const dbs = await createDBs();
    const { db, primaryScanSpy, cacheScanSpy } = dbs;

    const tasks: Task[] = [
      { id: "1", title: "A", value: 1, projectId: "p1" },
      { id: "2", title: "B", value: 2, projectId: "p1" },
    ];
    await seedPrimary(dbs, tasks);

    // First hash lookup — hits primary
    const result1 = db.intervalScan(tasksTable, "id", [
      { eq: [{ col: "id", val: "1" }] },
    ]);
    expect(result1).toEqual([tasks[0]]);
    expect(primaryScanSpy).toHaveBeenCalledTimes(1);

    primaryScanSpy.mockClear();
    cacheScanSpy.mockClear();

    // Second identical hash lookup — should serve from cache
    const result2 = db.intervalScan(tasksTable, "id", [
      { eq: [{ col: "id", val: "1" }] },
    ]);
    expect(result2).toEqual([tasks[0]]);
    expect(primaryScanSpy).toHaveBeenCalledTimes(0); // no primary hit
    expect(cacheScanSpy).toHaveBeenCalledTimes(1); // served from cache

    // Different key still hits primary
    primaryScanSpy.mockClear();
    const result3 = db.intervalScan(tasksTable, "id", [
      { eq: [{ col: "id", val: "2" }] },
    ]);
    expect(result3).toEqual([tasks[1]]);
    expect(primaryScanSpy).toHaveBeenCalledTimes(1); // hits primary for new key
  });

  it("hash key tracking in transactions — propagates on commit", async () => {
    const dbs = await createDBs();
    const { db, primaryScanSpy, cacheScanSpy } = dbs;

    const tasks: Task[] = [
      { id: "1", title: "A", value: 1, projectId: "p1" },
    ];
    await seedPrimary(dbs, tasks);

    // Hash lookup inside a transaction
    const tx = db.beginTx();
    const txResult = tx.intervalScan(tasksTable, "id", [
      { eq: [{ col: "id", val: "1" }] },
    ]);
    expect(txResult).toEqual(tasks);
    expect(primaryScanSpy).toHaveBeenCalledTimes(1);
    tx.commit();

    primaryScanSpy.mockClear();
    cacheScanSpy.mockClear();

    // After commit, hash key should be cached — no primary hit
    const result = db.intervalScan(tasksTable, "id", [
      { eq: [{ col: "id", val: "1" }] },
    ]);
    expect(result).toEqual(tasks);
    expect(primaryScanSpy).toHaveBeenCalledTimes(0);
    expect(cacheScanSpy).toHaveBeenCalledTimes(1);
  });

  it("nested transactions commit to cache on outermost, defer primary", async () => {
    const { db, primary, cache } = await createDBs();

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

    // Cache should have both records immediately
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

    // Primary should NOT have them yet
    expect(
      primary.intervalScan(tasksTable, "id", [
        { eq: [{ col: "id", val: "1" }] },
      ]),
    ).toEqual([]);

    // After flush — primary should have both
    await flushQueue();
    expect(
      primary.intervalScan(tasksTable, "id", [
        { eq: [{ col: "id", val: "1" }] },
      ]),
    ).toHaveLength(1);
    expect(
      primary.intervalScan(tasksTable, "id", [
        { eq: [{ col: "id", val: "2" }] },
      ]),
    ).toHaveLength(1);
  });
});
