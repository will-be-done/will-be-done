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
import { compareTuple as compareTuples } from "./drivers/tuple";
import {
  type NormalizedInterval,
  tupleScanToNormalized,
  isFullyCovered,
  mergeInterval,
  recordToTuple,
} from "./intervals";

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
    baseCols[baseCols.length - 1] !== "id"
      ? [...baseCols, "id"]
      : baseCols;
  const indexColCount = indexCols.length;
  const key = `${table.tableName}:${indexName as string}`;

  const tupleBounds = convertWhereToBound(baseCols, clauses);
  const requestedIntervals = tupleBounds.map((b) =>
    tupleScanToNormalized(b, indexColCount),
  );

  const cached = cachedIntervals.get(key) ?? [];

  if (isFullyCovered(cached, requestedIntervals)) {
    return yield* cache.intervalScan(
      table,
      indexName,
      clauses,
      selectOptions,
    );
  }

  const results: ExtractSchema<TTable>[] = yield* primary.intervalScan(
    table,
    indexName,
    clauses,
    selectOptions,
  );

  if (results.length > 0) {
    yield* cache.insert(table, results);
  }

  let intervalsToMerge: NormalizedInterval[];

  if (selectOptions?.limit && results.length > 0) {
    const lastRecord = results[results.length - 1] as Row;
    const lastTuple = recordToTuple(lastRecord, indexCols);

    intervalsToMerge = requestedIntervals.map((interval) => {
      const cmp = compareTuples(lastTuple, interval.upper);
      if (cmp < 0 || (cmp === 0 && !interval.upperInclusive)) {
        return {
          lower: interval.lower,
          upper: lastTuple,
          lowerInclusive: interval.lowerInclusive,
          upperInclusive: true,
        };
      }
      return interval;
    });
  } else {
    intervalsToMerge = requestedIntervals;
  }

  let current = cached;
  for (const interval of intervalsToMerge) {
    current = mergeInterval(current, interval);
  }
  cachedIntervals.set(key, current);

  return results;
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

class CachedDBTx implements HyperDBTx {
  private primaryTx: HyperDBTx;
  private cacheTx: HyperDBTx;
  private parentIntervals: Map<string, NormalizedInterval[]>;
  private txIntervals: Map<string, NormalizedInterval[]>;
  private traits: Trait[];
  private isOutermost: boolean;

  constructor(
    primaryTx: HyperDBTx,
    cacheTx: HyperDBTx,
    parentIntervals: Map<string, NormalizedInterval[]>,
    txIntervals: Map<string, NormalizedInterval[]>,
    traits: Trait[] = [],
    isOutermost = true,
  ) {
    this.primaryTx = primaryTx;
    this.cacheTx = cacheTx;
    this.parentIntervals = parentIntervals;
    this.txIntervals = txIntervals;
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
    return yield* cachedIntervalScan(
      this.primaryTx,
      this.cacheTx,
      this.txIntervals,
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
    yield* this.primaryTx.insert(table, records);
    yield* this.cacheTx.insert(table, records);
  }

  *update<TTable extends TableDefinition>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ): Generator<DBCmd, void> {
    yield* this.primaryTx.update(table, records);
    yield* this.cacheTx.update(table, records);
  }

  *delete<TTable extends TableDefinition>(
    table: TTable,
    ids: string[],
  ): Generator<DBCmd, void> {
    yield* this.primaryTx.delete(table, ids);
    yield* this.cacheTx.delete(table, ids);
  }

  *loadTables(): Generator<DBCmd, void> {
    throw new Error("Not supported");
  }

  *beginTx(): Generator<DBCmd, HyperDBTx> {
    const nestedPrimaryTx = yield* this.primaryTx.beginTx();
    const nestedCacheTx = yield* this.cacheTx.beginTx();
    return new CachedDBTx(
      nestedPrimaryTx,
      nestedCacheTx,
      this.parentIntervals,
      this.txIntervals,
      this.traits,
      false,
    );
  }

  *commit(): Generator<DBCmd, void> {
    yield* this.primaryTx.commit();
    yield* this.cacheTx.commit();

    // On outermost commit, propagate tx intervals back to parent
    if (this.isOutermost) {
      for (const [key, value] of this.txIntervals) {
        this.parentIntervals.set(key, value);
      }
    }
  }

  *rollback(): Generator<DBCmd, void> {
    yield* this.primaryTx.rollback();
    yield* this.cacheTx.rollback();
    // txIntervals are discarded — parent intervals remain unchanged
  }

  withTraits(...traits: Trait[]): HyperDBTx {
    return new CachedDBTx(
      this.primaryTx.withTraits(...traits) as HyperDBTx,
      this.cacheTx.withTraits(...traits) as HyperDBTx,
      this.parentIntervals,
      this.txIntervals,
      [...this.traits, ...traits],
      this.isOutermost,
    );
  }

  getTraits(): Trait[] {
    return this.primaryTx.getTraits();
  }
}

export class CachedDB implements HyperDB {
  private primary: HyperDB;
  private cache: HyperDB;
  private cachedIntervals: Map<string, NormalizedInterval[]>;

  constructor(
    primary: HyperDB,
    cache: HyperDB,
    cachedIntervals?: Map<string, NormalizedInterval[]>,
  ) {
    this.primary = primary;
    this.cache = cache;
    this.cachedIntervals = cachedIntervals ?? new Map();
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
    return yield* cachedIntervalScan(
      this.primary,
      this.cache,
      this.cachedIntervals,
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
    yield* this.primary.insert(table, records);
    yield* this.cache.insert(table, records);
  }

  *update<TTable extends TableDefinition>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ): Generator<DBCmd, void> {
    yield* this.primary.update(table, records);
    yield* this.cache.update(table, records);
  }

  *delete<TTable extends TableDefinition>(
    table: TTable,
    ids: string[],
  ): Generator<DBCmd, void> {
    yield* this.primary.delete(table, ids);
    yield* this.cache.delete(table, ids);
  }

  *loadTables(tables: TableDefinition<any, any>[]): Generator<DBCmd, void> {
    yield* this.primary.loadTables(tables);
    yield* this.cache.loadTables(tables);
  }

  *beginTx(): Generator<DBCmd, HyperDBTx> {
    const primaryTx = yield* this.primary.beginTx();
    const cacheTx = yield* this.cache.beginTx();
    return new CachedDBTx(
      primaryTx,
      cacheTx,
      this.cachedIntervals,
      cloneIntervals(this.cachedIntervals),
    );
  }

  withTraits(...traits: Trait[]): HyperDB {
    return new CachedDB(
      this.primary.withTraits(...traits),
      this.cache.withTraits(...traits),
      this.cachedIntervals,
    );
  }

  getTraits(): Trait[] {
    return this.primary.getTraits();
  }
}
