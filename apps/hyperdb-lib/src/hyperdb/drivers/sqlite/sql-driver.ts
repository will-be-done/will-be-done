/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  Row,
  SelectOptions,
  WhereClause,
} from "../../core/primitives";
import type { DBDriver, DBDriverTX } from "../../core/driver";
import { cloneDeep } from "es-toolkit";
import type { TableDefinition } from "../../schema/table";
import type { DBCmd } from "../../commands/async";
import {
  buildSortKeyWhereClause,
  buildOrderClause,
  buildSelectSQL,
  buildInsertSQL,
  buildDeleteSQL,
  createTableSQL,
  createIndexSQL,
  addSortKeyColumnSQL,
  chunkArray,
  CHUNK_SIZE,
  sqliteIndexSortKeyColumn,
  assertSafeTableDefinition,
  buildRowInsertParams,
  getSqliteIndexSortKeyValue,
  parseSqliteStoredRow,
  type SqlValue,
  type BindParams,
} from "./sqlite-common";

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
  tableDef: TableDefinition,
  values: Row[],
): void {
  if (values.length === 0) return;

  const allValues = chunkArray(values, CHUNK_SIZE);
  for (const chunk of allValues) {
    const insertSQL = buildInsertSQL(tableDef, chunk.length);

    db.exec(
      insertSQL,
      chunk.flatMap((v) => buildRowInsertParams(tableDef, v)),
    );
  }
}

function performUpsertOperation(
  db: SQLiteDB,
  tableDef: TableDefinition,
  values: Row[],
): void {
  if (values.length === 0) return;

  const allValues = chunkArray(values, CHUNK_SIZE);
  for (const chunk of allValues) {
    const upsertSQL = buildInsertSQL(tableDef, chunk.length, {
      replace: true,
    });

    db.exec(
      upsertSQL,
      chunk.flatMap((v) => buildRowInsertParams(tableDef, v)),
    );
  }
}

function performDeleteOperation(
  db: SQLiteDB,
  tableDef: TableDefinition,
  values: string[],
): void {
  if (values.length === 0) return;

  const allValues = chunkArray(values, CHUNK_SIZE);
  for (const chunk of allValues) {
    const deleteSQL = buildDeleteSQL(tableDef.tableName, chunk.length);
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
  const tableDef = tableDefinitions.get(table);
  if (!tableDef) {
    throw new Error(`Table ${table} not found`);
  }

  const { where, params } = buildSortKeyWhereClause(
    indexName,
    table,
    clauses,
    tableDefinitions,
  );
  const orderClause = buildOrderClause(
    indexName,
    table,
    tableDefinitions,
    selectOptions.order === "desc",
  );
  const sql = buildSelectSQL(table, where, orderClause, selectOptions);
  const q = db.prepare(sql);

  try {
    const values = q.values(params);
    return values.map((row) => parseSqliteStoredRow(row[0] as string));

    // while (q.step()) {
    //   const res = q.get();
    //   const record = parseSqliteStoredRow(res[0] as string);
    //   result.push(record);
    // }
  } catch (error) {
    throw new Error(`Scan failed for index ${indexName}: ${error}`);
  } finally {
    q.finalize();
  }
}

function rollbackQuietly(db: SQLiteDB): void {
  try {
    db.exec("ROLLBACK");
  } catch {
    // Best effort cleanup after a failed statement.
  }
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
    const tableDef = this.tableDefinitions.get(tableName);
    if (!tableDef) throw new Error(`Table ${tableName} not found`);
    performInsertOperation(this.db, tableDef, values as Row[]);
  }

  *upsert(tableName: string, values: Row[]): Generator<DBCmd, void> {
    if (this.committed || this.rolledback) {
      throw new Error("Transaction already finished");
    }
    const tableDef = this.tableDefinitions.get(tableName);
    if (!tableDef) throw new Error(`Table ${tableName} not found`);
    performUpsertOperation(this.db, tableDef, values);
  }

  *delete(tableName: string, values: string[]): Generator<DBCmd, void> {
    if (this.committed || this.rolledback) {
      throw new Error("Transaction already finished");
    }
    const tableDef = this.tableDefinitions.get(tableName);
    if (!tableDef) throw new Error(`Table ${tableName} not found`);
    performDeleteOperation(this.db, tableDef, values);
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
    try {
      const tableDef = this.tableDefinitions.get(tableName);
      if (!tableDef) throw new Error(`Table ${tableName} not found`);
      performInsertOperation(this.db, tableDef, values as Row[]);
      this.db.exec("COMMIT");
    } catch (error) {
      rollbackQuietly(this.db);
      throw error;
    }
  }

  *upsert(tableName: string, values: Row[]): Generator<DBCmd, void> {
    if (this.isInTransaction) {
      throw new Error("can't run while transaction is in progress");
    }
    if (values.length === 0) return;

    this.db.exec("BEGIN TRANSACTION");
    try {
      const tableDef = this.tableDefinitions.get(tableName);
      if (!tableDef) throw new Error(`Table ${tableName} not found`);
      performUpsertOperation(this.db, tableDef, values);
      this.db.exec("COMMIT");
    } catch (error) {
      rollbackQuietly(this.db);
      throw error;
    }
  }

  *delete(tableName: string, values: string[]): Generator<DBCmd, void> {
    if (this.isInTransaction) {
      throw new Error("can't run while transaction is in progress");
    }
    if (values.length === 0) return;

    this.db.exec("BEGIN TRANSACTION");
    try {
      const tableDef = this.tableDefinitions.get(tableName);
      if (!tableDef) throw new Error(`Table ${tableName} not found`);
      performDeleteOperation(this.db, tableDef, values);
      this.db.exec("COMMIT");
    } catch (error) {
      rollbackQuietly(this.db);
      throw error;
    }
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
    for (const tableDef of tableDefinitions) {
      assertSafeTableDefinition(tableDef);
    }

    this.db.exec("BEGIN TRANSACTION");
    try {
      tableDefinitions = cloneDeep(tableDefinitions);
      for (const tableDef of tableDefinitions) {
        for (const [, indexDef] of Object.entries(tableDef.indexes)) {
          if (indexDef.type !== "btree") continue;
          const cols = [...indexDef.cols];

          if (cols[cols.length - 1] !== "id") {
            cols.push("id");
          }
          (indexDef as unknown as { cols: typeof cols }).cols = cols;
        }

        this.createTable(tableDef);
        this.addMissingSortKeyColumns(tableDef);
        this.backfillSortKeyColumns(tableDef);
        this.createIndexes(tableDef);
        this.tableDefinitions.set(tableDef.tableName, tableDef);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      rollbackQuietly(this.db);
      throw error;
    }
  }

  private createTable(tableDef: TableDefinition<any>): void {
    const sql = createTableSQL(tableDef);
    this.db.exec(sql);
  }

  private getTableColumns(tableName: string): Set<string> {
    const q = this.db.prepare(`PRAGMA table_info(${tableName})`);
    try {
      return new Set(q.values([]).map((row) => String(row[1])));
    } finally {
      q.finalize();
    }
  }

  private addMissingSortKeyColumns(tableDef: TableDefinition<any>): void {
    const existingColumns = this.getTableColumns(tableDef.tableName);
    for (const indexName of Object.keys(tableDef.indexes)) {
      const sortKeyColumn = sqliteIndexSortKeyColumn(indexName);
      if (existingColumns.has(sortKeyColumn)) continue;

      const sql = addSortKeyColumnSQL(tableDef.tableName, sortKeyColumn);
      this.db.exec(sql);
      existingColumns.add(sortKeyColumn);
    }
  }

  // NOTE: backwards compatibility. Remove after v1.
  private backfillSortKeyColumns(tableDef: TableDefinition<any>): void {
    for (const indexName of Object.keys(tableDef.indexes)) {
      const sortKeyColumn = sqliteIndexSortKeyColumn(indexName);
      const q = this.db.prepare(
        `SELECT id, data FROM ${tableDef.tableName} WHERE ${sortKeyColumn} IS NULL`,
      );

      try {
        for (const [id, data] of q.values([])) {
          const row = parseSqliteStoredRow(String(data));
          const sortKeyValue = getSqliteIndexSortKeyValue(
            tableDef,
            indexName,
            row,
          );
          this.db.exec(
            `UPDATE ${tableDef.tableName} SET ${sortKeyColumn} = ? WHERE id = ? AND ${sortKeyColumn} IS NULL`,
            [sortKeyValue, id],
          );
        }
      } finally {
        q.finalize();
      }
    }
  }

  private createIndexes(tableDef: TableDefinition<any>): void {
    for (const indexName of Object.keys(tableDef.indexes)) {
      const indexSQL = createIndexSQL(tableDef.tableName, indexName);
      this.db.exec(indexSQL);
    }
  }
}
