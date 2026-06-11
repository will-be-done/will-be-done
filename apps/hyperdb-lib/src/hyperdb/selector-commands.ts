/* eslint-disable @typescript-eslint/no-explicit-any */
import type { TupleScanOptions } from "./db";
import type { SelectQuery } from "./query";
import type { TableDefinition } from "./table";

const selectRangeType = "selectRange";

export type SelectRangeCmd = {
  type: typeof selectRangeType;
  table: TableDefinition<any>;
  index: string;
  selectQuery: SelectQuery;
  bounds: TupleScanOptions[];
};

export const isSelectRangeCmd = (cmd: unknown): cmd is SelectRangeCmd =>
  cmd instanceof Object &&
  cmd !== null &&
  (cmd as { type?: unknown }).type === selectRangeType;
