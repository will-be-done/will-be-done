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
import { unwrapCb } from "../generators.ts";
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
} from "./SqliteCommon.ts";
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

async function runAsyncSQL(
  sqlite3: AsyncSQLiteDB,
  db: number,
  sql: string,
): Promise<void> {
  for await (const stmt of sqlite3.statements(db, sql)) {
    await sqlite3.step(stmt);
  }
}

async function rollbackAsyncQuietly(
  sqlite3: AsyncSQLiteDB,
  db: number,
): Promise<void> {
  try {
    await runAsyncSQL(sqlite3, db, "ROLLBACK");
  } catch {
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
    const allValues = chunkArray(values, CHUNK_SIZE);
    for (const chunk of allValues) {
      const insertSQL = buildInsertSQL(tableDef, chunk.length);

      for await (const stmt of sqlite3.statements(db, insertSQL)) {
        sqlite3.bind_collection(
          stmt,
          chunk.flatMap((v) => buildRowInsertParams(tableDef, v)),
        );
        await sqlite3.step(stmt);
      }
    }
  });
}

function* performAsyncUpdateOperation(
  sqlite3: AsyncSQLiteDB,
  db: number,
  tableDef: TableDefinition,
  values: Row[],
): Generator<DBCmd, void> {
  if (values.length === 0) return;

  yield* unwrapCb(async () => {
    const allValues = chunkArray(values, CHUNK_SIZE);
    for (const chunk of allValues) {
      const updateSQL = buildInsertSQL(tableDef, chunk.length, {
        replace: true,
      });

      for await (const stmt of sqlite3.statements(db, updateSQL)) {
        sqlite3.bind_collection(
          stmt,
          chunk.flatMap((v) => buildRowInsertParams(tableDef, v)),
        );
        await sqlite3.step(stmt);
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
    const allValues = chunkArray(values, CHUNK_SIZE);
    for (const chunk of allValues) {
      const deleteSQL = buildDeleteSQL(tableDef.tableName, chunk.length);

      for await (const stmt of sqlite3.statements(db, deleteSQL)) {
        sqlite3.bind_collection(stmt, chunk);
        await sqlite3.step(stmt);
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

    try {
      for await (const stmt of sqlite3.statements(db, sql)) {
        sqlite3.bind_collection(stmt, params);

        while ((await sqlite3.step(stmt)) === SQLITE_ROW) {
          const row = sqlite3.row(stmt);
          const record = JSON.parse(row[0] as string) as unknown;
          result.push(record);
        }
      }
    } catch (error) {
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

    console.log("%cCOMMIT", "color: #bada55");
    yield* unwrapCb(async () => {
      for await (const stmt of this.sqlite3.statements(this.db, "COMMIT")) {
        await this.sqlite3.step(stmt);
      }
    });

    this.committed = true;
    this.onFinish();
  }

  *rollback(): Generator<DBCmd, void> {
    if (this.committed || this.rolledback) {
      throw new Error("Transaction already finished");
    }

    console.log("%cROLLBACK", "color: #bada55");
    yield* unwrapCb(async () => {
      for await (const stmt of this.sqlite3.statements(this.db, "ROLLBACK")) {
        await this.sqlite3.step(stmt);
      }
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

  *update(tableName: string, values: Row[]): Generator<DBCmd, void> {
    yield* unwrapCb(async () => {
      await this.queryLock.acquireAsync();
    });

    try {
      if (this.committed || this.rolledback) {
        throw new Error("Transaction already finished");
      }
      const tableDef = this.tableDefinitions.get(tableName);
      if (!tableDef) throw new Error(`Table ${tableName} not found`);
      yield* performAsyncUpdateOperation(
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

    console.log("%cBEGIN TRANSACTION", "color: #bada55");
    yield* unwrapCb(async () => {
      for await (const stmt of this.sqlite3.statements(
        this.db,
        "BEGIN TRANSACTION",
      )) {
        await this.sqlite3.step(stmt);
      }
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
      console.log("%cBEGIN TRANSACTION", "color: #bada55");
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

        console.log("%cCOMMIT", "color: #bada55");
        yield* unwrapCb(async () => {
          await runAsyncSQL(this.sqlite3, this.db, "COMMIT");
        });
        transactionStarted = false;
      } catch (error) {
        if (transactionStarted) {
          yield* unwrapCb(async () => {
            await rollbackAsyncQuietly(this.sqlite3, this.db);
          });
        }
        throw error;
      }
    } finally {
      this.txAndQueryLock.release();
    }
  }

  *update(tableName: string, values: Row[]): Generator<DBCmd, void> {
    yield* unwrapCb(async () => {
      await this.txAndQueryLock.acquireAsync();
    });

    try {
      if (values.length === 0) return;

      let transactionStarted = false;
      console.log("%cBEGIN TRANSACTION", "color: #bada55");
      try {
        yield* unwrapCb(async () => {
          await runAsyncSQL(this.sqlite3, this.db, "BEGIN TRANSACTION");
        });
        transactionStarted = true;

        yield* performAsyncUpdateOperation(
          this.sqlite3,
          this.db,
          this.getTableDefinition(tableName),
          values,
        );

        console.log("%cCOMMIT", "color: #bada55");
        yield* unwrapCb(async () => {
          await runAsyncSQL(this.sqlite3, this.db, "COMMIT");
        });
        transactionStarted = false;
      } catch (error) {
        if (transactionStarted) {
          yield* unwrapCb(async () => {
            await rollbackAsyncQuietly(this.sqlite3, this.db);
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
      console.log("%cBEGIN TRANSACTION", "color: #bada55");
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

        console.log("%cCOMMIT", "color: #bada55");
        yield* unwrapCb(async () => {
          await runAsyncSQL(this.sqlite3, this.db, "COMMIT");
        });
        transactionStarted = false;
      } catch (error) {
        if (transactionStarted) {
          yield* unwrapCb(async () => {
            await rollbackAsyncQuietly(this.sqlite3, this.db);
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
        console.log("%cBEGIN TRANSACTION", "color: #bada55");
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
          await this.addMissingSortKeyColumns(tableDef);
          await this.createIndexes(tableDef);
          this.tableDefinitions.set(tableDef.tableName, tableDef);
        }

        console.log("%cCOMMIT", "color: #bada55");
        await runAsyncSQL(this.sqlite3, this.db, "COMMIT");
      });
    } catch (error) {
      yield* unwrapCb(async () => {
        await rollbackAsyncQuietly(this.sqlite3, this.db);
      });
      throw error;
    } finally {
      this.txAndQueryLock.release();
    }
  }

  private async createTable(tableDef: TableDefinition<any>): Promise<void> {
    const sql = createTableSQL(tableDef);
    console.log(sql);

    for await (const stmt of this.sqlite3.statements(this.db, sql)) {
      await this.sqlite3.step(stmt);
    }
  }

  private async getTableColumns(tableName: string): Promise<Set<string>> {
    const columns = new Set<string>();
    for await (const stmt of this.sqlite3.statements(
      this.db,
      `PRAGMA table_info(${tableName})`,
    )) {
      while ((await this.sqlite3.step(stmt)) === SQLITE_ROW) {
        const row = this.sqlite3.row(stmt);
        columns.add(String(row[1]));
      }
    }
    return columns;
  }

  private async addMissingSortKeyColumns(
    tableDef: TableDefinition<any>,
  ): Promise<void> {
    const existingColumns = await this.getTableColumns(tableDef.tableName);
    for (const indexName of Object.keys(tableDef.indexes)) {
      const sortKeyColumn = sqliteIndexSortKeyColumn(indexName);
      if (existingColumns.has(sortKeyColumn)) continue;

      const sql = addSortKeyColumnSQL(tableDef.tableName, sortKeyColumn);
      for await (const stmt of this.sqlite3.statements(this.db, sql)) {
        await this.sqlite3.step(stmt);
      }
      existingColumns.add(sortKeyColumn);
    }
  }

  private async createIndexes(tableDef: TableDefinition<any>): Promise<void> {
    for (const [indexName] of Object.entries(tableDef.indexes)) {
      const indexSQL = createIndexSQL(tableDef.tableName, indexName);
      for await (const stmt of this.sqlite3.statements(this.db, indexSQL)) {
        await this.sqlite3.step(stmt);
      }
    }
  }

  private getTableDefinition(tableName: string): TableDefinition {
    const tableDef = this.tableDefinitions.get(tableName);
    if (!tableDef) throw new Error(`Table ${tableName} not found`);
    return tableDef;
  }
}
