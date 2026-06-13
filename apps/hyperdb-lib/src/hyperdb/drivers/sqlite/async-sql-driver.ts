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
import { unwrapCb } from "../../commands/async";
import {
  buildSortKeyWhereClause,
  buildOrderClause,
  buildSelectSQL,
  buildInsertSQL,
  buildDeleteSQL,
  createTableSQL,
  createIndexSQL,
  dropIndexSQL,
  addSortKeyColumnSQL,
  dropSortKeyColumnSQL,
  chunkArray,
  getSqliteDeleteChunkSize,
  getSqliteInsertChunkSize,
  sqliteIndexSortKeyColumn,
  sqliteIndexIdentifier,
  isSqliteSortKeyColumn,
  assertSafeTableDefinition,
  buildRowInsertParams,
  parseSqliteStoredRow,
} from "./sqlite-common";
import AwaitLock from "await-lock";

interface SQLitePrepareOptions {
  /**
   * Statement handles prepared and yielded by {@link SQLiteAPI.statements}
   * are normally valid only within the scope of an iteration.
   * Set `unscoped` to `true` to give iterated statements an arbitrary
   * lifetime.
   */
  unscoped?: boolean;

  /**
   * SQLITE_PREPARE_* flags
   * @see https://www.sqlite.org/c3ref/c_prepare_normalize.html#sqlitepreparepersistent
   */
  flags?: number;
}

type SQLiteCompatibleType =
  | number
  | string
  | Uint8Array
  | Array<number>
  | bigint
  | null;

interface AsyncSQLiteDB {
  bind_collection(
    stmt: number,
    bindings:
      | { [index: string]: SQLiteCompatibleType | null }
      | Array<SQLiteCompatibleType | null>,
  ): number;
  column_names(stmt: number): Array<string>;
  statements(
    db: number,
    sql: string,
    options?: SQLitePrepareOptions,
  ): AsyncIterable<number>;
  step(stmt: number): Promise<number>;
  row(stmt: number): SQLiteCompatibleType[];
}

const SQLITE_ROW = 100;
const SQL_PARAM_LOG_LIMIT = 40;

function nowMs(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function summarizeSqlParams(params?: SQLiteCompatibleType[]) {
  if (!params) return undefined;

  return {
    paramCount: params.length,
    params:
      params.length <= SQL_PARAM_LOG_LIMIT
        ? params
        : params.slice(0, SQL_PARAM_LOG_LIMIT),
    truncatedParams:
      params.length > SQL_PARAM_LOG_LIMIT
        ? params.length - SQL_PARAM_LOG_LIMIT
        : 0,
  };
}

function logAsyncSQL(
  sql: string,
  startedAt: number,
  details: Record<string, unknown> = {},
  error?: unknown,
): void {
  const durationMs = Math.round(nowMs() - startedAt);
  const normalizedSql = sql.replace(/\s+/g, " ").trim();
  const rowCount =
    typeof details.rowCount === "number" ? ` | ${details.rowCount} rows` : "";
  const prefix = error ? "FAILED " : "";

  if (error) {
    console.error(
      `%c${prefix}${normalizedSql} | ${durationMs}ms${rowCount}`,
      "color: #facc15",
      error,
    );
  } else {
    console.log(
      `%c${prefix}${normalizedSql} | ${durationMs}ms${rowCount}`,
      "color: #facc15",
    );
  }
}

async function runAsyncSQL(
  sqlite3: AsyncSQLiteDB,
  db: number,
  sql: string,
  params?: SQLiteCompatibleType[],
): Promise<void> {
  const startedAt = nowMs();
  try {
    for await (const stmt of sqlite3.statements(db, sql)) {
      if (params) {
        sqlite3.bind_collection(stmt, params);
      }
      await sqlite3.step(stmt);
    }
    logAsyncSQL(sql, startedAt, summarizeSqlParams(params));
  } catch (error) {
    logAsyncSQL(sql, startedAt, summarizeSqlParams(params), error);
    throw error;
  }
}

async function rollbackAsyncQuietly(
  sqlite3: AsyncSQLiteDB,
  db: number,
  reason?: unknown,
): Promise<void> {
  try {
    if (reason) {
      console.warn("Rolling back SQLite transaction after error", reason);
    } else {
      console.warn("Rolling back SQLite transaction");
    }
    await runAsyncSQL(sqlite3, db, "ROLLBACK");
  } catch (rollbackError) {
    console.warn("Failed to rollback SQLite transaction", rollbackError);
    // Best effort cleanup after a failed statement.
  }
}

function* performAsyncInsertOperation(
  sqlite3: AsyncSQLiteDB,
  db: number,
  tableDef: TableDefinition,
  values: Row[],
): Generator<DBCmd, void> {
  if (values.length === 0) return;

  yield* unwrapCb(async () => {
    const allValues = chunkArray(values, getSqliteInsertChunkSize(tableDef));
    for (const chunk of allValues) {
      const insertSQL = buildInsertSQL(tableDef, chunk.length);
      const params = chunk.flatMap((v) => buildRowInsertParams(tableDef, v));
      const startedAt = nowMs();

      try {
        for await (const stmt of sqlite3.statements(db, insertSQL)) {
          sqlite3.bind_collection(stmt, params);
          await sqlite3.step(stmt);
        }
        logAsyncSQL(insertSQL, startedAt, {
          tableName: tableDef.tableName,
          rowCount: chunk.length,
          ...summarizeSqlParams(params),
        });
      } catch (error) {
        logAsyncSQL(
          insertSQL,
          startedAt,
          {
            tableName: tableDef.tableName,
            rowCount: chunk.length,
            ...summarizeSqlParams(params),
          },
          error,
        );
        throw error;
      }
    }
  });
}

function* performAsyncUpsertOperation(
  sqlite3: AsyncSQLiteDB,
  db: number,
  tableDef: TableDefinition,
  values: Row[],
): Generator<DBCmd, void> {
  if (values.length === 0) return;

  yield* unwrapCb(async () => {
    const allValues = chunkArray(values, getSqliteInsertChunkSize(tableDef));
    for (const chunk of allValues) {
      const upsertSQL = buildInsertSQL(tableDef, chunk.length, {
        replace: true,
      });
      const params = chunk.flatMap((v) => buildRowInsertParams(tableDef, v));
      const startedAt = nowMs();

      try {
        for await (const stmt of sqlite3.statements(db, upsertSQL)) {
          sqlite3.bind_collection(stmt, params);
          await sqlite3.step(stmt);
        }
        logAsyncSQL(upsertSQL, startedAt, {
          tableName: tableDef.tableName,
          rowCount: chunk.length,
          ...summarizeSqlParams(params),
        });
      } catch (error) {
        logAsyncSQL(
          upsertSQL,
          startedAt,
          {
            tableName: tableDef.tableName,
            rowCount: chunk.length,
            ...summarizeSqlParams(params),
          },
          error,
        );
        throw error;
      }
    }
  });
}

function* performAsyncDeleteOperation(
  sqlite3: AsyncSQLiteDB,
  db: number,
  tableDef: TableDefinition,
  values: string[],
): Generator<DBCmd, void> {
  if (values.length === 0) return;

  yield* unwrapCb(async () => {
    const allValues = chunkArray(values, getSqliteDeleteChunkSize());
    for (const chunk of allValues) {
      const deleteSQL = buildDeleteSQL(tableDef.tableName, chunk.length);
      const startedAt = nowMs();

      try {
        for await (const stmt of sqlite3.statements(db, deleteSQL)) {
          sqlite3.bind_collection(stmt, chunk);
          await sqlite3.step(stmt);
        }
        logAsyncSQL(deleteSQL, startedAt, {
          tableName: tableDef.tableName,
          rowCount: chunk.length,
          ...summarizeSqlParams(chunk),
        });
      } catch (error) {
        logAsyncSQL(
          deleteSQL,
          startedAt,
          {
            tableName: tableDef.tableName,
            rowCount: chunk.length,
            ...summarizeSqlParams(chunk),
          },
          error,
        );
        throw error;
      }
    }
  });
}

function* performAsyncScanOperation(
  sqlite3: AsyncSQLiteDB,
  db: number,
  tableDefinitions: Map<string, TableDefinition>,
  table: string,
  indexName: string,
  clauses: WhereClause[],
  selectOptions: SelectOptions,
): Generator<DBCmd, unknown[]> {
  return yield* unwrapCb(async () => {
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
    const sql = buildSelectSQL(
      table,
      where,
      orderClause,
      selectOptions,
    );

    const result: unknown[] = [];
    const startedAt = nowMs();

    try {
      for await (const stmt of sqlite3.statements(db, sql)) {
        sqlite3.bind_collection(stmt, params);

        while ((await sqlite3.step(stmt)) === SQLITE_ROW) {
          const row = sqlite3.row(stmt);
          const record = parseSqliteStoredRow(row[0] as string);
          result.push(record);
        }
      }
      logAsyncSQL(sql, startedAt, {
        tableName: table,
        indexName,
        rowCount: result.length,
        ...summarizeSqlParams(params),
      });
    } catch (error) {
      logAsyncSQL(
        sql,
        startedAt,
        {
          tableName: table,
          indexName,
          rowCount: result.length,
          ...summarizeSqlParams(params),
        },
        error,
      );
      throw new Error(`Scan failed for index ${indexName}: ${error}`);
    }

    return result;
  });
}

class AsyncSqlDriverTx implements DBDriverTX {
  private sqlite3: AsyncSQLiteDB;
  private db: number;
  private tableDefinitions: Map<string, TableDefinition>;
  private committed = false;
  private rolledback = false;
  private onFinish: () => void;
  private queryLock = new AwaitLock();

  constructor(
    sqlite3: AsyncSQLiteDB,
    db: number,
    tableDefinitions: Map<string, TableDefinition>,
    onFinish: () => void,
  ) {
    this.sqlite3 = sqlite3;
    this.db = db;
    this.tableDefinitions = tableDefinitions;
    this.onFinish = onFinish;
  }

  *commit(): Generator<DBCmd, void> {
    if (this.committed || this.rolledback) {
      throw new Error("Transaction already finished");
    }

    yield* unwrapCb(async () => {
      await runAsyncSQL(this.sqlite3, this.db, "COMMIT");
    });

    this.committed = true;
    this.onFinish();
  }

  *rollback(): Generator<DBCmd, void> {
    if (this.committed || this.rolledback) {
      throw new Error("Transaction already finished");
    }

    yield* unwrapCb(async () => {
      await runAsyncSQL(this.sqlite3, this.db, "ROLLBACK");
    });

    this.rolledback = true;
    this.onFinish();
  }

  *insert(
    tableName: string,
    values: Record<string, unknown>[],
  ): Generator<DBCmd, void> {
    yield* unwrapCb(async () => {
      await this.queryLock.acquireAsync();
    });

    try {
      if (this.committed || this.rolledback) {
        throw new Error("Transaction already finished");
      }
      const tableDef = this.tableDefinitions.get(tableName);
      if (!tableDef) throw new Error(`Table ${tableName} not found`);
      yield* performAsyncInsertOperation(
        this.sqlite3,
        this.db,
        tableDef,
        values as Row[],
      );
    } finally {
      this.queryLock.release();
    }
  }

  *upsert(tableName: string, values: Row[]): Generator<DBCmd, void> {
    yield* unwrapCb(async () => {
      await this.queryLock.acquireAsync();
    });

    try {
      if (this.committed || this.rolledback) {
        throw new Error("Transaction already finished");
      }
      const tableDef = this.tableDefinitions.get(tableName);
      if (!tableDef) throw new Error(`Table ${tableName} not found`);
      yield* performAsyncUpsertOperation(
        this.sqlite3,
        this.db,
        tableDef,
        values,
      );
    } finally {
      this.queryLock.release();
    }
  }

  *delete(tableName: string, values: string[]): Generator<DBCmd, void> {
    yield* unwrapCb(async () => {
      await this.queryLock.acquireAsync();
    });

    try {
      if (this.committed || this.rolledback) {
        throw new Error("Transaction already finished");
      }
      const tableDef = this.tableDefinitions.get(tableName);
      if (!tableDef) throw new Error(`Table ${tableName} not found`);
      yield* performAsyncDeleteOperation(
        this.sqlite3,
        this.db,
        tableDef,
        values,
      );
    } finally {
      this.queryLock.release();
    }
  }

  *intervalScan(
    table: string,
    indexName: string,
    clauses: WhereClause[],
    selectOptions: SelectOptions,
  ): Generator<DBCmd, unknown[]> {
    yield* unwrapCb(async () => {
      await this.queryLock.acquireAsync();
    });

    try {
      if (this.committed || this.rolledback) {
        throw new Error("Transaction already finished");
      }

      return yield* performAsyncScanOperation(
        this.sqlite3,
        this.db,
        this.tableDefinitions,
        table,
        indexName,
        clauses,
        selectOptions,
      );
    } finally {
      this.queryLock.release();
    }
  }
}

export class AsyncSqlDriver implements DBDriver {
  private sqlite3: AsyncSQLiteDB;
  private db: number;
  private tableDefinitions = new Map<string, TableDefinition>();
  private txAndQueryLock = new AwaitLock();

  constructor(sqlite3: AsyncSQLiteDB, db: number) {
    this.sqlite3 = sqlite3;
    this.db = db;
  }

  *beginTx(): Generator<DBCmd, DBDriverTX> {
    yield* unwrapCb(async () => {
      await this.txAndQueryLock.acquireAsync();
    });

    yield* unwrapCb(async () => {
      await runAsyncSQL(this.sqlite3, this.db, "BEGIN TRANSACTION");
    });

    return new AsyncSqlDriverTx(
      this.sqlite3,
      this.db,
      this.tableDefinitions,
      () => {
        this.txAndQueryLock.release();
      },
    );
  }

  *insert(
    tableName: string,
    values: Record<string, unknown>[],
  ): Generator<DBCmd, void> {
    yield* unwrapCb(async () => {
      await this.txAndQueryLock.acquireAsync();
    });

    try {
      if (values.length === 0) return;

      let transactionStarted = false;
      try {
        yield* unwrapCb(async () => {
          await runAsyncSQL(this.sqlite3, this.db, "BEGIN TRANSACTION");
        });
        transactionStarted = true;

        yield* performAsyncInsertOperation(
          this.sqlite3,
          this.db,
          this.getTableDefinition(tableName),
          values as Row[],
        );

        yield* unwrapCb(async () => {
          await runAsyncSQL(this.sqlite3, this.db, "COMMIT");
        });
        transactionStarted = false;
      } catch (error) {
        if (transactionStarted) {
          yield* unwrapCb(async () => {
            await rollbackAsyncQuietly(this.sqlite3, this.db, error);
          });
        }
        throw error;
      }
    } finally {
      this.txAndQueryLock.release();
    }
  }

  *upsert(tableName: string, values: Row[]): Generator<DBCmd, void> {
    yield* unwrapCb(async () => {
      await this.txAndQueryLock.acquireAsync();
    });

    try {
      if (values.length === 0) return;

      let transactionStarted = false;
      try {
        yield* unwrapCb(async () => {
          await runAsyncSQL(this.sqlite3, this.db, "BEGIN TRANSACTION");
        });
        transactionStarted = true;

        yield* performAsyncUpsertOperation(
          this.sqlite3,
          this.db,
          this.getTableDefinition(tableName),
          values,
        );

        yield* unwrapCb(async () => {
          await runAsyncSQL(this.sqlite3, this.db, "COMMIT");
        });
        transactionStarted = false;
      } catch (error) {
        if (transactionStarted) {
          yield* unwrapCb(async () => {
            await rollbackAsyncQuietly(this.sqlite3, this.db, error);
          });
        }
        throw error;
      }
    } finally {
      this.txAndQueryLock.release();
    }
  }

  *delete(tableName: string, values: string[]): Generator<DBCmd, void> {
    yield* unwrapCb(async () => {
      await this.txAndQueryLock.acquireAsync();
    });

    try {
      if (values.length === 0) return;

      let transactionStarted = false;
      try {
        yield* unwrapCb(async () => {
          await runAsyncSQL(this.sqlite3, this.db, "BEGIN TRANSACTION");
        });
        transactionStarted = true;

        yield* performAsyncDeleteOperation(
          this.sqlite3,
          this.db,
          this.getTableDefinition(tableName),
          values,
        );

        yield* unwrapCb(async () => {
          await runAsyncSQL(this.sqlite3, this.db, "COMMIT");
        });
        transactionStarted = false;
      } catch (error) {
        if (transactionStarted) {
          yield* unwrapCb(async () => {
            await rollbackAsyncQuietly(this.sqlite3, this.db, error);
          });
        }
        throw error;
      }
    } finally {
      this.txAndQueryLock.release();
    }
  }

  *intervalScan(
    table: string,
    indexName: string,
    clauses: WhereClause[],
    selectOptions: SelectOptions,
  ): Generator<DBCmd, unknown[]> {
    yield* unwrapCb(async () => {
      await this.txAndQueryLock.acquireAsync();
    });

    try {
      return yield* performAsyncScanOperation(
        this.sqlite3,
        this.db,
        this.tableDefinitions,
        table,
        indexName,
        clauses,
        selectOptions,
      );
    } finally {
      this.txAndQueryLock.release();
    }
  }

  *loadTables(
    tableDefinitions: TableDefinition<any>[],
  ): Generator<DBCmd, void> {
    yield* unwrapCb(async () => {
      await this.txAndQueryLock.acquireAsync();
    });

    try {
      for (const tableDef of tableDefinitions) {
        assertSafeTableDefinition(tableDef);
      }

      yield* unwrapCb(async () => {
        await runAsyncSQL(this.sqlite3, this.db, "BEGIN TRANSACTION");

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

          await this.createTable(tableDef);
          await this.dropStaleSortKeyIndexes(tableDef);
          await this.dropStaleSortKeyColumns(tableDef);
          await this.addMissingSortKeyColumns(tableDef);
          await this.backfillSortKeyColumns(tableDef);
          await this.createIndexes(tableDef);
          this.tableDefinitions.set(tableDef.tableName, tableDef);
        }

        await runAsyncSQL(this.sqlite3, this.db, "COMMIT");
      });
    } catch (error) {
      yield* unwrapCb(async () => {
        await rollbackAsyncQuietly(this.sqlite3, this.db, error);
      });
      throw error;
    } finally {
      this.txAndQueryLock.release();
    }
  }

  private async createTable(tableDef: TableDefinition<any>): Promise<void> {
    const sql = createTableSQL(tableDef);
    await runAsyncSQL(this.sqlite3, this.db, sql);
  }

  private async getTableColumns(tableName: string): Promise<Set<string>> {
    const columns = new Set<string>();
    const sql = `PRAGMA table_info(${tableName})`;
    const startedAt = nowMs();

    try {
      for await (const stmt of this.sqlite3.statements(this.db, sql)) {
        while ((await this.sqlite3.step(stmt)) === SQLITE_ROW) {
          const row = this.sqlite3.row(stmt);
          columns.add(String(row[1]));
        }
      }
      logAsyncSQL(sql, startedAt, {
        tableName,
        rowCount: columns.size,
      });
    } catch (error) {
      logAsyncSQL(
        sql,
        startedAt,
        {
          tableName,
          rowCount: columns.size,
        },
        error,
      );
      throw error;
    }

    return columns;
  }

  private async getTableIndexNames(tableName: string): Promise<Set<string>> {
    const indexes = new Set<string>();
    const sql = `PRAGMA index_list(${tableName})`;
    const startedAt = nowMs();

    try {
      for await (const stmt of this.sqlite3.statements(this.db, sql)) {
        while ((await this.sqlite3.step(stmt)) === SQLITE_ROW) {
          const row = this.sqlite3.row(stmt);
          indexes.add(String(row[1]));
        }
      }
      logAsyncSQL(sql, startedAt, {
        tableName,
        rowCount: indexes.size,
      });
    } catch (error) {
      logAsyncSQL(
        sql,
        startedAt,
        {
          tableName,
          rowCount: indexes.size,
        },
        error,
      );
      throw error;
    }

    return indexes;
  }

  private getExpectedSortKeyColumns(tableDef: TableDefinition<any>): Set<string> {
    return new Set(
      Object.keys(tableDef.indexes).map((indexName) =>
        sqliteIndexSortKeyColumn(indexName),
      ),
    );
  }

  private getExpectedIndexNames(tableDef: TableDefinition<any>): Set<string> {
    return new Set(
      Object.keys(tableDef.indexes).map((indexName) =>
        sqliteIndexIdentifier(tableDef.tableName, indexName),
      ),
    );
  }

  private isGeneratedIndexName(tableName: string, indexName: string): boolean {
    return (
      indexName.startsWith(`idx_${tableName}_`) &&
      indexName.endsWith("_sort_key")
    );
  }

  private async dropStaleSortKeyIndexes(
    tableDef: TableDefinition<any>,
  ): Promise<void> {
    const expectedIndexes = this.getExpectedIndexNames(tableDef);
    for (const indexName of await this.getTableIndexNames(tableDef.tableName)) {
      if (!this.isGeneratedIndexName(tableDef.tableName, indexName)) continue;
      if (expectedIndexes.has(indexName)) continue;

      await runAsyncSQL(this.sqlite3, this.db, dropIndexSQL(indexName));
    }
  }

  private async dropStaleSortKeyColumns(
    tableDef: TableDefinition<any>,
  ): Promise<void> {
    const expectedColumns = this.getExpectedSortKeyColumns(tableDef);
    for (const columnName of await this.getTableColumns(tableDef.tableName)) {
      if (!isSqliteSortKeyColumn(columnName)) continue;
      if (expectedColumns.has(columnName)) continue;

      await runAsyncSQL(
        this.sqlite3,
        this.db,
        dropSortKeyColumnSQL(tableDef.tableName, columnName),
      );
    }
  }

  private async addMissingSortKeyColumns(
    tableDef: TableDefinition<any>,
  ): Promise<void> {
    const existingColumns = await this.getTableColumns(tableDef.tableName);
    for (const indexName of Object.keys(tableDef.indexes)) {
      const sortKeyColumn = sqliteIndexSortKeyColumn(indexName);
      if (existingColumns.has(sortKeyColumn)) continue;

      const sql = addSortKeyColumnSQL(tableDef.tableName, sortKeyColumn);
      await runAsyncSQL(this.sqlite3, this.db, sql);
      existingColumns.add(sortKeyColumn);
    }
  }

  private async backfillSortKeyColumns(
    tableDef: TableDefinition<any>,
  ): Promise<void> {
    for (const indexName of Object.keys(tableDef.indexes)) {
      const sortKeyColumn = sqliteIndexSortKeyColumn(indexName);
      const sql = `SELECT data FROM ${tableDef.tableName} WHERE ${sortKeyColumn} IS NULL`;
      const startedAt = nowMs();
      let rowCount = 0;
      let batch: Row[] = [];
      const insertChunkSize = getSqliteInsertChunkSize(tableDef);

      const flushBatch = async (): Promise<void> => {
        if (batch.length === 0) return;

        await runAsyncSQL(
          this.sqlite3,
          this.db,
          buildInsertSQL(tableDef, batch.length, { replace: true }),
          batch.flatMap((row) => buildRowInsertParams(tableDef, row)),
        );
        batch = [];
      };

      try {
        for await (const stmt of this.sqlite3.statements(this.db, sql)) {
          while ((await this.sqlite3.step(stmt)) === SQLITE_ROW) {
            rowCount++;
            const [data] = this.sqlite3.row(stmt);
            batch.push(parseSqliteStoredRow(String(data)));

            if (batch.length >= insertChunkSize) {
              await flushBatch();
            }
          }
        }
        await flushBatch();
        logAsyncSQL(sql, startedAt, {
          tableName: tableDef.tableName,
          indexName,
          rowCount,
        });
      } catch (error) {
        logAsyncSQL(
          sql,
          startedAt,
          {
            tableName: tableDef.tableName,
            indexName,
            rowCount,
          },
          error,
        );
        throw error;
      }
    }
  }

  private async createIndexes(tableDef: TableDefinition<any>): Promise<void> {
    for (const [indexName] of Object.entries(tableDef.indexes)) {
      const indexSQL = createIndexSQL(tableDef.tableName, indexName);
      await runAsyncSQL(this.sqlite3, this.db, indexSQL);
    }
  }

  private getTableDefinition(tableName: string): TableDefinition {
    const tableDef = this.tableDefinitions.get(tableName);
    if (!tableDef) throw new Error(`Table ${tableName} not found`);
    return tableDef;
  }
}
