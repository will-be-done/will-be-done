/* eslint-disable @typescript-eslint/no-explicit-any */
import { sortBy, omitBy } from "es-toolkit";
import {
  MAX,
  MIN,
  type Row,
  type ScanValue,
  type Tuple,
  type TupleScanOptions,
} from "../db";
import { UnreachableError } from "../utils";
import type { TableDefinition } from "../table";

const encodingByte = {
  null: "b",
  float: "d",
  string: "e",
  virtual: "z",
} as const;

type EncodingType = keyof typeof encodingByte;

const encodingRank = sortBy(
  Object.entries(encodingByte) as [EncodingType, string][],
  [(obj: [EncodingType, string]): string => obj[1]],
).map(([key]) => key as EncodingType);

export function encodingTypeOf(value: ScanValue): EncodingType {
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

export function compareValue(a: ScanValue, b: ScanValue): number {
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

export function normalizeTupleBounds(
  args: TupleScanOptions,
  tupleCount: number,
): TupleScanOptions {
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
  options?: TupleScanOptions,
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

function compare<K extends string | number | boolean>(a: K, b: K): number {
  if (a > b) {
    return 1;
  }
  if (a < b) {
    return -1;
  }
  return 0;
}
