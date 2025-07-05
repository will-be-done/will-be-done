/* eslint-disable @typescript-eslint/no-explicit-any */
import { sortBy, omitBy } from "es-toolkit";
import { orderedArray } from "../utils/ordered-array.ts";
import {
  MAX,
  MIN,
  type Bounds,
  type DBDriver,
  type Row,
  type ScanOptions,
  type TableDefinition,
  type Tuple,
  type Value,
} from "../db.ts";

type InmemIndex = {
  isUnique: boolean;
  columns: string[];
  data: { keys: Tuple; value: Row }[];
};

const encodingByte = {
  null: "b",
  float: "d",
  string: "e",
  virtual: "z",
} as const;

export class UnreachableError extends Error {
  constructor(obj: never, message?: string) {
    super((message + ": " || "Unreachable: ") + obj);
  }
}

type EncodingType = keyof typeof encodingByte;
const encodingRank = sortBy(
  Object.entries(encodingByte) as [EncodingType, string][],
  [(obj: [EncodingType, string]): string => obj[1]],
).map(([key]) => key as EncodingType);

export function normalizeTupleBounds(
  args: ScanOptions,
  tupleCount: number,
): Bounds {
  let gte: Tuple | undefined;
  let gt: Tuple | undefined;
  let lte: Tuple | undefined;
  let lt: Tuple | undefined;

  if (args.gte) {
    gte = [...args.gte, ...new Array(tupleCount - args.gte.length).fill(MIN)];
  } else if (args.gt) {
    gt = [...args.gt, ...new Array(tupleCount - args.gt.length).fill(MAX)];
  }

  if (args.lte) {
    lte = [...args.lte, ...new Array(tupleCount - args.lte.length).fill(MAX)];
  } else if (args.lt) {
    lt = [...args.lt, ...new Array(tupleCount - args.lt.length).fill(MIN)];
  }

  return omitBy({ gte, gt, lte, lt }, (x) => x === undefined);
}

function compare<K extends string | number | boolean>(a: K, b: K): number {
  if (a > b) {
    return 1;
  }
  if (a < b) {
    return -1;
  }
  return 0;
}

export function encodingTypeOf(value: Value): EncodingType {
  if (value === null) {
    return "null";
  }
  if (value === true || value === false) {
    return "float";
  }
  if (typeof value === "string") {
    return "string";
  }
  if (typeof value === "number") {
    return "float";
  }
  if (value === MIN || value === MAX) {
    return "virtual";
  }

  throw new UnreachableError(value, "Unknown value type");
}

export function compareValue(a: Value, b: Value): number {
  const at = encodingTypeOf(a);
  const bt = encodingTypeOf(b);
  if (at === bt) {
    if (at === "float") {
      return compare(a as number, b as number);
    } else if (at === "null") {
      return 0;
    } else if (at === "string") {
      return compare(a as string, b as string);
    } else if (at === "virtual") {
      if (a === MAX && b === MIN) return 1;
      if (a === MIN && b === MAX) return -1;
      return 0;
    } else {
      throw new UnreachableError(at);
    }
  }

  if (b == MIN) {
    return 1;
  }
  if (b == MAX) {
    return -1;
  }

  return compare(encodingRank.indexOf(at), encodingRank.indexOf(bt));
}

export function compareTuple(a: Tuple, b: Tuple) {
  const len = Math.min(a.length, b.length);

  for (let i = 0; i < len; i++) {
    const dir = compareValue(a[i], b[i]);
    if (dir === 0) {
      continue;
    }
    return dir;
  }

  if (a.length > b.length) {
    return 1;
  } else if (a.length < b.length) {
    return -1;
  } else {
    return 0;
  }
}

export const isRowInRange = (
  row: Row,
  table: TableDefinition<any>,
  indexName: string,
  options?: ScanOptions,
) => {
  const indexDef = table.indexes[indexName];

  const { gte, lte, gt, lt } = normalizeTupleBounds(
    options || {},
    indexDef.cols.length,
  );

  const rowTuple = indexDef.cols.map((col) => row[col as string]) as Tuple;

  // Check gte (greater than or equal)
  if (gte && compareTuple(rowTuple, gte) < 0) {
    return false;
  }

  // Check gt (greater than)
  if (gt && compareTuple(rowTuple, gt) <= 0) {
    return false;
  }

  // Check lte (less than or equal)
  if (lte && compareTuple(rowTuple, lte) > 0) {
    return false;
  }

  // Check lt (less than)
  if (lt && compareTuple(rowTuple, lt) >= 0) {
    return false;
  }

  return true;
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
      this.data.set(tableDef.name, {
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
    options: ScanOptions,
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
    const { gte, lte, gt, lt, limit } = {
      ...normalizedBounds,
      limit: options?.limit,
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

    let count = 0;
    for (let i = startIdx; i <= endIdx && i < index.data.length; i++) {
      if (limit !== undefined && count >= limit) {
        break;
      }

      yield index.data[i].value;
      count++;
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
        const keys = index.columns.map((key) => record[key] as Value);

        this.orderedArrayHelper.insertAfter(index.data, {
          keys,
          value: record,
        });
      }
    }
  }
}
