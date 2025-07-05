/* eslint-disable @typescript-eslint/no-explicit-any */
import type { DBDriver, Row, ScanOptions, TableDefinition, Value } from "../db";
import { InMemoryBinaryPlusTree } from "../utils/bptree";
import { compareTuple, normalizeTupleBounds } from "./InmemDriver";

type Index = {
  tree: InMemoryBinaryPlusTree<Value[], Row>;
  columns: string[];
};

const makeIndexKey = (row: Row, indexColumns: string[]): Value[] => {
  return indexColumns.map((col) => row[col] as Value);
};

export class BptreeInmemDriver implements DBDriver {
  data = new Map<
    string,
    {
      indexes: Record<string, Index>;
      records: Map<string, Row>;
    }
  >();

  constructor() {}

  loadTables(tables: TableDefinition<any>[]): void {
    for (const tableDef of tables) {
      // this.tableDefinitions.set(tableDef.name, tableDef);
      const indexes: Record<string, Index> = {};

      for (const [indexName, columns] of Object.entries(tableDef.indexes)) {
        const cols = [...(columns.cols as string[])];
        if (cols[cols.length - 1] !== "id") {
          cols.push("id");
        }

        indexes[indexName] = {
          tree: new InMemoryBinaryPlusTree<Value[], Row>(15, 30, compareTuple),
          columns: cols,
        };
      }
      this.data.set(tableDef.name, {
        indexes: indexes,
        records: new Map(),
      });
    }
  }

  update(tableName: string, values: Row[]): void {
    const tblData = this.data.get(tableName);
    if (!tblData) {
      throw new Error(`Table ${tableName} not found`);
    }

    // TODO: improve it. No need to delete if index key is not changed. Here is a draft:
    // const toDeleteAndInsert: Row[] = [];
    //
    // for (const record of values) {
    //   const existing = tblData.records.get(record.id);
    //   if (!existing) {
    //     toDeleteAndInsert.push(record);
    //     continue;
    //   }
    //   const oldIndexKey = makeIndexKey(existing, tblData.indexes["id"].columns);
    //   const newIndexKey = makeIndexKey(record, tblData.indexes["id"].columns);
    //
    //   if (compareTuple(oldIndexKey, newIndexKey) === 0) {
    //     tblData.records.set(record.id, record);
    //   } else {
    //     toDeleteAndInsert.push(record);
    //   }
    // }

    this.delete(
      tableName,
      values.map((v) => v.id),
    );
    this.insert(tableName, values);
  }

  insert(tableName: string, values: Row[]): void {
    const tblData = this.data.get(tableName);
    if (!tblData) {
      throw new Error(`Table ${tableName} not found`);
    }

    // const ids = new Set<string>();
    //
    // for (const { id } of values) {
    //   if (ids.has(id)) {
    //     throw new Error("Record already exists");
    //   }
    //   ids.add(id);
    // }

    // for (const record of values) {
    //   tblData.records.set(record.id, record);
    // }

    for (const index of Object.values(tblData.indexes)) {
      for (const record of values) {
        index.tree.set(makeIndexKey(record, index.columns), record);
      }
    }
  }

  delete(tableName: string, values: string[]): void {
    const tblData = this.data.get(tableName);
    if (!tblData) {
      throw new Error(`Table ${tableName} not found`);
    }

    for (const id of values) {
      const record = tblData.records.get(id);
      if (!record) continue;

      tblData.records.delete(id);

      for (const index of Object.values(tblData.indexes)) {
        index.tree.delete(makeIndexKey(record, index.columns));
      }
    }
  }

  *intervalScan(
    tableName: string,
    indexName: string,
    options: ScanOptions,
  ): Generator<unknown> {
    const tableData = this.data.get(tableName);
    if (!tableData) {
      throw new Error(`Table ${tableName} not found`);
    }
    const index = tableData.indexes[indexName as string];

    if (!index) throw new Error("Index not found");

    if (options?.limit === 0) return;

    const normalizedBounds = normalizeTupleBounds(
      options || {},
      index.columns.length,
    );

    const idx = tableData.indexes[indexName as string];
    if (!idx) throw new Error("Index not found");

    const results = idx.tree.list({
      ...normalizedBounds,
      limit: options?.limit ?? undefined,
    });

    for (const result of results) {
      yield result.value;
    }
  }

  *hashScan(table: string, column: string, ids: string[]): Generator<unknown> {
    if (column !== "id") {
      throw new Error("hash scan only supports id column");
    }

    const tblData = this.data.get(table);
    if (!tblData) {
      throw new Error(`Table ${table} not found`);
    }

    for (const id of ids) {
      if (!tblData.records.has(id)) {
        continue;
      }

      yield tblData.records.get(id);
    }
  }
}
