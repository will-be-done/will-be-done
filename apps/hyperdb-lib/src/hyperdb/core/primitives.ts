export const MIN = Symbol("MIN");
export const MAX = Symbol("MAX");

export type BinaryValue = ArrayBuffer | ArrayBufferView;
export type Value = string | number | bigint | boolean | null | BinaryValue;
export type ScanValue = Value | typeof MIN | typeof MAX;
export type Tuple = ScanValue[];
export type TupleScanOptions = {
  lte?: Tuple;
  gte?: Tuple;
  lt?: Tuple;
  gt?: Tuple;
};

export type WhereClause = {
  lt?: { col: string; val: Value }[];
  lte?: { col: string; val: Value }[];
  gt?: { col: string; val: Value }[];
  gte?: { col: string; val: Value }[];
  eq?: { col: string; val: Value }[];
};

export type SelectOptions = {
  limit?: number;
  order?: "asc" | "desc";
};

export type Trait = { type: string };

export type Row = Record<string, unknown> & {
  id: string;
};
