/* eslint-disable @typescript-eslint/no-explicit-any */
import { sortBy, omitBy } from "es-toolkit";
import { orderedArray } from "../utils/ordered-array.ts";
import {
  MAX,
  MIN,
  type Bounds,
  type DBDriver,
  type ScanOptions,
  type TableDefinition,
  type Tuple,
  type Value,
} from "../db.ts";

type InmemIndex = {
  isUnique: boolean;
  columns: string[];
  data: { keys: Tuple; value: unknown }[];
};

const encodingByte = {
  null: "b",
  integer: "c",
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

function normalizeTupleBounds(args: ScanOptions, tupleCount: number): Bounds {
  let gte: Tuple | undefined;
  let gt: Tuple | undefined;
  let lte: Tuple | undefined;
  let lt: Tuple | undefined;

  if (args.gte) {
    gte = [...args.gte, ...new Array(tupleCount - args.gte.length).fill(MIN)];
  } else if (args.gt) {
    gt = [...args.gt, ...new Array(tupleCount - args.gt.length).fill(MIN)];
  }

  if (args.lte) {
    lte = [...args.lte, ...new Array(tupleCount - args.lte.length).fill(MAX)];
  } else if (args.lt) {
    lt = [...args.lt, ...new Array(tupleCount - args.lt.length).fill(MAX)];
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
    return "integer";
  }
  if (typeof value === "string") {
    return "string";
  }
  if (typeof value === "number" && Number.isInteger(value)) {
    return "integer";
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
    if (at === "integer") {
      return compare(a as number, b as number);
    } else if (at === "float") {
      return compare(a as number, b as number);
    } else if (at === "null") {
      return 0;
    } else if (at === "string") {
      return compare(a as string, b as string);
    } else if (at === "virtual") {
      throw new Error("Cannot save virtual values into tuple");
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
export class InmemDriver implements DBDriver {
  data = new Map<
    string,
    {
      indexes: Record<string, InmemIndex>;
    }
  >();

  private orderedArrayHelper = orderedArray(
    (item: { keys: Tuple; value: unknown }) => item.keys,
    compareTuple,
  );

  constructor() {}

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
      });
    }
  }

  *selectKey(
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

  insert(tableName: string, values: Record<string, unknown>[]): void {
    const tblData = this.data.get(tableName);
    if (!tblData) {
      throw new Error(`Table ${tableName} not found`);
    }

    for (const record of values) {
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
