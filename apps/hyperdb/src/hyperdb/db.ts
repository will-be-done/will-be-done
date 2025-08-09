import { convertWhereToBound } from "./bounds";
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
  ): Generator<ExtractSchema<TTable>>;
  insert<TTable extends TableDefinition>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ): void;
  update<TTable extends TableDefinition>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ): void;
  delete<TTable extends TableDefinition>(table: TTable, ids: string[]): void;
}

export interface HyperDBTx extends BaseDBOperations {
  commit(): void;
  rollback(): void;
}

export interface HyperDB extends BaseDBOperations {
  beginTx(): HyperDBTx;
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
  ): Generator<unknown> | Generator<Promise<unknown>>;
  insert(tableName: string, values: Row[]): void;
  update(tableName: string, values: Row[]): void;
  delete(tableName: string, values: string[]): void;
};

export interface DBDriver extends BaseDBDriverOperations {
  loadTables(table: TableDefinition<any, any>[]): void;
  beginTx(): DBDriverTX;
}

export interface DBDriverTX extends BaseDBDriverOperations {
  commit(): void;
  rollback(): void;
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
    return;
  }

  const indexConfig = table.indexes[indexName as string];
  if (!indexConfig) {
    throw new Error(
      `Index not found: ${indexName as string} for table: ${table.tableName}`,
    );
  }

  // Just for validation
  convertWhereToBound(indexConfig.cols as string[], clauses);

  for (const data of driver.intervalScan(
    table.tableName,
    indexName as string,
    clauses,
    selectOptions || {},
  )) {
    if (data instanceof Promise) {
      throw new Error("async scan not supported");
    }

    yield data as Row;
  }
}

function performInsert(
  driver: BaseDBDriverOperations,
  table: TableDefinition,
  records: Row[],
) {
  if (records.length === 0) return;
  driver.insert(table.tableName, records);
}

function performUpdate(
  driver: BaseDBDriverOperations,
  table: TableDefinition,
  records: Row[],
) {
  driver.update(table.tableName, records);
}

function performDelete(
  driver: BaseDBDriverOperations,
  table: TableDefinition,
  ids: string[],
) {
  driver.delete(table.tableName, ids);
}

export class DBTx implements HyperDBTx {
  driver: DBDriverTX;
  originalDB: DB;
  isFinished = false;

  constructor(originalDB: DB, driverTx: DBDriverTX) {
    this.originalDB = originalDB;
    this.driver = driverTx;
  }

  commit(): void {
    this.isFinished = true;
    this.driver.commit();
  }

  rollback(): void {
    this.isFinished = true;
    this.driver.rollback();
  }

  *intervalScan<
    TTable extends TableDefinition,
    K extends keyof ExtractIndexes<TTable>,
  >(
    table: TTable,
    indexName: K,
    clauses: WhereClause[],
    selectOptions?: SelectOptions,
  ): Generator<ExtractSchema<TTable>> {
    for (const data of performScan(
      this.driver,
      table,
      indexName as string,
      clauses,
      selectOptions,
    )) {
      yield data as ExtractSchema<TTable>;
    }
  }

  insert<TTable extends TableDefinition>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ): void {
    if (this.isFinished) {
      throw new Error("Transaction is finished");
    }

    performInsert(this.driver, table, records);
  }

  update<TTable extends TableDefinition>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ): void {
    if (this.isFinished) {
      throw new Error("Transaction is finished");
    }

    performUpdate(this.driver, table, records);
  }

  delete<TTable extends TableDefinition>(table: TTable, ids: string[]): void {
    if (this.isFinished) {
      throw new Error("Transaction is finished");
    }

    performDelete(this.driver, table, ids);
  }
}

export class DB implements HyperDB {
  driver: DBDriver;
  tables: TableDefinition<any, any>[];

  constructor(driver: DBDriver, tables: TableDefinition<any, any>[]) {
    driver.loadTables(tables);
    this.driver = driver;
    this.tables = tables;
  }

  beginTx(): DBTx {
    const tx = this.driver.beginTx();
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
  ): Generator<ExtractSchema<TTable>> {
    for (const data of performScan(
      this.driver,
      table,
      indexName as string,
      clauses,
      selectOptions,
    )) {
      yield data as ExtractSchema<TTable>;
    }
  }

  insert<TTable extends TableDefinition<any, any>>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ) {
    performInsert(this.driver, table, records);
  }

  update<TTable extends TableDefinition<any, any>>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ) {
    performUpdate(this.driver, table, records);
  }

  delete<TTable extends TableDefinition<any, any>>(
    table: TTable,
    ids: string[],
  ) {
    performDelete(this.driver, table, ids);
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
