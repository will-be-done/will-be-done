/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  DBDriver,
  DBDriverTX,
  Row,
  SelectOptions,
  WhereClause,
} from "../db.ts";
import type { DBCmd } from "../generators.ts";
import { unwrapCb } from "../generators.ts";
import type { TableDefinition } from "../table.ts";
import { cloneDeep } from "es-toolkit";
import AwaitLock from "await-lock";
import {
  buildDeleteSQL,
  buildInsertSQL,
  buildOrderClause,
  buildSelectSQL,
  buildWhereClause,
  CHUNK_SIZE,
  chunkArray,
  createIndexSQL,
  createTableSQL,
} from "./SqliteCommon.ts";

type ExecuteArgs = Array<string | number | bigint | boolean | Uint8Array | null>;

type ExecuteInput = string | { sql: string; args?: ExecuteArgs };

type ExecuteResult = {
  rows: Array<Record<string, unknown> | unknown[]>;
};

type TursoExecutable = {
  execute(input: ExecuteInput): Promise<ExecuteResult>;
};

type TursoTransaction = TursoExecutable & {
  commit(): Promise<void>;
  rollback(): Promise<void>;
  close?: () => Promise<void>;
};

export type TursoServerlessClient = TursoExecutable & {
  transaction(mode: "write" | "read" | "deferred"): Promise<TursoTransaction>;
};

async function executeSql(
  db: TursoExecutable,
  sql: string,
  args?: ExecuteArgs,
): Promise<ExecuteResult> {
  if (args && args.length > 0) {
    return db.execute({ sql, args });
  }

  return db.execute(sql);
}

async function performInsertOperation(
  db: TursoExecutable,
  tableName: string,
  values: Row[],
): Promise<void> {
  if (values.length === 0) return;

  for (const chunk of chunkArray(values, CHUNK_SIZE)) {
    await executeSql(
      db,
      buildInsertSQL(tableName, chunk.length),
      chunk.flatMap((v) => [v.id, JSON.stringify(v)]),
    );
  }
}

async function performUpdateOperation(
  db: TursoExecutable,
  tableName: string,
  values: Row[],
): Promise<void> {
  if (values.length === 0) return;

  for (const chunk of chunkArray(values, CHUNK_SIZE)) {
    await executeSql(
      db,
      buildInsertSQL(tableName, chunk.length),
      chunk.flatMap((v) => [v.id, JSON.stringify(v)]),
    );
  }
}

async function performDeleteOperation(
  db: TursoExecutable,
  tableName: string,
  values: string[],
): Promise<void> {
  if (values.length === 0) return;

  for (const chunk of chunkArray(values, CHUNK_SIZE)) {
    await executeSql(db, buildDeleteSQL(tableName, chunk.length), chunk);
  }
}

async function performScanOperation(
  db: TursoExecutable,
  tableDefinitions: Map<string, TableDefinition>,
  table: string,
  indexName: string,
  clauses: WhereClause[],
  selectOptions: SelectOptions,
): Promise<unknown[]> {
  const { where, params } = buildWhereClause(
    indexName,
    table,
    clauses,
    tableDefinitions,
  );
  const orderClause = buildOrderClause(indexName, table, tableDefinitions);
  const sql = buildSelectSQL(table, where, orderClause, selectOptions);

  const result = await executeSql(db, sql, params);

  return result.rows.map((row) => {
    const data = Array.isArray(row) ? row[0] : row.data;
    return JSON.parse(data as string) as unknown;
  });
}

class TursoServerlessAsyncSqlDriverTx implements DBDriverTX {
  private committed = false;
  private rolledback = false;
  private queryLock = new AwaitLock();
  private tx: TursoTransaction;
  private tableDefinitions: Map<string, TableDefinition>;
  private onFinish: () => void;

  constructor(
    tx: TursoTransaction,
    tableDefinitions: Map<string, TableDefinition>,
    onFinish: () => void,
  ) {
    this.tx = tx;
    this.tableDefinitions = tableDefinitions;
    this.onFinish = onFinish;
  }

  *commit(): Generator<DBCmd, void> {
    this.throwIfDone();

    yield* unwrapCb(async () => {
      await this.tx.commit();
      this.committed = true;
      this.onFinish();
    });
  }

  *rollback(): Generator<DBCmd, void> {
    this.throwIfDone();

    yield* unwrapCb(async () => {
      await this.tx.rollback();
      this.rolledback = true;
      this.onFinish();
    });
  }

  *insert(tableName: string, values: Row[]): Generator<DBCmd, void> {
    yield* this.withQueryLock(async () => {
      this.throwIfDone();
      await performInsertOperation(this.tx, tableName, values);
    });
  }

  *update(tableName: string, values: Row[]): Generator<DBCmd, void> {
    yield* this.withQueryLock(async () => {
      this.throwIfDone();
      await performUpdateOperation(this.tx, tableName, values);
    });
  }

  *delete(tableName: string, values: string[]): Generator<DBCmd, void> {
    yield* this.withQueryLock(async () => {
      this.throwIfDone();
      await performDeleteOperation(this.tx, tableName, values);
    });
  }

  *intervalScan(
    table: string,
    indexName: string,
    clauses: WhereClause[],
    selectOptions: SelectOptions,
  ): Generator<DBCmd, unknown[]> {
    return yield* this.withQueryLock(async () => {
      this.throwIfDone();
      return performScanOperation(
        this.tx,
        this.tableDefinitions,
        table,
        indexName,
        clauses,
        selectOptions,
      );
    });
  }

  private *withQueryLock<T>(fn: () => Promise<T>): Generator<DBCmd, T> {
    return yield* unwrapCb(async () => {
      await this.queryLock.acquireAsync();
      try {
        return await fn();
      } finally {
        this.queryLock.release();
      }
    });
  }

  private throwIfDone(): void {
    if (this.committed || this.rolledback) {
      throw new Error("Transaction already finished");
    }
  }
}

export class TursoServerlessAsyncSqlDriver implements DBDriver {
  private tableDefinitions = new Map<string, TableDefinition>();
  private txAndQueryLock = new AwaitLock();
  private client: TursoServerlessClient;

  constructor(client: TursoServerlessClient) {
    this.client = client;
  }

  *beginTx(): Generator<DBCmd, DBDriverTX> {
    yield* unwrapCb(async () => {
      await this.txAndQueryLock.acquireAsync();
    });

    try {
      const tx = yield* unwrapCb(() => this.client.transaction("write"));
      return new TursoServerlessAsyncSqlDriverTx(
        tx,
        this.tableDefinitions,
        () => {
          this.txAndQueryLock.release();
        },
      );
    } catch (error) {
      this.txAndQueryLock.release();
      throw error;
    }
  }

  *insert(tableName: string, values: Row[]): Generator<DBCmd, void> {
    yield* this.runInTransaction(async (tx) => {
      await performInsertOperation(tx, tableName, values);
    });
  }

  *update(tableName: string, values: Row[]): Generator<DBCmd, void> {
    yield* this.runInTransaction(async (tx) => {
      await performUpdateOperation(tx, tableName, values);
    });
  }

  *delete(tableName: string, values: string[]): Generator<DBCmd, void> {
    yield* this.runInTransaction(async (tx) => {
      await performDeleteOperation(tx, tableName, values);
    });
  }

  *intervalScan(
    table: string,
    indexName: string,
    clauses: WhereClause[],
    selectOptions: SelectOptions,
  ): Generator<DBCmd, unknown[]> {
    return yield* unwrapCb(() =>
      performScanOperation(
        this.client,
        this.tableDefinitions,
        table,
        indexName,
        clauses,
        selectOptions,
      ),
    );
  }

  *loadTables(tableDefinitions: TableDefinition<any>[]): Generator<DBCmd, void> {
    yield* this.runInTransaction(async (tx) => {
      tableDefinitions = cloneDeep(tableDefinitions);
      for (const tableDef of tableDefinitions) {
        for (const [, indexDef] of Object.entries(tableDef.indexes)) {
          const cols = indexDef.cols;

          if (cols[cols.length - 1] !== "id") {
            cols.push("id");
          }
        }

        await executeSql(tx, createTableSQL(tableDef.tableName));

        for (const [indexName, indexDef] of Object.entries(tableDef.indexes)) {
          const cols = indexDef.cols;
          const isIdIndex = cols.length === 1 && cols[0] === "id";
          await executeSql(
            tx,
            createIndexSQL(tableDef.tableName, indexName, cols, isIdIndex),
          );
        }

        this.tableDefinitions.set(tableDef.tableName, tableDef);
      }
    });
  }

  private *runInTransaction(
    fn: (tx: TursoTransaction) => Promise<void>,
  ): Generator<DBCmd, void> {
    yield* unwrapCb(async () => {
      await this.txAndQueryLock.acquireAsync();
    });

    try {
      yield* unwrapCb(async () => {
        const tx = await this.client.transaction("write");
        try {
          await fn(tx);
          await tx.commit();
        } catch (error) {
          await tx.rollback();
          throw error;
        }
      });
    } finally {
      this.txAndQueryLock.release();
    }
  }
}
