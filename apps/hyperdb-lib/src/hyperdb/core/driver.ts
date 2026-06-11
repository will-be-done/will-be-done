/* eslint-disable @typescript-eslint/no-explicit-any */
import type { DBCmd } from "../commands/async";
import type { TableDefinition } from "../schema/table";
import type { Row, SelectOptions, WhereClause } from "./primitives";

export type BaseDBDriverOperations = {
  intervalScan(
    table: string,
    indexName: string,
    clauses: WhereClause[],
    selectOptions: SelectOptions,
  ): Generator<DBCmd, unknown[]>;
  insert(tableName: string, values: Row[]): Generator<DBCmd>;
  upsert(tableName: string, values: Row[]): Generator<DBCmd>;
  delete(tableName: string, values: string[]): Generator<DBCmd>;
};

export interface DBDriver extends BaseDBDriverOperations {
  loadTables(table: TableDefinition<any, any>[]): Generator<DBCmd>;
  beginTx(): Generator<DBCmd, DBDriverTX>;
}

export interface DBDriverTX extends BaseDBDriverOperations {
  commit(): Generator<DBCmd>;
  rollback(): Generator<DBCmd>;
}
