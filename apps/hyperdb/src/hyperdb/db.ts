import { convertWhereToBound } from "./bounds";
import { isNoopCmd, isUnwrapCmd, type DBCmd } from "./generators";
import type { ExtractIndexes, ExtractSchema, TableDefinition } from "./table";

export type WhereClause = {
  lt?: { col: string; val: Value }[];
  lte?: { col: string; val: Value }[];
  gt?: { col: string; val: Value }[];
  gte?: { col: string; val: Value }[];
  eq?: { col: string; val: Value }[];
};

export interface BaseDBOperations {
  intervalScan<
    TTable extends TableDefinition,
    K extends keyof ExtractIndexes<TTable>,
  >(
    table: TTable,
    indexName: K,
    clauses: WhereClause[],
    selectOptions?: SelectOptions,
  ): Generator<DBCmd, ExtractSchema<TTable>[]>;
  insert<TTable extends TableDefinition>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ): Generator<DBCmd, void>;
  update<TTable extends TableDefinition>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ): Generator<DBCmd, void>;
  delete<TTable extends TableDefinition>(
    table: TTable,
    ids: string[],
  ): Generator<DBCmd, void>;
}

export interface HyperDBTx extends BaseDBOperations {
  commit(): Generator<DBCmd, void>;
  rollback(): Generator<DBCmd, void>;
}

export interface HyperDB extends BaseDBOperations {
  beginTx(): Generator<DBCmd, HyperDBTx>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  loadTables(tables: TableDefinition<any, any>[]): Generator<DBCmd, void>;
}

export type Value = string | number | boolean | null;
export type ScanValue = Value | typeof MIN | typeof MAX;
export type Tuple = ScanValue[];
export type TupleScanOptions = {
  lte?: Tuple;
  gte?: Tuple;
  lt?: Tuple;
  gt?: Tuple;
};

export type SelectOptions = {
  limit?: number;
};

export const MIN = Symbol("MIN");
export const MAX = Symbol("MAX");

/* eslint-disable @typescript-eslint/no-explicit-any */
// Base schema type that all table records must extend
export type Row = Record<string, string | number | boolean | null> & {
  id: string;
};

type BaseDBDriverOperations = {
  intervalScan(
    table: string,
    indexName: string,
    clauses: WhereClause[],
    selectOptions: SelectOptions,
  ): Generator<DBCmd, unknown[]>;
  insert(tableName: string, values: Row[]): Generator<DBCmd>;
  update(tableName: string, values: Row[]): Generator<DBCmd>;
  delete(tableName: string, values: string[]): Generator<DBCmd>;
};

export interface DBDriver extends BaseDBDriverOperations {
  loadTables(table: TableDefinition<any, any>[]): Generator<DBCmd>;
  beginTx(): Generator<DBCmd, DBDriverTX>;
}

export interface DBDriverTX extends BaseDBDriverOperations {
  commit(): Generator<DBCmd>;
  rollback(): Generator<DBCmd>;
}

function* performScan(
  driver: BaseDBDriverOperations,
  table: TableDefinition,
  indexName: string,
  clauses: WhereClause[],
  selectOptions?: SelectOptions,
) {
  if (clauses.length === 0) {
    throw new Error("scan clauses must be provided");
  }
  if (selectOptions && selectOptions.limit === 0) {
    return [];
  }

  const indexConfig = table.indexes[indexName as string];
  if (!indexConfig) {
    throw new Error(
      `Index not found: ${indexName as string} for table: ${table.tableName}`,
    );
  }

  // Just for validation
  convertWhereToBound(indexConfig.cols as string[], clauses);

  return yield* driver.intervalScan(
    table.tableName,
    indexName as string,
    clauses,
    selectOptions || {},
  );
}

function* performInsert(
  driver: BaseDBDriverOperations,
  table: TableDefinition,
  records: Row[],
) {
  if (records.length === 0) return;
  yield* driver.insert(table.tableName, records);
}

function* performUpdate(
  driver: BaseDBDriverOperations,
  table: TableDefinition,
  records: Row[],
) {
  yield* driver.update(table.tableName, records);
}

function* performDelete(
  driver: BaseDBDriverOperations,
  table: TableDefinition,
  ids: string[],
) {
  yield* driver.delete(table.tableName, ids);
}

export class DBTx implements HyperDBTx {
  driver: DBDriverTX;
  originalDB: DB;
  isFinished = false;

  constructor(originalDB: DB, driverTx: DBDriverTX) {
    this.originalDB = originalDB;
    this.driver = driverTx;
  }

  *commit(): Generator<DBCmd> {
    this.isFinished = true;
    yield* this.driver.commit();
  }

  *rollback(): Generator<DBCmd> {
    this.isFinished = true;
    yield* this.driver.rollback();
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
    return yield* performScan(
      this.driver,
      table,
      indexName as string,
      clauses,
      selectOptions,
    ) as Generator<DBCmd, ExtractSchema<TTable>[]>;
  }

  *insert<TTable extends TableDefinition>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ): Generator<DBCmd> {
    if (this.isFinished) {
      throw new Error("Transaction is finished");
    }

    yield* performInsert(this.driver, table, records);
  }

  *update<TTable extends TableDefinition>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ): Generator<DBCmd> {
    if (this.isFinished) {
      throw new Error("Transaction is finished");
    }

    yield* performUpdate(this.driver, table, records);
  }

  *delete<TTable extends TableDefinition>(
    table: TTable,
    ids: string[],
  ): Generator<DBCmd> {
    if (this.isFinished) {
      throw new Error("Transaction is finished");
    }

    yield* performDelete(this.driver, table, ids);
  }
}

export class DB implements HyperDB {
  driver: DBDriver;
  tables!: TableDefinition<any, any>[];

  constructor(driver: DBDriver) {
    this.driver = driver;
  }

  *loadTables(tables: TableDefinition<any, any>[]): Generator<DBCmd, void> {
    this.tables = tables;
    yield* this.driver.loadTables(tables);
  }

  *beginTx(): Generator<DBCmd, DBTx> {
    const tx = yield* this.driver.beginTx();
    return new DBTx(this, tx);
  }

  *intervalScan<
    TTable extends TableDefinition<any, any>,
    K extends keyof ExtractIndexes<TTable>,
  >(
    table: TTable,
    indexName: K,
    clauses: WhereClause[],
    selectOptions?: SelectOptions,
  ): Generator<DBCmd, ExtractSchema<TTable>[]> {
    return yield* performScan(
      this.driver,
      table,
      indexName as string,
      clauses,
      selectOptions,
    ) as Generator<DBCmd, ExtractSchema<TTable>[]>;
  }

  *insert<TTable extends TableDefinition<any, any>>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ) {
    yield* performInsert(this.driver, table, records);
  }

  *update<TTable extends TableDefinition<any, any>>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ) {
    yield* performUpdate(this.driver, table, records);
  }

  *delete<TTable extends TableDefinition<any, any>>(
    table: TTable,
    ids: string[],
  ) {
    yield* performDelete(this.driver, table, ids);
  }
}

export function execSync<T>(cmd: Generator<DBCmd, T>): T {
  let result = cmd.next();

  while (!result.done) {
    if (isUnwrapCmd(result.value)) {
      throw new Error("Cannot execute async commands");
    } else if (isNoopCmd(result.value)) {
      result = cmd.next();
    }
  }

  return result.value as T;
}

export async function execAsync<T>(cmd: Generator<DBCmd, T>): Promise<T> {
  let result = cmd.next();

  while (!result.done) {
    if (isUnwrapCmd(result.value)) {
      result = cmd.next(await result.value.data);
    } else if (isNoopCmd(result.value)) {
      result = cmd.next();
    }
  }

  return result.value as T;
}

export class SyncDBTx {
  private dbTx: HyperDBTx;
  constructor(dbTx: HyperDBTx) {
    this.dbTx = dbTx;
  }

  intervalScan<
    TTable extends TableDefinition,
    K extends keyof ExtractIndexes<TTable>,
  >(
    table: TTable,
    indexName: K,
    clauses: WhereClause[],
    selectOptions?: SelectOptions,
  ): ExtractSchema<TTable>[] {
    return execSync(
      this.dbTx.intervalScan(table, indexName, clauses, selectOptions),
    );
  }

  insert<TTable extends TableDefinition>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ): void {
    return execSync(this.dbTx.insert(table, records));
  }

  update<TTable extends TableDefinition>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ): void {
    return execSync(this.dbTx.update(table, records));
  }

  delete<TTable extends TableDefinition>(table: TTable, ids: string[]): void {
    return execSync(this.dbTx.delete(table, ids));
  }

  commit(): void {
    return execSync(this.dbTx.commit());
  }

  rollback(): void {
    return execSync(this.dbTx.rollback());
  }
}

export class SyncDB {
  private db: HyperDB;

  constructor(db: HyperDB) {
    this.db = db;
  }

  loadTables(tables: TableDefinition<any, any>[]): void {
    return execSync(this.db.loadTables(tables));
  }

  beginTx(): SyncDBTx {
    const tx = execSync(this.db.beginTx());
    return new SyncDBTx(tx);
  }

  intervalScan<
    TTable extends TableDefinition,
    K extends keyof ExtractIndexes<TTable>,
  >(
    table: TTable,
    indexName: K,
    clauses: WhereClause[],
    selectOptions?: SelectOptions,
  ): ExtractSchema<TTable>[] {
    return execSync(
      this.db.intervalScan(table, indexName, clauses, selectOptions),
    );
  }

  insert<TTable extends TableDefinition<any, any>>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ): void {
    return execSync(this.db.insert(table, records));
  }

  update<TTable extends TableDefinition<any, any>>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ): void {
    return execSync(this.db.update(table, records));
  }

  delete<TTable extends TableDefinition<any, any>>(
    table: TTable,
    ids: string[],
  ): void {
    return execSync(this.db.delete(table, ids));
  }
}

// TODO:
// 0. DONE test asyncScan
// 1. DONE update, delete support
// 2. DONE generator based selector + ability to subscribe to selector
// 3. DONE hash type index
// 3. tx support
// 4. DONE separate by files
// 5. ONLY ON THE END: fix index typing issue
