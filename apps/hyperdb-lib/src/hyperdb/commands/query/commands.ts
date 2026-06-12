/* eslint-disable @typescript-eslint/no-explicit-any */
import type { TupleScanOptions, Value } from "../../core/primitives";
import type { TableDefinition } from "../../schema/table";

const selectRangeType = "selectRange";

export type QueryWhereClause = {
  lt: { col: string; val: Value }[];
  lte: { col: string; val: Value }[];
  gt: { col: string; val: Value }[];
  gte: { col: string; val: Value }[];
  eq: { col: string; val: Value }[];
};

export type QueryOrder = "asc" | "desc";

export type SelectQuery<
  TTable extends TableDefinition = TableDefinition,
  K extends string | number = string | number,
> = {
  limit?: number;
  order?: QueryOrder;
  from: TTable;
  index: K;
  where: QueryWhereClause[];
};

export type SelectRangeCmd = {
  type: typeof selectRangeType;
  table: TableDefinition<any>;
  index: string;
  selectQuery: SelectQuery;
  bounds: TupleScanOptions[];
};

export const isSelectRangeCmd = (cmd: unknown): cmd is SelectRangeCmd =>
  typeof cmd === "object" &&
  cmd !== null &&
  typeof (cmd as { type?: unknown }).type === "string" &&
  (cmd as { type?: unknown }).type === selectRangeType;
