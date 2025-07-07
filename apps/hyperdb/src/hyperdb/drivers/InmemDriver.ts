/* eslint-disable @typescript-eslint/no-explicit-any */
import { orderedArray } from "../utils/ordered-array.ts";
import {
  type DBDriver,
  type Row,
  type Tuple,
  type ScanValue,
  type TupleScanOptions,
  type SelectOptions,
} from "../db.ts";
import { compareTuple, normalizeTupleBounds } from "./tuple.ts";
import type { TableDefinition } from "../table.ts";

type InmemIndex = {
  isUnique: boolean;
  columns: string[];
  data: { keys: Tuple; value: Row }[];
};

export class InmemDriver implements DBDriver {
  data = new Map<
    string,
    {
      indexes: Record<string, InmemIndex>;
      records: Map<string, Row>;
    }
  >();

  private orderedArrayHelper = orderedArray(
    (item: { keys: Tuple; value: unknown }) => item.keys,
    compareTuple,
  );

  constructor() {}

  update(tableName: string, values: Row[]): void {
    const tblData = this.data.get(tableName);
    if (!tblData) {
      throw new Error(`Table ${tableName} not found`);
    }

    const ids = values.map((v) => v.id);

    this.delete(tableName, ids);
    this.insert(tableName, values);
  }

  // values is "id" of Row
  delete(tableName: string, values: string[]): void {
    const tblData = this.data.get(tableName);
    if (!tblData) {
      throw new Error(`Table ${tableName} not found`);
    }

    for (const id of values) {
      tblData.records.delete(id);

      for (const index of Object.values(tblData.indexes)) {
        const idHelper = orderedArray(
          (item: { keys: Tuple; value: unknown }) => (item.value as any).id,
          (a, b) => (a === b ? 0 : a > b ? 1 : -1),
        );

        const result = idHelper.search(index.data, id);
        if (result.found !== undefined) {
          index.data.splice(result.found, 1);
        }
      }
    }
  }

  loadTables(tables: TableDefinition<any>[]): void {
    for (const tableDef of tables) {
      // this.tableDefinitions.set(tableDef.name, tableDef);
      const indexes: Record<string, InmemIndex> = {};

      for (const [indexName, columns] of Object.entries(tableDef.indexes)) {
        indexes[indexName] = {
          isUnique: false,
          data: [],
          columns: columns.cols as string[],
        };
      }
      this.data.set(tableDef.tableName, {
        indexes: indexes,
        records: new Map(),
      });
    }
  }

  *equalScan(table: string, column: string, ids: string[]): Generator<unknown> {
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

  *intervalScan(
    tableName: string,
    indexName: string,
    options: TupleScanOptions,
  ): Generator<unknown> {
    const tableData = this.data.get(tableName);
    if (!tableData) {
      throw new Error(`Table ${tableName} not found`);
    }
    const index = tableData.indexes[indexName as string];

    const normalizedBounds = normalizeTupleBounds(
      options || {},
      index.columns.length,
    );
    const { gte, lte, gt, lt } = {
      ...normalizedBounds,
    };

    let startIdx = 0;
    let endIdx = index.data.length - 1;

    // Find starting position using search
    if (gte) {
      const result = this.orderedArrayHelper.searchFirst(index.data, gte);
      startIdx = result.found !== undefined ? result.found : result.closest;
    } else if (gt) {
      const result = this.orderedArrayHelper.searchLast(index.data, gt);
      startIdx = result.found !== undefined ? result.found + 1 : result.closest;
    }

    // Find ending position using search
    if (lte) {
      const result = this.orderedArrayHelper.searchLast(index.data, lte);
      endIdx = result.found !== undefined ? result.found : result.closest - 1;
    } else if (lt) {
      const result = this.orderedArrayHelper.searchFirst(index.data, lt);
      endIdx =
        result.found !== undefined ? result.found - 1 : result.closest - 1;
    }

    for (let i = startIdx; i <= endIdx && i < index.data.length; i++) {
      yield index.data[i].value;
    }
  }

  insert(tableName: string, values: Row[]): void {
    const tblData = this.data.get(tableName);
    if (!tblData) {
      throw new Error(`Table ${tableName} not found`);
    }

    const ids = new Set<string>();

    for (const { id } of values) {
      if (ids.has(id)) {
        throw new Error("Record already exists");
      }
      ids.add(id);
    }

    for (const record of values) {
      if (tblData.records.has(record.id)) {
        throw new Error("Record already exists");
      }

      tblData.records.set(record.id, record);

      for (const index of Object.values(tblData.indexes)) {
        const keys = index.columns.map((key) => record[key] as ScanValue);

        this.orderedArrayHelper.insertAfter(index.data, {
          keys,
          value: record,
        });
      }
    }
  }
}
