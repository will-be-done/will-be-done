/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  type HyperDB,
  type HyperDBTx,
  type WhereClause,
  type SelectOptions,
  type Trait,
  type Row,
  execAsync,
} from "./db";
import { convertWhereToBound } from "./bounds";
import type { TableDefinition, ExtractSchema, ExtractIndexes } from "./table";
import type { DBCmd } from "./generators";
import {
  type NormalizedInterval,
  tupleScanToNormalized,
  mergeInterval,
  subtractIntervals,
  intervalToWhereClause,
} from "./intervals";

type PendingOp =
  | { type: "insert"; table: TableDefinition; records: Row[] }
  | { type: "update"; table: TableDefinition; records: Row[] }
  | { type: "delete"; table: TableDefinition; ids: string[] };

/**
 * Populate hash key caches for all hash indexes on a table from loaded records.
 */
function populateHashKeysFromRecords(
  table: TableDefinition,
  records: Row[],
  cachedHashKeys: Map<string, Set<string>>,
) {
  for (const [idxName, idxConfig] of Object.entries(table.indexes)) {
    if (idxConfig.type === "hash") {
      const hashKey = `${table.tableName}:${idxName}`;
      let keys = cachedHashKeys.get(hashKey);
      if (!keys) {
        keys = new Set();
        cachedHashKeys.set(hashKey, keys);
      }
      const hashCol = (idxConfig.cols as string[])[0];
      for (const record of records) {
        keys.add(String(record[hashCol]));
      }
    }
  }
}

/**
 * Hash index scan — uses a simple set of cached keys instead of intervals.
 */
function* cachedHashScan<
  TTable extends TableDefinition,
  K extends keyof ExtractIndexes<TTable>,
>(
  primary: HyperDB | HyperDBTx,
  cache: HyperDB | HyperDBTx,
  cachedHashKeys: Map<string, Set<string>>,
  table: TTable,
  indexName: K,
  clauses: WhereClause[],
  selectOptions?: SelectOptions,
): Generator<DBCmd, ExtractSchema<TTable>[]> {
  const key = `${table.tableName}:${indexName as string}`;

  // Extract the eq value from the clause
  const eqVal = clauses[0]?.eq?.[0]?.val;
  if (eqVal === undefined) {
    // Fallback: not a simple eq lookup, just query primary
    return yield* primary.intervalScan(table, indexName, clauses, selectOptions);
  }

  const hashKeyStr = String(eqVal);
  const cachedKeys = cachedHashKeys.get(key);

  if (cachedKeys?.has(hashKeyStr)) {
    // Key is cached — serve from cache
    return yield* cache.intervalScan(table, indexName, clauses, selectOptions);
  }

  // Query primary
  const results = yield* primary.intervalScan(table, indexName, clauses, selectOptions);
  if (results.length > 0) {
    yield* cache.update(table, results);
  }

  // Mark this key as cached
  if (!cachedKeys) {
    cachedHashKeys.set(key, new Set([hashKeyStr]));
  } else {
    cachedKeys.add(hashKeyStr);
  }

  return yield* cache.intervalScan(table, indexName, clauses, selectOptions);
}

/**
 * Shared interval scan logic used by both CachedDB and CachedDBTx.
 * Routes to cache when intervals are fully covered, otherwise queries primary
 * and populates the cache.
 */
function* cachedIntervalScan<
  TTable extends TableDefinition,
  K extends keyof ExtractIndexes<TTable>,
>(
  primary: HyperDB | HyperDBTx,
  cache: HyperDB | HyperDBTx,
  cachedIntervals: Map<string, NormalizedInterval[]>,
  cachedHashKeys: Map<string, Set<string>>,
  table: TTable,
  indexName: K,
  clauses: WhereClause[],
  selectOptions?: SelectOptions,
): Generator<DBCmd, ExtractSchema<TTable>[]> {
  const indexConfig = table.indexes[indexName as string];
  if (!indexConfig) {
    throw new Error(
      `Index not found: ${indexName as string} for table: ${table.tableName}`,
    );
  }

  const baseCols = indexConfig.cols as string[];
  // Drivers append "id" to btree tuples for deterministic ordering.
  // We must track intervals with the same effective cols.
  const indexCols =
    baseCols[baseCols.length - 1] !== "id" ? [...baseCols, "id"] : baseCols;
  const indexColCount = indexCols.length;
  const key = `${table.tableName}:${indexName as string}`;

  const tupleBounds = convertWhereToBound(baseCols, clauses);
  const requestedIntervals = tupleBounds.map((b) =>
    tupleScanToNormalized(b, indexColCount),
  );

  const cached = cachedIntervals.get(key) ?? [];
  const uncovered = subtractIntervals(cached, requestedIntervals);

  if (uncovered.length === 0) {
    // Fully covered — serve from cache
    const results = yield* cache.intervalScan(table, indexName, clauses, selectOptions);
    // Populate hash key caches from returned results
    if (results.length > 0) {
      populateHashKeysFromRecords(table, results as Row[], cachedHashKeys);
    }
    return results;
  }

  // Query primary ONLY for uncovered intervals
  for (const interval of uncovered) {
    const whereClause = intervalToWhereClause(interval, baseCols);
    const clauseArray =
      Object.keys(whereClause).length > 0 ? [whereClause] : clauses;

    // No limit on partial queries — we want to fully cache each uncovered range
    const results: ExtractSchema<TTable>[] = yield* primary.intervalScan(
      table,
      indexName,
      clauseArray,
    );

    if (results.length > 0) {
      // Use update (delete+insert) to avoid duplicates — cache may already
      // have some of these records from deferred writes
      yield* cache.update(table, results);

      // Populate hash key caches for all hash indexes on this table
      populateHashKeysFromRecords(table, results as Row[], cachedHashKeys);
    }
  }

  // Compute the actual loaded intervals (broadened to baseCols level)
  // by converting each uncovered interval's WhereClause back through the pipeline
  let current = cached;
  for (const interval of uncovered) {
    const whereClause = intervalToWhereClause(interval, baseCols);
    const clauseArray =
      Object.keys(whereClause).length > 0 ? [whereClause] : clauses;
    const bounds = convertWhereToBound(baseCols, clauseArray);
    for (const b of bounds) {
      const loadedInterval = tupleScanToNormalized(b, indexColCount);
      current = mergeInterval(current, loadedInterval);
    }
  }
  cachedIntervals.set(key, current);

  // Re-query cache for final results — cache has both primary data
  // and any locally-written but not-yet-persisted records
  return yield* cache.intervalScan(table, indexName, clauses, selectOptions);
}

function cloneIntervals(
  intervals: Map<string, NormalizedInterval[]>,
): Map<string, NormalizedInterval[]> {
  const clone = new Map<string, NormalizedInterval[]>();
  for (const [key, value] of intervals) {
    clone.set(key, [...value]);
  }
  return clone;
}

function cloneHashKeys(
  hashKeys: Map<string, Set<string>>,
): Map<string, Set<string>> {
  const clone = new Map<string, Set<string>>();
  for (const [key, value] of hashKeys) {
    clone.set(key, new Set(value));
  }
  return clone;
}

class CachedDBTx implements HyperDBTx {
  private primaryDB: HyperDB;
  private cacheTx: HyperDBTx;
  private parentIntervals: Map<string, NormalizedInterval[]>;
  private txIntervals: Map<string, NormalizedInterval[]>;
  private parentHashKeys: Map<string, Set<string>>;
  private txHashKeys: Map<string, Set<string>>;
  private pendingOps: PendingOp[];
  private enqueuePrimary: (fn: () => Promise<void>) => void;
  private traits: Trait[];
  private isOutermost: boolean;

  constructor(
    primaryDB: HyperDB,
    cacheTx: HyperDBTx,
    parentIntervals: Map<string, NormalizedInterval[]>,
    txIntervals: Map<string, NormalizedInterval[]>,
    parentHashKeys: Map<string, Set<string>>,
    txHashKeys: Map<string, Set<string>>,
    pendingOps: PendingOp[],
    enqueuePrimary: (fn: () => Promise<void>) => void,
    traits: Trait[] = [],
    isOutermost = true,
  ) {
    this.primaryDB = primaryDB;
    this.cacheTx = cacheTx;
    this.parentIntervals = parentIntervals;
    this.txIntervals = txIntervals;
    this.parentHashKeys = parentHashKeys;
    this.txHashKeys = txHashKeys;
    this.pendingOps = pendingOps;
    this.enqueuePrimary = enqueuePrimary;
    this.traits = traits;
    this.isOutermost = isOutermost;
  }

  *intervalScan<
    TTable extends TableDefinition,
    K extends keyof ExtractIndexes<TTable>,
  >(
    table: TTable,
    indexName: K,
    clauses: WhereClause[],
    selectOptions?: SelectOptions,
  ): Generator<DBCmd, ExtractSchema<TTable>[]> {
    const indexConfig = table.indexes[indexName as string];
    if (indexConfig?.type === "hash") {
      return yield* cachedHashScan(
        this.primaryDB,
        this.cacheTx,
        this.txHashKeys,
        table,
        indexName,
        clauses,
        selectOptions,
      );
    }
    return yield* cachedIntervalScan(
      this.primaryDB,
      this.cacheTx,
      this.txIntervals,
      this.txHashKeys,
      table,
      indexName,
      clauses,
      selectOptions,
    );
  }

  *insert<TTable extends TableDefinition>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ): Generator<DBCmd, void> {
    yield* this.cacheTx.insert(table, records);
    this.pendingOps.push({ type: "insert", table, records: records as Row[] });
  }

  *update<TTable extends TableDefinition>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ): Generator<DBCmd, void> {
    yield* this.cacheTx.update(table, records);
    this.pendingOps.push({ type: "update", table, records: records as Row[] });
  }

  *delete<TTable extends TableDefinition>(
    table: TTable,
    ids: string[],
  ): Generator<DBCmd, void> {
    yield* this.cacheTx.delete(table, ids);
    this.pendingOps.push({ type: "delete", table, ids });
  }

  *loadTables(): Generator<DBCmd, void> {
    throw new Error("Not supported");
  }

  *beginTx(): Generator<DBCmd, HyperDBTx> {
    const nestedCacheTx = yield* this.cacheTx.beginTx();
    return new CachedDBTx(
      this.primaryDB,
      nestedCacheTx,
      this.parentIntervals,
      this.txIntervals,
      this.parentHashKeys,
      this.txHashKeys,
      this.pendingOps,
      this.enqueuePrimary,
      this.traits,
      false,
    );
  }

  *commit(): Generator<DBCmd, void> {
    yield* this.cacheTx.commit();

    if (this.isOutermost) {
      // Propagate tx intervals back to parent
      for (const [key, value] of this.txIntervals) {
        this.parentIntervals.set(key, value);
      }

      // Propagate tx hash keys back to parent
      for (const [key, value] of this.txHashKeys) {
        const parentSet = this.parentHashKeys.get(key);
        if (parentSet) {
          for (const k of value) parentSet.add(k);
        } else {
          this.parentHashKeys.set(key, new Set(value));
        }
      }

      // Schedule primary tx replay in background (non-blocking)
      const ops = [...this.pendingOps];
      const primaryDB = this.primaryDB;
      this.enqueuePrimary(async () => {
        const tx = await execAsync(primaryDB.beginTx());
        try {
          for (const op of ops) {
            switch (op.type) {
              case "insert":
                await execAsync(tx.insert(op.table, op.records));
                break;
              case "update":
                await execAsync(tx.update(op.table, op.records));
                break;
              case "delete":
                await execAsync(tx.delete(op.table, op.ids));
                break;
            }
          }
          await execAsync(tx.commit());
        } catch (e) {
          console.error("CachedDB: primary tx replay failed", e);
          await execAsync(tx.rollback());
        }
      });
    }
  }

  *rollback(): Generator<DBCmd, void> {
    yield* this.cacheTx.rollback();
    // pendingOps and txIntervals are discarded — parent remains unchanged
    this.pendingOps.length = 0;
  }

  withTraits(...traits: Trait[]): HyperDBTx {
    return new CachedDBTx(
      this.primaryDB,
      this.cacheTx.withTraits(...traits) as HyperDBTx,
      this.parentIntervals,
      this.txIntervals,
      this.parentHashKeys,
      this.txHashKeys,
      this.pendingOps,
      this.enqueuePrimary,
      [...this.traits, ...traits],
      this.isOutermost,
    );
  }

  getTraits(): Trait[] {
    return [...this.traits, ...this.primaryDB.getTraits()];
  }
}

export class CachedDB implements HyperDB {
  private primary: HyperDB;
  private cache: HyperDB;
  private cachedIntervals: Map<string, NormalizedInterval[]>;
  private cachedHashKeys: Map<string, Set<string>>;
  private primaryWriteQueue: (() => Promise<void>)[] = [];
  private processingQueue = false;

  constructor(
    primary: HyperDB,
    cache: HyperDB,
    cachedIntervals?: Map<string, NormalizedInterval[]>,
    cachedHashKeys?: Map<string, Set<string>>,
  ) {
    this.primary = primary;
    this.cache = cache;
    this.cachedIntervals = cachedIntervals ?? new Map();
    this.cachedHashKeys = cachedHashKeys ?? new Map();
  }

  /** Enqueue an async operation against the primary DB, processed via setTimeout(0). */
  enqueuePrimaryWrite(fn: () => Promise<void>) {
    this.primaryWriteQueue.push(fn);
    if (!this.processingQueue) {
      this.processingQueue = true;
      setTimeout(() => this.flushPrimaryWrites(), 1000);
    }
  }

  private async flushPrimaryWrites() {
    while (this.primaryWriteQueue.length > 0) {
      const fn = this.primaryWriteQueue.shift()!;
      try {
        await fn();
      } catch (e) {
        console.error("CachedDB: primary write failed", e);
      }
    }
    this.processingQueue = false;
  }

  *intervalScan<
    TTable extends TableDefinition,
    K extends keyof ExtractIndexes<TTable>,
  >(
    table: TTable,
    indexName: K,
    clauses: WhereClause[],
    selectOptions?: SelectOptions,
  ): Generator<DBCmd, ExtractSchema<TTable>[]> {
    const indexConfig = table.indexes[indexName as string];
    if (indexConfig?.type === "hash") {
      return yield* cachedHashScan(
        this.primary,
        this.cache,
        this.cachedHashKeys,
        table,
        indexName,
        clauses,
        selectOptions,
      );
    }
    return yield* cachedIntervalScan(
      this.primary,
      this.cache,
      this.cachedIntervals,
      this.cachedHashKeys,
      table,
      indexName,
      clauses,
      selectOptions,
    );
  }

  *insert<TTable extends TableDefinition>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ): Generator<DBCmd, void> {
    yield* this.cache.insert(table, records);
    this.enqueuePrimaryWrite(() =>
      execAsync(this.primary.insert(table, records)),
    );
  }

  *update<TTable extends TableDefinition>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ): Generator<DBCmd, void> {
    yield* this.cache.update(table, records);
    this.enqueuePrimaryWrite(() =>
      execAsync(this.primary.update(table, records)),
    );
  }

  *delete<TTable extends TableDefinition>(
    table: TTable,
    ids: string[],
  ): Generator<DBCmd, void> {
    yield* this.cache.delete(table, ids);
    this.enqueuePrimaryWrite(() => execAsync(this.primary.delete(table, ids)));
  }

  *loadTables(tables: TableDefinition<any, any>[]): Generator<DBCmd, void> {
    yield* this.primary.loadTables(tables);
    yield* this.cache.loadTables(tables);
  }

  *beginTx(): Generator<DBCmd, HyperDBTx> {
    const cacheTx = yield* this.cache.beginTx();
    return new CachedDBTx(
      this.primary,
      cacheTx,
      this.cachedIntervals,
      cloneIntervals(this.cachedIntervals),
      this.cachedHashKeys,
      cloneHashKeys(this.cachedHashKeys),
      [],
      (fn) => this.enqueuePrimaryWrite(fn),
    );
  }

  withTraits(...traits: Trait[]): HyperDB {
    return new CachedDB(
      this.primary.withTraits(...traits),
      this.cache.withTraits(...traits),
      this.cachedIntervals,
      this.cachedHashKeys,
    );
  }

  getTraits(): Trait[] {
    return this.primary.getTraits();
  }
}
