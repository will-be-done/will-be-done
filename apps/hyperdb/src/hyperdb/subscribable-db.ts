/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  DB,
  ExtractSchema,
  Row,
  ScanOptions,
  TableDefinition,
} from "./db";

type InsertOp = {
  type: "insert";
  table: TableDefinition<any>;
  newValue: Row;
};

type UpdateOp = {
  type: "update";
  table: TableDefinition<any>;
  oldValue: Row;
  newValue: Row;
};

type DeleteOp = {
  type: "delete";
  table: TableDefinition<any>;
  oldValue: Row;
};

type Op = InsertOp | UpdateOp | DeleteOp;

export class SubscribableDB {
  private subscribers: ((op: Op) => void)[] = [];
  private db: DB;

  constructor(db: DB) {
    this.db = db;
  }

  subscribe(cb: (op: Op) => void): () => void {
    this.subscribers.push(cb);

    return () => {
      this.subscribers = this.subscribers.filter((s) => s !== cb);
    };
  }

  *hashScan<TTable extends TableDefinition<any>>(
    table: TTable,
    column: string,
    ids: string[],
  ): Generator<ExtractSchema<TTable>> {
    for (const data of this.db.hashScan(table, column, ids)) {
      yield data;
    }
  }

  *intervalScan<TTable extends TableDefinition<any>>(
    table: TTable,
    indexName: keyof TTable["indexes"],
    options?: ScanOptions,
  ): Generator<ExtractSchema<TTable>> {
    for (const data of this.db.intervalScan(table, indexName, options)) {
      yield data;
    }
  }

  async *asyncScan<TTable extends TableDefinition<any>>(
    table: TTable,
    indexName: keyof TTable["indexes"],
    options?: ScanOptions,
  ): AsyncGenerator<ExtractSchema<TTable>> {
    for await (const data of this.db.asyncIntervalScan(
      table,
      indexName,
      options,
    )) {
      yield data;
    }
  }

  insert<TTable extends TableDefinition<any>>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ) {
    this.db.insert(table, records);
    for (const record of records) {
      this.subscribers.forEach((s) =>
        s({ type: "insert", table, newValue: record }),
      );
    }
  }

  update<TTable extends TableDefinition<any>>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ) {
    const previousRecords = new Map<string, Row>();

    for (const oldRecord of this.db.hashScan(
      table,
      "ids",
      records.map((r) => r.id),
    )) {
      previousRecords.set(oldRecord.id, oldRecord);
    }

    for (const record of records) {
      if (!previousRecords.has(record.id)) {
        throw new Error(
          `Failed to update record, no previous record found for ${table.name}=${record.id}`,
        );
      }
    }

    this.db.update(table, records);

    for (const record of records) {
      this.subscribers.forEach((s) =>
        s({
          type: "update",
          table,
          oldValue: previousRecords.get(record.id)!,
          newValue: record,
        }),
      );
    }
  }

  delete<TTable extends TableDefinition<any>>(table: TTable, ids: string[]) {
    const opsToNotify: DeleteOp[] = [];
    for (const oldRecord of this.db.hashScan(table, "ids", ids)) {
      opsToNotify.push({ type: "delete", table, oldValue: oldRecord });
    }

    this.db.delete(table, ids);

    for (const op of opsToNotify) {
      this.subscribers.forEach((s) => s(op));
    }
  }
}
