/* eslint-disable @typescript-eslint/no-explicit-any */
import type { HyperDB, HyperDBTx, Row, SelectOptions, WhereClause } from "./db";
import type { DBCmd } from "./generators";
// import { collectAll } from "./generators";
import type { ExtractIndexes, ExtractSchema, TableDefinition } from "./table";

export type InsertOp = {
  type: "insert";
  table: TableDefinition;
  newValue: Row;
};

export type UpdateOp = {
  type: "update";
  table: TableDefinition;
  oldValue: Row;
  newValue: Row;
};

export type DeleteOp = {
  type: "delete";
  table: TableDefinition;
  oldValue: Row;
};

export type Op = InsertOp | UpdateOp | DeleteOp;

export class SubscribableDBTx implements HyperDBTx {
  operations: Op[] = [];

  private subDb: SubscribableDB;
  private txDb: HyperDBTx;

  committed = false;
  rollbacked = false;

  constructor(subDb: SubscribableDB, txDb: HyperDBTx) {
    this.subDb = subDb;
    this.txDb = txDb;
  }

  *rollback(): Generator<DBCmd, void> {
    this.throwIfDone();
    this.rollbacked = true;
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
    this.throwIfDone();

    return yield* this.txDb.intervalScan(
      table,
      indexName,
      clauses,
      selectOptions,
    );
  }

  *insert<TTable extends TableDefinition<any>>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ): Generator<DBCmd, void> {
    this.throwIfDone();
    if (records.length === 0) return;

    yield* this.txDb.insert(table, records);

    for (const record of records) {
      this.operations.push({
        type: "insert",
        table,
        newValue: record,
      });
    }
  }

  *update<TTable extends TableDefinition<any>>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ): Generator<DBCmd, void> {
    this.throwIfDone();
    if (records.length === 0) return;

    const previousRecords = new Map<string, Row>();

    for (const oldRecord of yield* this.txDb.intervalScan(
      table,
      table.idIndexName,
      records.map((r) => ({ eq: [{ col: "id", val: r.id }] })),
    )) {
      previousRecords.set(oldRecord.id, oldRecord);
    }

    for (const record of records) {
      if (!previousRecords.has(record.id)) {
        throw new Error(
          `Failed to update record, no previous record found for ${table.tableName}=${record.id}`,
        );
      }
    }

    yield* this.txDb.update(table, records);

    for (const record of records) {
      this.operations.push({
        type: "update",
        table,
        oldValue: previousRecords.get(record.id)!,
        newValue: record,
      });
    }
  }

  *delete<TTable extends TableDefinition<any>>(table: TTable, ids: string[]) {
    this.throwIfDone();
    if (ids.length === 0) return;

    yield* this.txDb.delete(table, ids);

    for (const oldRecord of yield* this.txDb.intervalScan(
      table,
      table.idIndexName,
      ids.map((id) => ({ eq: [{ col: "id", val: id }] })),
    )) {
      this.operations.push({ type: "delete", table, oldValue: oldRecord });
    }
  }

  *commit(): Generator<DBCmd, void> {
    this.throwIfDone();
    yield* this.txDb.commit();
    this.subDb.subscribers.forEach((s) => s(this.operations));
  }

  throwIfDone() {
    if (this.committed) {
      throw new Error("Cannot modify a committed tx");
    }

    if (this.rollbacked) {
      throw new Error("Cannot modify a rollbacked tx");
    }
  }
}

export class SubscribableDB implements HyperDB {
  subscribers: ((op: Op[]) => void)[] = [];
  db: HyperDB;

  constructor(db: HyperDB) {
    this.db = db;
  }

  loadTables(tables: TableDefinition<any>[]): Generator<DBCmd, void> {
    return this.db.loadTables(tables);
  }

  *beginTx(): Generator<DBCmd, HyperDBTx> {
    return new SubscribableDBTx(this, yield* this.db.beginTx());
  }

  subscribe(cb: (op: Op[]) => void): () => void {
    this.subscribers.push(cb);

    return () => {
      this.subscribers = this.subscribers.filter((s) => s !== cb);
    };
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
    if (clauses && clauses.length === 0) {
      return [];
    }

    return yield* this.db.intervalScan(
      table,
      indexName,
      clauses,
      selectOptions,
    );
  }

  *insert<TTable extends TableDefinition<any>>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ) {
    if (records.length === 0) return;

    yield* this.db.insert(table, records);
    const ops = records.map(
      (record): Op => ({
        type: "insert",
        table,
        newValue: record,
      }),
    );
    this.subscribers.forEach((s) => s(ops));
  }

  *update<TTable extends TableDefinition<any>>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ) {
    if (records.length === 0) return;

    const previousRecords = new Map<string, Row>();

    for (const oldRecord of yield* this.db.intervalScan(
      table,
      table.idIndexName,
      records.map((r) => ({ eq: [{ col: "id", val: r.id }] })),
    )) {
      previousRecords.set(oldRecord.id, oldRecord);
    }

    for (const record of records) {
      if (!previousRecords.has(record.id)) {
        throw new Error(
          `Failed to update record, no previous record found for ${table.tableName}=${record.id}`,
        );
      }
    }

    yield* this.db.update(table, records);

    const ops = records.map(
      (record): Op => ({
        type: "update",
        table,
        oldValue: previousRecords.get(record.id)!,
        newValue: record,
      }),
    );

    this.subscribers.forEach((s) => s(ops));
  }

  *delete<TTable extends TableDefinition<any>>(table: TTable, ids: string[]) {
    if (ids.length === 0) return;

    const opsToNotify: DeleteOp[] = [];
    for (const oldRecord of yield* this.db.intervalScan(
      table,
      table.idIndexName,
      ids.map((id) => ({ eq: [{ col: "id", val: id }] })),
    )) {
      opsToNotify.push({ type: "delete", table, oldValue: oldRecord });
    }

    yield* this.db.delete(table, ids);

    this.subscribers.forEach((s) => s(opsToNotify));
  }
}
