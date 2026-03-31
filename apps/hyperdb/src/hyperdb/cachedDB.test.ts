/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import { DB, execAsync } from "./db.ts";
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
    await execAsync(cachedDB.loadTables([tasksTable]));

    const primaryScanSpy = vi.spyOn(primary, "intervalScan");
    const cacheScanSpy = vi.spyOn(cache, "intervalScan");

    return {
      cachedDB,
      primary,
      cache,
      primaryScanSpy,
      cacheScanSpy,
    };
  };

  /** Insert tasks directly into primary (bypassing CachedDB) so primary has data for scans */
  const seedPrimary = async (
    dbs: Awaited<ReturnType<typeof createDBs>>,
    tasks: Task[],
  ) => {
    await execAsync(dbs.primary.insert(tasksTable, tasks));
  };

  it("serves from cache on second identical scan", async () => {
    const dbs = await createDBs();
    const { cachedDB, primaryScanSpy, cacheScanSpy } = dbs;

    const tasks: Task[] = [
      { id: "1", title: "A", value: 1, projectId: "p1" },
      { id: "2", title: "B", value: 2, projectId: "p1" },
      { id: "3", title: "C", value: 3, projectId: "p1" },
    ];
    await seedPrimary(dbs, tasks);

    // First scan — hits primary, populates cache
    const result1 = await execAsync(cachedDB.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 3 }] },
    ]));
    expect(result1).toEqual(tasks);
    expect(primaryScanSpy).toHaveBeenCalledTimes(1);

    primaryScanSpy.mockClear();
    cacheScanSpy.mockClear();

    // Second scan — should come from cache, not primary
    const result2 = await execAsync(cachedDB.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 3 }] },
    ]));
    expect(result2).toEqual(tasks);
    expect(primaryScanSpy).toHaveBeenCalledTimes(0); // not called
    expect(cacheScanSpy).toHaveBeenCalledTimes(1); // served from cache
  });

  it("hits primary when interval is not fully covered", async () => {
    const dbs = await createDBs();
    const { cachedDB, primaryScanSpy } = dbs;

    const tasks: Task[] = [
      { id: "1", title: "A", value: 1, projectId: "p1" },
      { id: "2", title: "B", value: 2, projectId: "p1" },
      { id: "3", title: "C", value: 3, projectId: "p1" },
      { id: "4", title: "D", value: 4, projectId: "p1" },
    ];
    await seedPrimary(dbs, tasks);

    // Cache interval [1, 2]
    await execAsync(cachedDB.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 2 }] },
    ]));
    expect(primaryScanSpy).toHaveBeenCalledTimes(1);

    // Query [1, 4] — not fully covered, should hit primary again
    const result = await execAsync(cachedDB.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 4 }] },
    ]));
    expect(result).toEqual(tasks);
    expect(primaryScanSpy).toHaveBeenCalledTimes(2);
  });

  it("partial loading — fetches from primary and merges into cache", async () => {
    const dbs = await createDBs();
    const { cachedDB, primaryScanSpy } = dbs;

    const tasks: Task[] = [
      { id: "1", title: "A", value: 1, projectId: "p1" },
      { id: "2", title: "B", value: 2, projectId: "p1" },
      { id: "3", title: "C", value: 3, projectId: "p1" },
      { id: "4", title: "D", value: 4, projectId: "p1" },
      { id: "5", title: "E", value: 5, projectId: "p1" },
    ];
    await seedPrimary(dbs, tasks);

    // Cache [1, 2]
    await execAsync(cachedDB.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 2 }] },
    ]));
    expect(primaryScanSpy).toHaveBeenCalledTimes(1);

    // Cache [4, 5]
    await execAsync(cachedDB.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 4 }], lte: [{ col: "value", val: 5 }] },
    ]));
    expect(primaryScanSpy).toHaveBeenCalledTimes(2);

    primaryScanSpy.mockClear();

    // Query [1, 5] — not fully cached, hits primary and returns correct results
    const result = await execAsync(cachedDB.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 5 }] },
    ]));
    expect(result).toEqual(tasks);
    expect(primaryScanSpy).toHaveBeenCalled();

    // Now [1,5] should be fully cached
    primaryScanSpy.mockClear();
    const cachedResult = await execAsync(cachedDB.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 5 }] },
    ]));
    expect(cachedResult).toEqual(tasks);
    expect(primaryScanSpy).toHaveBeenCalledTimes(0); // fully cached
  });

  it("merges overlapping intervals", async () => {
    const dbs = await createDBs();
    const { cachedDB, primaryScanSpy, cacheScanSpy } = dbs;

    const tasks: Task[] = [
      { id: "1", title: "A", value: 1, projectId: "p1" },
      { id: "2", title: "B", value: 2, projectId: "p1" },
      { id: "3", title: "C", value: 3, projectId: "p1" },
      { id: "4", title: "D", value: 4, projectId: "p1" },
    ];
    await seedPrimary(dbs, tasks);

    // Cache [1, 3]
    await execAsync(cachedDB.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 3 }] },
    ]));

    // Cache [2, 4] — overlaps with [1, 3], should merge into [1, 4]
    await execAsync(cachedDB.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 2 }], lte: [{ col: "value", val: 4 }] },
    ]));
    expect(primaryScanSpy).toHaveBeenCalledTimes(2);

    primaryScanSpy.mockClear();
    cacheScanSpy.mockClear();

    // Query [1, 4] — should be fully covered by merged interval, uses cache only
    const result = await execAsync(cachedDB.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 4 }] },
    ]));
    expect(result).toEqual(tasks);
    expect(primaryScanSpy).toHaveBeenCalledTimes(0); // no primary call
    expect(cacheScanSpy).toHaveBeenCalledTimes(1); // served from cache
  });

  it("handles limit - caches only up to last returned row", async () => {
    const dbs = await createDBs();
    const { cachedDB, primaryScanSpy, cacheScanSpy } = dbs;

    const tasks: Task[] = [
      { id: "1", title: "A", value: 1, projectId: "p1" },
      { id: "2", title: "B", value: 2, projectId: "p1" },
      { id: "3", title: "C", value: 3, projectId: "p1" },
      { id: "4", title: "D", value: 4, projectId: "p1" },
    ];
    await seedPrimary(dbs, tasks);

    // Scan with limit=2 — fetches 2 rows from primary, caches only up to row 2
    const limitResult = await execAsync(cachedDB.intervalScan(
      tasksTable,
      "byValue",
      [{ gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 4 }] }],
      { limit: 2 },
    ));
    expect(limitResult).toEqual([tasks[0], tasks[1]]);
    expect(primaryScanSpy).toHaveBeenCalledTimes(1);

    primaryScanSpy.mockClear();
    cacheScanSpy.mockClear();

    // Query [1, 1] — within cached interval, should use cache
    const cachedResult = await execAsync(cachedDB.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 1 }] },
    ]));
    expect(cachedResult).toEqual([tasks[0]]);
    expect(primaryScanSpy).toHaveBeenCalledTimes(0); // served from cache
    expect(cacheScanSpy).toHaveBeenCalledTimes(1);

    // Query [1, 4] — NOT fully cached (only [1,2] cached), should hit primary
    primaryScanSpy.mockClear();
    cacheScanSpy.mockClear();
    const fullResult = await execAsync(cachedDB.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 4 }] },
    ]));
    expect(fullResult).toEqual(tasks);
    expect(primaryScanSpy).toHaveBeenCalledTimes(1); // hits primary for uncovered portion
  });

  it("works with composite index", async () => {
    const dbs = await createDBs();
    const { cachedDB, primaryScanSpy, cacheScanSpy } = dbs;

    const tasks: Task[] = [
      { id: "1", title: "A", value: 1, projectId: "p1" },
      { id: "2", title: "B", value: 2, projectId: "p1" },
      { id: "3", title: "C", value: 1, projectId: "p2" },
    ];
    await seedPrimary(dbs, tasks);

    // Cache projectId=p1
    const p1Tasks = await execAsync(cachedDB.intervalScan(tasksTable, "byProjectIdValue", [
      { eq: [{ col: "projectId", val: "p1" }] },
    ]));
    expect(p1Tasks).toEqual([tasks[0], tasks[1]]);
    expect(primaryScanSpy).toHaveBeenCalledTimes(1);

    primaryScanSpy.mockClear();
    cacheScanSpy.mockClear();

    // Same query should hit cache
    const cached = await execAsync(cachedDB.intervalScan(tasksTable, "byProjectIdValue", [
      { eq: [{ col: "projectId", val: "p1" }] },
    ]));
    expect(cached).toEqual([tasks[0], tasks[1]]);
    expect(primaryScanSpy).toHaveBeenCalledTimes(0); // no primary call
    expect(cacheScanSpy).toHaveBeenCalledTimes(1);

    // Different projectId should NOT be cached — hits primary
    primaryScanSpy.mockClear();
    const uncached = await execAsync(cachedDB.intervalScan(tasksTable, "byProjectIdValue", [
      { eq: [{ col: "projectId", val: "p2" }] },
    ]));
    expect(uncached).toEqual([tasks[2]]);
    expect(primaryScanSpy).toHaveBeenCalledTimes(1);
  });

  it("limit with duplicate index values — partial range cached with limit", async () => {
    const dbs = await createDBs();
    const { cachedDB, primaryScanSpy } = dbs;

    // All three records have the same value=1, differ only by id
    const tasks: Task[] = [
      { id: "a", title: "A", value: 1, projectId: "p1" },
      { id: "b", title: "B", value: 1, projectId: "p1" },
      { id: "c", title: "C", value: 1, projectId: "p1" },
    ];
    await seedPrimary(dbs, tasks);

    // Scan with limit=2 — fetches 2 rows from primary, caches up to id="b"
    const limitResult = await execAsync(cachedDB.intervalScan(
      tasksTable,
      "byValue",
      [{ gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 1 }] }],
      { limit: 2 },
    ));
    expect(limitResult).toHaveLength(2);
    expect(primaryScanSpy).toHaveBeenCalledTimes(1);

    primaryScanSpy.mockClear();

    // Full range is NOT fully cached — should hit primary for remaining rows
    const fullResult = await execAsync(cachedDB.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 1 }] },
    ]));
    expect(fullResult).toHaveLength(3);
    expect(primaryScanSpy).toHaveBeenCalledTimes(1); // hits primary for uncovered portion
  });

  it("repeated limit query serves from cache when enough rows cached", async () => {
    const dbs = await createDBs();
    const { cachedDB, primaryScanSpy } = dbs;

    const tasks: Task[] = Array.from({ length: 20 }, (_, i) => ({
      id: String(i + 1).padStart(3, "0"),
      title: `Task ${i + 1}`,
      value: i + 1,
      projectId: "p1",
    }));
    await seedPrimary(dbs, tasks);

    // First query: limit=5, hits primary
    const result1 = await execAsync(cachedDB.intervalScan(
      tasksTable,
      "byValue",
      [{ gte: [{ col: "value", val: 1 }] }],
      { limit: 5 },
    ));
    expect(result1).toHaveLength(5);
    expect(primaryScanSpy).toHaveBeenCalledTimes(1);

    primaryScanSpy.mockClear();

    // Second identical query: cache has 5 rows before the uncovered gap — serve from cache
    const result2 = await execAsync(cachedDB.intervalScan(
      tasksTable,
      "byValue",
      [{ gte: [{ col: "value", val: 1 }] }],
      { limit: 5 },
    ));
    expect(result2).toHaveLength(5);
    expect(result2).toEqual(result1);
    expect(primaryScanSpy).toHaveBeenCalledTimes(0); // no primary hit
  });

  it("limit queries incrementally cache and eventually cover full range", async () => {
    const dbs = await createDBs();
    const { cachedDB, primaryScanSpy } = dbs;

    const tasks: Task[] = Array.from({ length: 20 }, (_, i) => ({
      id: String(i + 1).padStart(3, "0"),
      title: `Task ${i + 1}`,
      value: i + 1,
      projectId: "p1",
    }));
    await seedPrimary(dbs, tasks);

    // Query with limit=5 — returns first 5 rows
    const result1 = await execAsync(cachedDB.intervalScan(
      tasksTable,
      "byValue",
      [{ gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 20 }] }],
      { limit: 5 },
    ));
    expect(result1).toHaveLength(5);
    expect(result1).toEqual(tasks.slice(0, 5));
    expect(primaryScanSpy).toHaveBeenCalledTimes(1);

    primaryScanSpy.mockClear();

    // Query with limit=10 — should hit primary for rows 6-10 (uncovered portion)
    const result2 = await execAsync(cachedDB.intervalScan(
      tasksTable,
      "byValue",
      [{ gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 20 }] }],
      { limit: 10 },
    ));
    expect(result2).toHaveLength(10);
    expect(result2).toEqual(tasks.slice(0, 10));
    expect(primaryScanSpy).toHaveBeenCalledTimes(1); // hits primary for uncovered portion

    primaryScanSpy.mockClear();

    // Query without limit — should hit primary for rows 11-20
    const result3 = await execAsync(cachedDB.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 20 }] },
    ]));
    expect(result3).toHaveLength(20);
    expect(result3).toEqual(tasks);
    expect(primaryScanSpy).toHaveBeenCalledTimes(1); // hits primary for remaining

    primaryScanSpy.mockClear();

    // Now fully cached — no primary hit
    const result4 = await execAsync(cachedDB.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 20 }] },
    ]));
    expect(result4).toEqual(tasks);
    expect(primaryScanSpy).toHaveBeenCalledTimes(0);
  });

  it("limit less than available rows — does not over-cache", async () => {
    const dbs = await createDBs();
    const { cachedDB, primaryScanSpy } = dbs;

    const tasks: Task[] = [
      { id: "1", title: "A", value: 1, projectId: "p1" },
      { id: "2", title: "B", value: 2, projectId: "p1" },
      { id: "3", title: "C", value: 3, projectId: "p1" },
    ];
    await seedPrimary(dbs, tasks);

    // Query with limit=2
    await execAsync(cachedDB.intervalScan(
      tasksTable,
      "byValue",
      [{ gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 3 }] }],
      { limit: 2 },
    ));
    expect(primaryScanSpy).toHaveBeenCalledTimes(1);
    primaryScanSpy.mockClear();

    // Query for value=3 only — should NOT be cached, hits primary
    const result = await execAsync(cachedDB.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 3 }], lte: [{ col: "value", val: 3 }] },
    ]));
    expect(result).toEqual([tasks[2]]);
    expect(primaryScanSpy).toHaveBeenCalledTimes(1);
  });

  it("transaction scan uses interval cache — hits cache tx when covered", async () => {
    const dbs = await createDBs();
    const { cachedDB, primaryScanSpy, cacheScanSpy } = dbs;

    const tasks: Task[] = [
      { id: "1", title: "A", value: 1, projectId: "p1" },
    ];
    await seedPrimary(dbs, tasks);

    // Populate interval cache via a non-tx scan
    await execAsync(cachedDB.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 1 }] },
    ]));

    primaryScanSpy.mockClear();
    cacheScanSpy.mockClear();

    // Scan inside transaction — interval is cached, so should hit cache tx
    const tx = await execAsync(cachedDB.beginTx());
    const txResult = await execAsync(tx.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 1 }] },
    ]));
    expect(txResult).toEqual(tasks);
    await execAsync(tx.commit());
  });

  it("transaction scan hits primary DB when interval not cached", async () => {
    const dbs = await createDBs();
    const { cachedDB, cacheScanSpy } = dbs;

    const tasks: Task[] = [
      { id: "1", title: "A", value: 1, projectId: "p1" },
    ];
    await seedPrimary(dbs, tasks);

    cacheScanSpy.mockClear();

    // Scan inside transaction — interval NOT cached, hits primary DB
    const tx = await execAsync(cachedDB.beginTx());
    const txResult = await execAsync(tx.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 1 }] },
    ]));
    expect(txResult).toEqual(tasks);
    await execAsync(tx.commit());

    // After commit, the interval should be cached
    cacheScanSpy.mockClear();
    const result2 = await execAsync(cachedDB.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 1 }] },
    ]));
    expect(result2).toEqual(tasks);
    expect(cacheScanSpy).toHaveBeenCalled();
  });

  it("hash lookup after btree full scan — serves from cache, no primary hit", async () => {
    const dbs = await createDBs();
    const { cachedDB, primaryScanSpy, cacheScanSpy } = dbs;

    const tasks: Task[] = [
      { id: "1", title: "A", value: 1, projectId: "p1" },
      { id: "2", title: "B", value: 2, projectId: "p1" },
      { id: "3", title: "C", value: 3, projectId: "p2" },
    ];
    await seedPrimary(dbs, tasks);

    // Load all tasks via btree index
    await execAsync(cachedDB.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 3 }] },
    ]));
    expect(primaryScanSpy).toHaveBeenCalledTimes(1);

    primaryScanSpy.mockClear();
    cacheScanSpy.mockClear();

    // Hash lookup by id — should serve from cache since btree populated hash keys
    const result = await execAsync(cachedDB.intervalScan(tasksTable, "id", [
      { eq: [{ col: "id", val: "2" }] },
    ]));
    expect(result).toEqual([tasks[1]]);
    expect(primaryScanSpy).toHaveBeenCalledTimes(0); // no primary hit
    expect(cacheScanSpy).toHaveBeenCalledTimes(1); // served from cache
  });

  it("hash lookup caches individual keys — second lookup serves from cache", async () => {
    const dbs = await createDBs();
    const { cachedDB, primaryScanSpy, cacheScanSpy } = dbs;

    const tasks: Task[] = [
      { id: "1", title: "A", value: 1, projectId: "p1" },
      { id: "2", title: "B", value: 2, projectId: "p1" },
    ];
    await seedPrimary(dbs, tasks);

    // First hash lookup — hits primary
    const result1 = await execAsync(cachedDB.intervalScan(tasksTable, "id", [
      { eq: [{ col: "id", val: "1" }] },
    ]));
    expect(result1).toEqual([tasks[0]]);
    expect(primaryScanSpy).toHaveBeenCalledTimes(1);

    primaryScanSpy.mockClear();
    cacheScanSpy.mockClear();

    // Second identical hash lookup — should serve from cache
    const result2 = await execAsync(cachedDB.intervalScan(tasksTable, "id", [
      { eq: [{ col: "id", val: "1" }] },
    ]));
    expect(result2).toEqual([tasks[0]]);
    expect(primaryScanSpy).toHaveBeenCalledTimes(0); // no primary hit
    expect(cacheScanSpy).toHaveBeenCalledTimes(1); // served from cache

    // Different key still hits primary
    primaryScanSpy.mockClear();
    const result3 = await execAsync(cachedDB.intervalScan(tasksTable, "id", [
      { eq: [{ col: "id", val: "2" }] },
    ]));
    expect(result3).toEqual([tasks[1]]);
    expect(primaryScanSpy).toHaveBeenCalledTimes(1); // hits primary for new key
  });

  it("hash key tracking in transactions — propagates on commit", async () => {
    const dbs = await createDBs();
    const { cachedDB, primaryScanSpy, cacheScanSpy } = dbs;

    const tasks: Task[] = [
      { id: "1", title: "A", value: 1, projectId: "p1" },
    ];
    await seedPrimary(dbs, tasks);

    // Hash lookup inside a transaction
    const tx = await execAsync(cachedDB.beginTx());
    const txResult = await execAsync(tx.intervalScan(tasksTable, "id", [
      { eq: [{ col: "id", val: "1" }] },
    ]));
    expect(txResult).toEqual(tasks);
    expect(primaryScanSpy).toHaveBeenCalledTimes(1);
    await execAsync(tx.commit());

    primaryScanSpy.mockClear();
    cacheScanSpy.mockClear();

    // After commit, hash key should be cached — no primary hit
    const result = await execAsync(cachedDB.intervalScan(tasksTable, "id", [
      { eq: [{ col: "id", val: "1" }] },
    ]));
    expect(result).toEqual(tasks);
    expect(primaryScanSpy).toHaveBeenCalledTimes(0);
    expect(cacheScanSpy).toHaveBeenCalledTimes(1);
  });

  it("afterScan callback is called with correct arguments", async () => {
    const dbs = await createDBs();
    const { cachedDB } = dbs;

    const tasks: Task[] = [
      { id: "1", title: "A", value: 1, projectId: "p1" },
      { id: "2", title: "B", value: 2, projectId: "p1" },
    ];
    await seedPrimary(dbs, tasks);

    const calls: any[] = [];
    cachedDB.afterScan(function* (_db, table, indexName, clauses, selectOptions, results) {
      calls.push({ table, indexName, clauses, selectOptions, results });
    });

    const result = await execAsync(cachedDB.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 2 }] },
    ]));

    expect(result).toEqual(tasks);
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe(tasksTable);
    expect(calls[0].indexName).toBe("byValue");
    expect(calls[0].clauses).toEqual([
      { gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 2 }] },
    ]);
    expect(calls[0].results).toEqual(tasks);
  });

  it("afterScan callback can preload related rows", async () => {
    const dbs = await createDBs();
    const { cachedDB, primaryScanSpy } = dbs;

    const tasks: Task[] = [
      { id: "1", title: "A", value: 1, projectId: "p1" },
      { id: "2", title: "B", value: 2, projectId: "p1" },
      { id: "3", title: "C", value: 3, projectId: "p2" },
    ];
    await seedPrimary(dbs, tasks);

    // Register afterScan that preloads byProjectIdValue for each unique projectId
    cachedDB.afterScan(function* (db, _table, indexName, _clauses, _selectOptions, results) {
      if (indexName === "byValue") {
        const projectIds = [...new Set(results.map((r: any) => r.projectId))];
        for (const pid of projectIds) {
          yield* db.intervalScan(tasksTable, "byProjectIdValue", [
            { eq: [{ col: "projectId", val: pid }] },
          ]);
        }
      }
    });

    // Perform initial byValue scan — triggers afterScan which preloads byProjectIdValue
    await execAsync(cachedDB.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 3 }] },
    ]));

    primaryScanSpy.mockClear();

    // Now byProjectIdValue for p1 and p2 should be cached
    const p1 = await execAsync(cachedDB.intervalScan(tasksTable, "byProjectIdValue", [
      { eq: [{ col: "projectId", val: "p1" }] },
    ]));
    expect(p1).toEqual([tasks[0], tasks[1]]);
    expect(primaryScanSpy).toHaveBeenCalledTimes(0); // served from cache

    const p2 = await execAsync(cachedDB.intervalScan(tasksTable, "byProjectIdValue", [
      { eq: [{ col: "projectId", val: "p2" }] },
    ]));
    expect(p2).toEqual([tasks[2]]);
    expect(primaryScanSpy).toHaveBeenCalledTimes(0); // still from cache
  });

  it("afterScan callback fires in transactions", async () => {
    const dbs = await createDBs();
    const { cachedDB } = dbs;

    const tasks: Task[] = [
      { id: "1", title: "A", value: 1, projectId: "p1" },
    ];
    await seedPrimary(dbs, tasks);

    const calls: any[] = [];
    cachedDB.afterScan(function* (_db, _table, indexName, _clauses, _selectOptions, results) {
      calls.push({ indexName, results });
    });

    const tx = await execAsync(cachedDB.beginTx());
    await execAsync(tx.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 1 }] },
    ]));
    await execAsync(tx.commit());

    expect(calls).toHaveLength(1);
    expect(calls[0].indexName).toBe("byValue");
    expect(calls[0].results).toEqual(tasks);
  });

  it("afterScan unsubscribe works", async () => {
    const dbs = await createDBs();
    const { cachedDB } = dbs;

    const tasks: Task[] = [
      { id: "1", title: "A", value: 1, projectId: "p1" },
    ];
    await seedPrimary(dbs, tasks);

    const calls: any[] = [];
    const unsub = cachedDB.afterScan(function* (_db, _table, indexName, _clauses, _selectOptions, results) {
      calls.push({ indexName, results });
    });

    // First scan — callback fires
    await execAsync(cachedDB.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 1 }] },
    ]));
    expect(calls).toHaveLength(1);

    // Unsubscribe
    unsub();

    // Second scan — callback should NOT fire
    await execAsync(cachedDB.intervalScan(tasksTable, "byValue", [
      { gte: [{ col: "value", val: 1 }], lte: [{ col: "value", val: 1 }] },
    ]));
    expect(calls).toHaveLength(1); // still 1, not 2
  });

});
