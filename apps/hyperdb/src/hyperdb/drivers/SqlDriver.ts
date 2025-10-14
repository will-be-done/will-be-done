/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  DBDriver,
  Row,
  SelectOptions,
  WhereClause,
  DBDriverTX,
} from "../db.ts";
import { cloneDeep } from "es-toolkit";
import type { TableDefinition } from "../table.ts";
import type { DBCmd } from "../generators.ts";
import {
  buildWhereClause,
  buildOrderClause,
  buildSelectSQL,
  buildInsertSQL,
  buildDeleteSQL,
  createTableSQL,
  createIndexSQL,
  chunkArray,
  CHUNK_SIZE,
  type SqlValue,
  type BindParams,
} from "./SqliteCommon.ts";

export interface SQLStatement {
  values(values: SqlValue[]): SqlValue[][];
  // all(params?: BindParams): QueryExecResult[];
  // bind(values?: BindParams): boolean;
  // get(params?: BindParams): SqlValue[];
  // step(): boolean;
  finalize(): void;
}
interface SQLiteDB {
  exec(sql: string, params?: BindParams): void;
  prepare(sql: string): SQLStatement;
}

function performInsertOperation(
  db: SQLiteDB,
  tableName: string,
  values: Record<string, unknown>[],
): void {
  if (values.length === 0) return;

  const allValues = chunkArray(values, CHUNK_SIZE);
  for (const chunk of allValues) {
    const insertSQL = buildInsertSQL(tableName, chunk.length);

    db.exec(
      insertSQL,
      // @ts-expect-error it's ok
      chunk.flatMap((v) => [v.id, JSON.stringify(v)]),
    );
  }
}

function performUpdateOperation(
  db: SQLiteDB,
  tableName: string,
  values: Row[],
): void {
  if (values.length === 0) return;

  const allValues = chunkArray(values, CHUNK_SIZE);
  for (const chunk of allValues) {
    const updateSQL = buildInsertSQL(tableName, chunk.length);

    db.exec(
      updateSQL,
      chunk.flatMap((v) => [v.id, JSON.stringify(v)]),
    );
  }
}

function performDeleteOperation(
  db: SQLiteDB,
  tableName: string,
  values: string[],
): void {
  if (values.length === 0) return;

  const allValues = chunkArray(values, CHUNK_SIZE);
  for (const chunk of allValues) {
    const deleteSQL = buildDeleteSQL(tableName, chunk.length);
    db.exec(deleteSQL, chunk);
  }
}

function performScanOperation(
  db: SQLiteDB,
  tableDefinitions: Map<string, TableDefinition>,
  table: string,
  indexName: string,
  clauses: WhereClause[],
  selectOptions: SelectOptions,
): unknown[] {
  const { where, params } = buildWhereClause(
    indexName,
    table,
    clauses,
    tableDefinitions,
  );
  const orderClause = buildOrderClause(indexName, table, tableDefinitions);
  const sql = buildSelectSQL(table, where, orderClause, selectOptions);

  const q = db.prepare(sql);

  const result: unknown[] = [];
  try {
    const values = q.values(params);

    for (const row of values) {
      const record = JSON.parse(row[0] as string) as unknown;
      result.push(record);
    }

    // while (q.step()) {
    //   const res = q.get();
    //   const record = JSON.parse(res[0] as string) as unknown;
    //   result.push(record);
    // }
  } catch (error) {
    throw new Error(`Scan failed for index ${indexName}: ${error}`);
  } finally {
    q.finalize();
  }

  return result;
}

class SqlDriverTx implements DBDriverTX {
  private db: SQLiteDB;
  private tableDefinitions: Map<string, TableDefinition>;
  private committed = false;
  private rolledback = false;
  private onFinish: () => void;

  constructor(
    db: SQLiteDB,
    tableDefinitions: Map<string, TableDefinition>,
    onFinish: () => void,
  ) {
    this.db = db;
    this.tableDefinitions = tableDefinitions;
    this.db.exec("BEGIN TRANSACTION");
    this.onFinish = onFinish;
  }

  *commit(): Generator<DBCmd, void> {
    if (this.committed || this.rolledback) {
      throw new Error("Transaction already finished");
    }
    this.db.exec("COMMIT");
    this.committed = true;
    this.onFinish();
  }

  *rollback(): Generator<DBCmd, void> {
    if (this.committed || this.rolledback) {
      throw new Error("Transaction already finished");
    }
    this.db.exec("ROLLBACK");
    this.rolledback = true;
    this.onFinish();
  }

  *insert(
    tableName: string,
    values: Record<string, unknown>[],
  ): Generator<DBCmd, void> {
    if (this.committed || this.rolledback) {
      throw new Error("Transaction already finished");
    }
    performInsertOperation(this.db, tableName, values);
  }

  *update(tableName: string, values: Row[]): Generator<DBCmd, void> {
    if (this.committed || this.rolledback) {
      throw new Error("Transaction already finished");
    }
    performUpdateOperation(this.db, tableName, values);
  }

  *delete(tableName: string, values: string[]): Generator<DBCmd, void> {
    if (this.committed || this.rolledback) {
      throw new Error("Transaction already finished");
    }
    performDeleteOperation(this.db, tableName, values);
  }

  *intervalScan(
    table: string,
    indexName: string,
    clauses: WhereClause[],
    selectOptions: SelectOptions,
  ): Generator<DBCmd, unknown[]> {
    if (this.committed || this.rolledback) {
      throw new Error("Transaction already finished");
    }

    return performScanOperation(
      this.db,
      this.tableDefinitions,
      table,
      indexName,
      clauses,
      selectOptions,
    );
  }
}

export class SqlDriver implements DBDriver {
  private db: SQLiteDB;
  private tableDefinitions = new Map<string, TableDefinition>();
  private isInTransaction = false;

  constructor(db: SQLiteDB) {
    this.db = db;
  }

  *beginTx(): Generator<DBCmd, DBDriverTX> {
    if (this.isInTransaction) {
      throw new Error("can't run while transaction is in progress");
    }

    this.isInTransaction = true;
    return new SqlDriverTx(
      this.db,
      this.tableDefinitions,
      () => (this.isInTransaction = false),
    );
  }

  *insert(
    tableName: string,
    values: Record<string, unknown>[],
  ): Generator<DBCmd, void> {
    if (this.isInTransaction) {
      throw new Error("can't run while transaction is in progress");
    }
    if (values.length === 0) return;

    this.db.exec("BEGIN TRANSACTION");
    performInsertOperation(this.db, tableName, values);
    this.db.exec("COMMIT");
  }

  *update(tableName: string, values: Row[]): Generator<DBCmd, void> {
    if (this.isInTransaction) {
      throw new Error("can't run while transaction is in progress");
    }
    if (values.length === 0) return;

    this.db.exec("BEGIN TRANSACTION");
    performUpdateOperation(this.db, tableName, values);
    this.db.exec("COMMIT");
  }

  *delete(tableName: string, values: string[]): Generator<DBCmd, void> {
    if (this.isInTransaction) {
      throw new Error("can't run while transaction is in progress");
    }
    if (values.length === 0) return;

    this.db.exec("BEGIN TRANSACTION");
    performDeleteOperation(this.db, tableName, values);
    this.db.exec("COMMIT");
  }

  *intervalScan(
    table: string,
    indexName: string,
    clauses: WhereClause[],
    selectOptions: SelectOptions,
  ): Generator<DBCmd, unknown[]> {
    if (this.isInTransaction) {
      throw new Error("can't run while transaction is in progress");
    }

    return performScanOperation(
      this.db,
      this.tableDefinitions,
      table,
      indexName,
      clauses,
      selectOptions,
    );
  }

  *loadTables(
    tableDefinitions: TableDefinition<any>[],
  ): Generator<DBCmd, void> {
    this.db.exec("BEGIN TRANSACTION");
    tableDefinitions = cloneDeep(tableDefinitions);
    for (const tableDef of tableDefinitions) {
      for (const [, indexDef] of Object.entries(tableDef.indexes)) {
        const cols = indexDef.cols;

        if (cols[cols.length - 1] !== "id") {
          cols.push("id");
        }
      }

      this.createTable(tableDef.tableName);
      this.createIndexes(tableDef);
      this.tableDefinitions.set(tableDef.tableName, tableDef);
    }
    this.db.exec("COMMIT");
  }

  private createTable(tableName: string): void {
    // Create main table
    const sql = createTableSQL(tableName);
    console.log(sql);
    this.db.exec(sql);
  }

  private createIndexes(tableDef: TableDefinition<any>): void {
    for (const [indexName, indexDef] of Object.entries(tableDef.indexes)) {
      const cols = indexDef.cols;

      // Only make the id index unique, all others should be non-unique
      const isIdIndex = cols.length === 1 && cols[0] === "id";
      const sql = createIndexSQL(
        tableDef.tableName,
        indexName,
        cols,
        isIdIndex,
      );
      console.log(sql);
      this.db.exec(sql);
    }
  }
}
