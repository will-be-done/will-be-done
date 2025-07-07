/* eslint-disable @typescript-eslint/no-explicit-any */
import type { DB, HyperDB, Row, SelectOptions, TupleScanOptions } from "./db";
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

export class SubscribableDB implements HyperDB {
  private subscribers: ((op: Op[]) => void)[] = [];
  private db: DB;

  constructor(db: DB) {
    this.db = db;
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
    options: TupleScanOptions[],
    selectOptions?: SelectOptions,
  ): Generator<ExtractSchema<TTable>> {
    if (options && options.length === 0) {
      throw new Error("scan options must be provided");
    }

    for (const data of this.db.intervalScan(
      table,
      indexName,
      options,
      selectOptions,
    )) {
      yield data;
    }
  }

  insert<TTable extends TableDefinition<any>>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ) {
    if (records.length === 0) return;

    this.db.insert(table, records);
    const ops = records.map(
      (record): Op => ({
        type: "insert",
        table,
        newValue: record,
      }),
    );
    this.subscribers.forEach((s) => s(ops));
  }

  update<TTable extends TableDefinition<any>>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ) {
    if (records.length === 0) return;

    const previousRecords = new Map<string, Row>();

    for (const oldRecord of this.db.intervalScan(
      table,
      table.idIndexName,
      records.map((r) => ({ gte: [r.id], lte: [r.id] })),
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

    this.db.update(table, records);

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

  delete<TTable extends TableDefinition<any>>(table: TTable, ids: string[]) {
    if (ids.length === 0) return;

    const opsToNotify: DeleteOp[] = [];
    for (const oldRecord of this.db.intervalScan(
      table,
      table.idIndexName,
      ids.map((id) => ({ gte: [id], lte: [id] })),
    )) {
      opsToNotify.push({ type: "delete", table, oldValue: oldRecord });
    }

    this.db.delete(table, ids);

    this.subscribers.forEach((s) => s(opsToNotify));
  }

  // *hashScan<TTable extends TableDefinition<any>>(
  //   table: TTable,
  //   indexName: string,
  //   ids: string[],
  // ): Generator<ExtractSchema<TTable>> {
  //   for (const data of this.db.hashScan(table, indexName, ids)) {
  //     yield data;
  //   }
  // }
  // async *asyncScan<TTable extends TableDefinition<any>>(
  //   table: TTable,
  //   indexName: keyof TTable["indexes"],
  //   options?: ScanOptions,
  // ): AsyncGenerator<ExtractSchema<TTable>> {
  //   for await (const data of this.db.asyncIntervalScan(
  //     table,
  //     indexName,
  //     options,
  //   )) {
  //     yield data;
  //   }
  // }
}
