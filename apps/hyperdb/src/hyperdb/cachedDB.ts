/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  type HyperDB,
  type HyperDBTx,
  type WhereClause,
  type SelectOptions,
  type Trait,
  type Row,
} from "./db";
import { convertWhereToBound } from "./bounds";
import type { TableDefinition, ExtractSchema, ExtractIndexes } from "./table";
import type { DBCmd } from "./generators";
import { unwrapCb } from "./generators.ts";

export type AfterScanCallback = (
  db: HyperDB,
  table: TableDefinition,
  indexName: string,
  clauses: WhereClause[],
  selectOptions: SelectOptions | undefined,
  results: Row[],
) => Generator<DBCmd, void>;

import {
  type NormalizedInterval,
  tupleScanToNormalized,
  mergeInterval,
  isFullyCoveredByAny,
  recordToTuple,
} from "./intervals";
import { compareTuple as compareTuples } from "./drivers/tuple";
import AwaitLock from "await-lock";

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
    return yield* primary.intervalScan(
      table,
      indexName,
      clauses,
      selectOptions,
    );
  }

  const hashKeyStr = String(eqVal);
  const cachedKeys = cachedHashKeys.get(key);

  if (cachedKeys?.has(hashKeyStr)) {
    // Key is cached — serve from cache
    return yield* cache.intervalScan(table, indexName, clauses, selectOptions);
  }

  // Query primary
  const results = yield* primary.intervalScan(
    table,
    indexName,
    clauses,
    selectOptions,
  );
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

  // Fast containment check: are all requested intervals fully covered?
  const fullyCovered = requestedIntervals.every((req) =>
    isFullyCoveredByAny(cached, req),
  );

  if (fullyCovered) {
    // Fully covered — serve from cache
    const results = yield* cache.intervalScan(
      table,
      indexName,
      clauses,
      selectOptions,
    );
    // Populate hash key caches from returned results
    if (results.length > 0) {
      populateHashKeysFromRecords(table, results as Row[], cachedHashKeys);
    }
    return results;
  }

  // When a limit is set, the cache may already have enough rows to satisfy
  // the query even if the tail of the range is uncovered. Check this before
  // hitting primary.
  if (selectOptions?.limit != null) {
    const cacheResults = yield* cache.intervalScan(
      table,
      indexName,
      clauses,
      selectOptions,
    );
    if (cacheResults.length >= selectOptions.limit) {
      const lastRow = cacheResults[cacheResults.length - 1] as Row;
      const lastResultTuple = recordToTuple(lastRow, indexCols);
      // Check if all results fall within cached intervals
      // (i.e. no gap could produce earlier rows)
      const lastResultInterval: NormalizedInterval = {
        lower: requestedIntervals[0].lower,
        lowerInclusive: requestedIntervals[0].lowerInclusive,
        upper: lastResultTuple,
        upperInclusive: true,
      };
      if (isFullyCoveredByAny(cached, lastResultInterval)) {
        populateHashKeysFromRecords(
          table,
          cacheResults as Row[],
          cachedHashKeys,
        );
        return cacheResults;
      }
    }
  }

  // Not fully cached — fetch the entire requested range from primary
  const results: ExtractSchema<TTable>[] = yield* primary.intervalScan(
    table,
    indexName,
    clauses,
    selectOptions,
  );

  if (results.length > 0) {
    // Use update (delete+insert) to avoid duplicates — cache may already
    // have some of these records from deferred writes
    yield* cache.update(table, results);

    // Populate hash key caches for all hash indexes on this table
    populateHashKeysFromRecords(table, results as Row[], cachedHashKeys);
  }

  // Determine whether we fetched everything or hit the limit
  const hasLimit = selectOptions?.limit != null;
  const gotFullResults = !hasLimit || results.length < selectOptions!.limit!;

  // Merge requested intervals into the cached set
  let current = cached;
  if (gotFullResults) {
    // Full fetch — mark entire requested intervals as cached
    for (const interval of requestedIntervals) {
      current = mergeInterval(current, interval);
    }
  } else if (results.length > 0) {
    // Partial fetch — only mark as cached up to the last returned row
    const lastRow = results[results.length - 1] as Row;
    const lastTuple = recordToTuple(lastRow, indexCols);

    for (const interval of requestedIntervals) {
      const cmpLower = compareTuples(interval.lower, lastTuple);
      if (cmpLower > 0) break; // interval starts after last result

      const cmpUpper = compareTuples(interval.upper, lastTuple);
      if (cmpUpper <= 0) {
        // Fully within fetched range — merge entire interval
        current = mergeInterval(current, interval);
      } else {
        // Partially covered — merge up to lastTuple
        current = mergeInterval(current, {
          lower: interval.lower,
          lowerInclusive: interval.lowerInclusive,
          upper: lastTuple,
          upperInclusive: true,
        });
        break;
      }
    }
  }
  cachedIntervals.set(key, current);

  // Re-query cache for final results — cache has both primary data
  // and any locally-written but not-yet-persisted records
  return yield* cache.intervalScan(table, indexName, clauses, selectOptions);
}

/**
 * Synchronous check: is the requested btree interval fully covered by cache?
 */
function isIntervalFullyCached(
  cachedIntervals: Map<string, NormalizedInterval[]>,
  table: TableDefinition,
  indexName: string,
  clauses: WhereClause[],
): boolean {
  const indexConfig = table.indexes[indexName as string];
  if (!indexConfig) return false;

  const baseCols = indexConfig.cols as string[];
  const indexCols =
    baseCols[baseCols.length - 1] !== "id" ? [...baseCols, "id"] : baseCols;
  const indexColCount = indexCols.length;
  const key = `${table.tableName}:${indexName as string}`;

  const tupleBounds = convertWhereToBound(baseCols, clauses);
  const requestedIntervals = tupleBounds.map((b) =>
    tupleScanToNormalized(b, indexColCount),
  );

  const cached = cachedIntervals.get(key) ?? [];
  return requestedIntervals.every((req) => isFullyCoveredByAny(cached, req));
}

/**
 * Synchronous check: is the requested hash key already cached?
 */
function isHashFullyCached(
  cachedHashKeys: Map<string, Set<string>>,
  table: TableDefinition,
  indexName: string,
  clauses: WhereClause[],
): boolean {
  const key = `${table.tableName}:${indexName as string}`;
  const eqVal = clauses[0]?.eq?.[0]?.val;
  if (eqVal === undefined) return false;
  const cachedKeys = cachedHashKeys.get(key);
  return cachedKeys?.has(String(eqVal)) ?? false;
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
  private traits: Trait[];
  private isOutermost: boolean;
  private cachedDB: CachedDB;
  private afterScanSubscribers: AfterScanCallback[];
  private onFinish: () => void;
  private queryLock = new AwaitLock();

  constructor(
    primaryDB: HyperDB,
    cacheTx: HyperDBTx,
    parentIntervals: Map<string, NormalizedInterval[]>,
    txIntervals: Map<string, NormalizedInterval[]>,
    parentHashKeys: Map<string, Set<string>>,
    txHashKeys: Map<string, Set<string>>,
    traits: Trait[] = [],
    isOutermost = true,
    cachedDB?: CachedDB,
    afterScanSubscribers: AfterScanCallback[] = [],
    onFinish: () => void = () => {},
  ) {
    this.primaryDB = primaryDB;
    this.cacheTx = cacheTx;
    this.parentIntervals = parentIntervals;
    this.txIntervals = txIntervals;
    this.parentHashKeys = parentHashKeys;
    this.txHashKeys = txHashKeys;
    this.traits = traits;
    this.isOutermost = isOutermost;
    this.cachedDB = cachedDB!;
    this.afterScanSubscribers = afterScanSubscribers;
    this.onFinish = onFinish;
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
    // yield* unwrapCb(async () => {
    //   await this.queryLock.acquireAsync();
    // });

    // try {
    const indexConfig = table.indexes[indexName as string];
    let results: ExtractSchema<TTable>[];
    if (indexConfig?.type === "hash") {
      results = yield* cachedHashScan(
        this.primaryDB,
        this.cacheTx,
        this.txHashKeys,
        table,
        indexName,
        clauses,
        selectOptions,
      );
    } else {
      results = yield* cachedIntervalScan(
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

    for (const cb of this.afterScanSubscribers) {
      yield* cb(
        this,
        table,
        indexName as string,
        clauses,
        selectOptions,
        results as Row[],
      );
    }

    return results;
    // } finally {
    //   this.queryLock.release();
    // }
  }

  *insert<TTable extends TableDefinition>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ): Generator<DBCmd, void> {
    // yield* unwrapCb(async () => {
    //   await this.queryLock.acquireAsync();
    // });

    // try {
    yield* this.cacheTx.insert(table, records);
    // } finally {
    //   this.queryLock.release();
    // }
  }

  *update<TTable extends TableDefinition>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ): Generator<DBCmd, void> {
    // yield* unwrapCb(async () => {
    //   await this.queryLock.acquireAsync();
    // });

    // try {
    yield* this.cacheTx.update(table, records);
    // } finally {
    //   this.queryLock.release();
    // }
  }

  *delete<TTable extends TableDefinition>(
    table: TTable,
    ids: string[],
  ): Generator<DBCmd, void> {
    // yield* unwrapCb(async () => {
    //   await this.queryLock.acquireAsync();
    // });

    // try {
    yield* this.cacheTx.delete(table, ids);
    // } finally {
    //   this.queryLock.release();
    // }
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
      this.traits,
      false,
      this.cachedDB,
      this.afterScanSubscribers,
      () => {},
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
    }

    this.onFinish();
  }

  *rollback(): Generator<DBCmd, void> {
    yield* this.cacheTx.rollback();
    this.onFinish();
  }

  withTraits(...traits: Trait[]): HyperDBTx {
    return new CachedDBTx(
      this.primaryDB,
      this.cacheTx.withTraits(...traits) as HyperDBTx,
      this.parentIntervals,
      this.txIntervals,
      this.parentHashKeys,
      this.txHashKeys,
      [...this.traits, ...traits],
      this.isOutermost,
      this.cachedDB,
      this.afterScanSubscribers,
      this.onFinish,
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
  private indexLocks: Map<string, AwaitLock>;
  afterScanSubscribers: AfterScanCallback[] = [];

  constructor(
    primary: HyperDB,
    cache: HyperDB,
    cachedIntervals?: Map<string, NormalizedInterval[]>,
    cachedHashKeys?: Map<string, Set<string>>,
    afterScanSubscribers?: AfterScanCallback[],
    indexLocks?: Map<string, AwaitLock>,
  ) {
    this.primary = primary;
    this.cache = cache;
    this.cachedIntervals = cachedIntervals ?? new Map();
    this.cachedHashKeys = cachedHashKeys ?? new Map();
    this.indexLocks = indexLocks ?? new Map();
    if (afterScanSubscribers) {
      this.afterScanSubscribers = afterScanSubscribers;
    }
  }

  private getIndexLock(key: string): AwaitLock {
    let lock = this.indexLocks.get(key);
    if (!lock) {
      lock = new AwaitLock();
      this.indexLocks.set(key, lock);
    }
    return lock;
  }

  private isFullyCached(
    table: TableDefinition,
    indexName: string,
    clauses: WhereClause[],
  ): boolean {
    const indexConfig = table.indexes[indexName as string];
    if (!indexConfig) return false;

    if (indexConfig.type === "hash") {
      return isHashFullyCached(this.cachedHashKeys, table, indexName, clauses);
    }
    return isIntervalFullyCached(
      this.cachedIntervals,
      table,
      indexName,
      clauses,
    );
  }

  afterScan(cb: AfterScanCallback): () => void {
    this.afterScanSubscribers.push(cb);

    return () => {
      this.afterScanSubscribers = this.afterScanSubscribers.filter(
        (s) => s !== cb,
      );
    };
  }

  private *runScanWithCallbacks<
    TTable extends TableDefinition,
    K extends keyof ExtractIndexes<TTable>,
  >(
    table: TTable,
    indexName: K,
    clauses: WhereClause[],
    selectOptions?: SelectOptions,
  ): Generator<DBCmd, ExtractSchema<TTable>[]> {
    const indexConfig = table.indexes[indexName as string];
    let results: ExtractSchema<TTable>[];
    if (indexConfig?.type === "hash") {
      results = yield* cachedHashScan(
        this.primary,
        this.cache,
        this.cachedHashKeys,
        table,
        indexName,
        clauses,
        selectOptions,
      );
    } else {
      results = yield* cachedIntervalScan(
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

    for (const cb of this.afterScanSubscribers) {
      yield* cb(
        this,
        table,
        indexName as string,
        clauses,
        selectOptions,
        results as Row[],
      );
    }

    return results;
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
    // Fast path: if fully cached, serve without acquiring lock
    if (this.isFullyCached(table, indexName as string, clauses)) {
      return yield* this.runScanWithCallbacks(
        table,
        indexName,
        clauses,
        selectOptions,
      );
    }

    // Cache miss: acquire per-index lock
    const lockKey = `${table.tableName}:${indexName as string}`;
    const indexLock = this.getIndexLock(lockKey);
    const wasContended = indexLock.acquired;
    yield* unwrapCb(async () => {
      await indexLock.acquireAsync();
    });

    // If lock was contended, someone else likely populated the cache — re-check
    if (
      wasContended &&
      this.isFullyCached(table, indexName as string, clauses)
    ) {
      indexLock.release();
      return yield* this.runScanWithCallbacks(
        table,
        indexName,
        clauses,
        selectOptions,
      );
    }

    // Still not cached: query primary under lock
    try {
      return yield* this.runScanWithCallbacks(
        table,
        indexName,
        clauses,
        selectOptions,
      );
    } finally {
      indexLock.release();
    }
  }

  *insert<TTable extends TableDefinition>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ): Generator<DBCmd, void> {
    // yield* unwrapCb(async () => {
    //   await this.lock.acquireAsync();
    // });

    // try {
    yield* this.cache.insert(table, records);
    // } finally {
    //   this.lock.release();
    // }
  }

  *update<TTable extends TableDefinition>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ): Generator<DBCmd, void> {
    // yield* unwrapCb(async () => {
    //   await this.lock.acquireAsync();
    // });

    // try {
    yield* this.cache.update(table, records);
    // } finally {
    //   this.lock.release();
    // }
  }

  *delete<TTable extends TableDefinition>(
    table: TTable,
    ids: string[],
  ): Generator<DBCmd, void> {
    // yield* unwrapCb(async () => {
    //   await this.lock.acquireAsync();
    // });

    // try {
    yield* this.cache.delete(table, ids);
    // } finally {
    //   this.lock.release();
    // }
  }

  *loadTables(tables: TableDefinition<any, any>[]): Generator<DBCmd, void> {
    // yield* unwrapCb(async () => {
    //   await this.lock.acquireAsync();
    // });

    // try {
    yield* this.primary.loadTables(tables);
    yield* this.cache.loadTables(tables);
    // } finally {
    //   this.lock.release();
    // }
  }

  *beginTx(): Generator<DBCmd, HyperDBTx> {
    // yield* unwrapCb(async () => {
    //   await this.lock.acquireAsync();
    // });

    const cacheTx = yield* this.cache.beginTx();
    return new CachedDBTx(
      this.primary,
      cacheTx,
      this.cachedIntervals,
      cloneIntervals(this.cachedIntervals),
      this.cachedHashKeys,
      cloneHashKeys(this.cachedHashKeys),
      [],
      true,
      this,
      this.afterScanSubscribers,
      () => {
        // this.lock.release();
      },
    );
  }

  withTraits(...traits: Trait[]): HyperDB {
    return new CachedDB(
      this.primary.withTraits(...traits),
      this.cache.withTraits(...traits),
      this.cachedIntervals,
      this.cachedHashKeys,
      this.afterScanSubscribers,
      this.indexLocks,
    );
  }

  getTraits(): Trait[] {
    return this.primary.getTraits();
  }
}
