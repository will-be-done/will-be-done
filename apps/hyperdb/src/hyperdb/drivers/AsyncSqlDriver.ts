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
  buildWhereClause,
  buildOrderClause,
  buildSelectSQL,
  buildInsertSQL,
  buildDeleteSQL,
  createTableSQL,
  createIndexSQL,
  chunkArray,
  CHUNK_SIZE,
} from "./SqliteCommon.ts";

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

function* performAsyncInsertOperation(
  sqlite3: AsyncSQLiteDB,
  db: number,
  tableName: string,
  values: Record<string, unknown>[],
): Generator<DBCmd, void> {
  if (values.length === 0) return;

  yield* unwrapCb(async () => {
    const allValues = chunkArray(values, CHUNK_SIZE);
    for (const chunk of allValues) {
      const insertSQL = buildInsertSQL(tableName, chunk.length);

      for await (const stmt of sqlite3.statements(db, insertSQL)) {
        sqlite3.bind_collection(
          stmt,
          // @ts-expect-error it's ok
          chunk.flatMap((v) => [v.id, JSON.stringify(v)]),
        );
        await sqlite3.step(stmt);
      }
    }
  });
}

function* performAsyncUpdateOperation(
  sqlite3: AsyncSQLiteDB,
  db: number,
  tableName: string,
  values: Row[],
): Generator<DBCmd, void> {
  if (values.length === 0) return;

  yield* unwrapCb(async () => {
    const allValues = chunkArray(values, CHUNK_SIZE);
    for (const chunk of allValues) {
      const updateSQL = buildInsertSQL(tableName, chunk.length);

      for await (const stmt of sqlite3.statements(db, updateSQL)) {
        sqlite3.bind_collection(
          stmt,
          chunk.flatMap((v) => [v.id, JSON.stringify(v)]),
        );
        await sqlite3.step(stmt);
      }
    }
  });
}

function* performAsyncDeleteOperation(
  sqlite3: AsyncSQLiteDB,
  db: number,
  tableName: string,
  values: string[],
): Generator<DBCmd, void> {
  if (values.length === 0) return;

  yield* unwrapCb(async () => {
    const allValues = chunkArray(values, CHUNK_SIZE);
    for (const chunk of allValues) {
      const deleteSQL = buildDeleteSQL(tableName, chunk.length);

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
    const { where, params } = buildWhereClause(
      indexName,
      table,
      clauses,
      tableDefinitions,
    );
    const orderClause = buildOrderClause(indexName, table, tableDefinitions);
    const sql = buildSelectSQL(table, where, orderClause, selectOptions);

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
    if (this.committed || this.rolledback) {
      throw new Error("Transaction already finished");
    }
    yield* performAsyncInsertOperation(
      this.sqlite3,
      this.db,
      tableName,
      values,
    );
  }

  *update(tableName: string, values: Row[]): Generator<DBCmd, void> {
    if (this.committed || this.rolledback) {
      throw new Error("Transaction already finished");
    }
    yield* performAsyncUpdateOperation(
      this.sqlite3,
      this.db,
      tableName,
      values,
    );
  }

  *delete(tableName: string, values: string[]): Generator<DBCmd, void> {
    if (this.committed || this.rolledback) {
      throw new Error("Transaction already finished");
    }
    yield* performAsyncDeleteOperation(
      this.sqlite3,
      this.db,
      tableName,
      values,
    );
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

    return yield* performAsyncScanOperation(
      this.sqlite3,
      this.db,
      this.tableDefinitions,
      table,
      indexName,
      clauses,
      selectOptions,
    );
  }
}

export class AsyncSqlDriver implements DBDriver {
  private sqlite3: AsyncSQLiteDB;
  private db: number;
  private tableDefinitions = new Map<string, TableDefinition>();
  private isInTransaction = false;

  constructor(sqlite3: AsyncSQLiteDB, db: number) {
    this.sqlite3 = sqlite3;
    this.db = db;
  }

  *beginTx(): Generator<DBCmd, DBDriverTX> {
    if (this.isInTransaction) {
      throw new Error("can't run while transaction is in progress");
    }

    yield* unwrapCb(async () => {
      for await (const stmt of this.sqlite3.statements(
        this.db,
        "BEGIN TRANSACTION",
      )) {
        await this.sqlite3.step(stmt);
      }
    });

    this.isInTransaction = true;
    return new AsyncSqlDriverTx(
      this.sqlite3,
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

    yield* unwrapCb(async () => {
      for await (const stmt of this.sqlite3.statements(
        this.db,
        "BEGIN TRANSACTION",
      )) {
        await this.sqlite3.step(stmt);
      }
    });

    yield* performAsyncInsertOperation(
      this.sqlite3,
      this.db,
      tableName,
      values,
    );

    yield* unwrapCb(async () => {
      for await (const stmt of this.sqlite3.statements(this.db, "COMMIT")) {
        await this.sqlite3.step(stmt);
      }
    });
  }

  *update(tableName: string, values: Row[]): Generator<DBCmd, void> {
    if (this.isInTransaction) {
      throw new Error("can't run while transaction is in progress");
    }
    if (values.length === 0) return;

    yield* unwrapCb(async () => {
      for await (const stmt of this.sqlite3.statements(
        this.db,
        "BEGIN TRANSACTION",
      )) {
        await this.sqlite3.step(stmt);
      }
    });

    yield* performAsyncUpdateOperation(
      this.sqlite3,
      this.db,
      tableName,
      values,
    );

    yield* unwrapCb(async () => {
      for await (const stmt of this.sqlite3.statements(this.db, "COMMIT")) {
        await this.sqlite3.step(stmt);
      }
    });
  }

  *delete(tableName: string, values: string[]): Generator<DBCmd, void> {
    if (this.isInTransaction) {
      throw new Error("can't run while transaction is in progress");
    }
    if (values.length === 0) return;

    yield* unwrapCb(async () => {
      for await (const stmt of this.sqlite3.statements(
        this.db,
        "BEGIN TRANSACTION",
      )) {
        await this.sqlite3.step(stmt);
      }
    });

    yield* performAsyncDeleteOperation(
      this.sqlite3,
      this.db,
      tableName,
      values,
    );

    yield* unwrapCb(async () => {
      for await (const stmt of this.sqlite3.statements(this.db, "COMMIT")) {
        await this.sqlite3.step(stmt);
      }
    });
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

    return yield* performAsyncScanOperation(
      this.sqlite3,
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
    yield* unwrapCb(async () => {
      for await (const stmt of this.sqlite3.statements(
        this.db,
        "BEGIN TRANSACTION",
      )) {
        await this.sqlite3.step(stmt);
      }

      tableDefinitions = cloneDeep(tableDefinitions);
      for (const tableDef of tableDefinitions) {
        for (const [, indexDef] of Object.entries(tableDef.indexes)) {
          const cols = indexDef.cols;

          if (cols[cols.length - 1] !== "id") {
            cols.push("id");
          }
        }

        await this.createTable(tableDef.tableName);
        await this.createIndexes(tableDef);
        this.tableDefinitions.set(tableDef.tableName, tableDef);
      }

      for await (const stmt of this.sqlite3.statements(this.db, "COMMIT")) {
        await this.sqlite3.step(stmt);
      }
    });
  }

  private async createTable(tableName: string): Promise<void> {
    const sql = createTableSQL(tableName);
    console.log(sql);

    for await (const stmt of this.sqlite3.statements(this.db, sql)) {
      await this.sqlite3.step(stmt);
    }
  }

  private async createIndexes(tableDef: TableDefinition<any>): Promise<void> {
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

      for await (const stmt of this.sqlite3.statements(this.db, sql)) {
        await this.sqlite3.step(stmt);
      }
    }
  }
}
