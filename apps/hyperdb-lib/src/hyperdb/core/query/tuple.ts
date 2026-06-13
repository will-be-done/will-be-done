/* eslint-disable @typescript-eslint/no-explicit-any */
import { sortBy, omitBy } from "es-toolkit";
import {
  MAX,
  MIN,
  type Row,
  type ScanValue,
  type Tuple,
  type TupleScanOptions,
} from "../primitives";
import { UnreachableError } from "../../utils";
import type { TableDefinition } from "../../schema/table";

const encodingByte = {
  null: "b",
  bigint: "c",
  float: "d",
  string: "e",
  bytes: "f",
  virtual: "z",
} as const;

type EncodingType = keyof typeof encodingByte;
type StoredEncodingType =
  | "missing"
  | "null"
  | "bigint"
  | "float"
  | "boolean"
  | "string"
  | "bytes"
  | "array"
  | "object"
  | "virtual";

const encodingRank = sortBy(
  Object.entries(encodingByte) as [EncodingType, string][],
  [(obj: [EncodingType, string]): string => obj[1]],
).map(([key]) => key as EncodingType);

export function encodingTypeOf(value: ScanValue): EncodingType {
  if (value === null || value === undefined) {
    return "null";
  }
  if (value === true || value === false) {
    return "float";
  }
  if (typeof value === "bigint") {
    return "bigint";
  }
  if (typeof value === "string") {
    return "string";
  }
  if (typeof value === "number") {
    return "float";
  }
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    return "bytes";
  }
  if (value === MIN || value === MAX) {
    return "virtual";
  }

  throw new UnreachableError(value, "Unknown value type");
}

export function compareValue(a: ScanValue, b: ScanValue): number {
  if (a === b) return 0;

  const at = encodingTypeOf(a);
  const bt = encodingTypeOf(b);
  if (at === bt) {
    if (at === "float") {
      return compare(a as number, b as number);
    } else if (at === "bigint") {
      return compare(a as bigint, b as bigint);
    } else if (at === "null") {
      return 0;
    } else if (at === "string") {
      return compare(a as string, b as string);
    } else if (at === "bytes") {
      return compareArrays(bytesOf(a), bytesOf(b));
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
  } else if (b == MAX) {
    return -1;
  } else if (a == MIN) {
    return -1;
  } else if (a == MAX) {
    return 1;
  }

  return compare(encodingRank.indexOf(at), encodingRank.indexOf(bt));
}

function isEncodedObject(
  value: unknown,
): value is { $hyperdbType?: unknown; value?: unknown } {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !(value instanceof ArrayBuffer) &&
    !ArrayBuffer.isView(value)
  );
}

function storedEncodingTypeOf(value: unknown): StoredEncodingType {
  if (value === MIN || value === MAX) {
    return "virtual";
  }
  if (value === undefined) {
    return "missing";
  }
  if (value === null) {
    return "null";
  }
  if (typeof value === "bigint") {
    return "bigint";
  }
  if (
    isEncodedObject(value) &&
    value.$hyperdbType === "bigint" &&
    typeof value.value === "string"
  ) {
    return "bigint";
  }
  if (typeof value === "number") {
    return "float";
  }
  if (typeof value === "boolean") {
    return "boolean";
  }
  if (typeof value === "string") {
    return "string";
  }
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    return "bytes";
  }
  if (
    isEncodedObject(value) &&
    (value.$hyperdbType === "arrayBuffer" || value.$hyperdbType === "bytes")
  ) {
    return "bytes";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  if (isEncodedObject(value)) {
    return "object";
  }

  throw new UnreachableError(value as never, "Unknown stored value type");
}

const storedEncodingRank: StoredEncodingType[] = [
  "missing",
  "null",
  "bigint",
  "float",
  "boolean",
  "string",
  "bytes",
  "array",
  "object",
  "virtual",
];

function bytesOf(value: unknown): number[] {
  if (value instanceof ArrayBuffer) {
    return Array.from(new Uint8Array(value));
  }
  if (ArrayBuffer.isView(value)) {
    return Array.from(
      new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
    );
  }
  if (isEncodedObject(value) && Array.isArray(value.value)) {
    return value.value as number[];
  }
  return [];
}

function bigintOf(value: unknown): bigint {
  if (typeof value === "bigint") {
    return value;
  }
  if (
    isEncodedObject(value) &&
    value.$hyperdbType === "bigint" &&
    typeof value.value === "string"
  ) {
    return BigInt(value.value);
  }
  throw new UnreachableError(value as never, "Expected bigint value");
}

function compareArrays(a: readonly unknown[], b: readonly unknown[]): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const result = compareStoredValue(a[i], b[i]);
    if (result !== 0) return result;
  }

  return compare(a.length, b.length);
}

function compareObjects(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): number {
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  const keyComparison = compareArrays(aKeys, bKeys);
  if (keyComparison !== 0) return keyComparison;

  for (const key of aKeys) {
    const valueComparison = compareStoredValue(a[key], b[key]);
    if (valueComparison !== 0) return valueComparison;
  }

  return 0;
}

export function compareStoredValue(a: unknown, b: unknown): number {
  if (a === b) return 0;

  const at = storedEncodingTypeOf(a);
  const bt = storedEncodingTypeOf(b);

  if (at !== bt) {
    if (b === MIN) return 1;
    if (b === MAX) return -1;
    if (a === MIN) return -1;
    if (a === MAX) return 1;

    return compare(storedEncodingRank.indexOf(at), storedEncodingRank.indexOf(bt));
  }

  if (at === "virtual") {
    if (a === MAX && b === MIN) return 1;
    if (a === MIN && b === MAX) return -1;
    return 0;
  }
  if (at === "missing" || at === "null") {
    return 0;
  }
  if (at === "bigint") {
    return compare(bigintOf(a), bigintOf(b));
  }
  if (at === "float") {
    return compare(a as number, b as number);
  }
  if (at === "boolean") {
    return compare(Number(a), Number(b));
  }
  if (at === "string") {
    return compare(a as string, b as string);
  }
  if (at === "bytes") {
    return compareArrays(bytesOf(a), bytesOf(b));
  }
  if (at === "array") {
    return compareArrays(a as unknown[], b as unknown[]);
  }
  if (at === "object") {
    return compareObjects(
      a as Record<string, unknown>,
      b as Record<string, unknown>,
    );
  }

  throw new UnreachableError(at);
}

export function compareStoredTuple(a: unknown[], b: unknown[]) {
  const len = Math.min(a.length, b.length);

  for (let i = 0; i < len; i++) {
    const dir = compareStoredValue(a[i], b[i]);
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

function compare<K extends string | number | boolean | bigint>(
  a: K,
  b: K,
): number {
  if (a > b) {
    return 1;
  }
  if (a < b) {
    return -1;
  }
  return 0;
}
