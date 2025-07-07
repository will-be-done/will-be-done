/* eslint-disable @typescript-eslint/no-explicit-any */
import type { TupleScanOptions } from "./db";
import type { WhereClause } from "./query";
import type { IndexConfig } from "./table";

export const convertWhereToBound = (
  index: IndexConfig<any>,
  where: WhereClause[],
): TupleScanOptions[] => {
  return [];
};
