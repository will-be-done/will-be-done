import type { DBCmd } from "../commands/async";
import type {
  ExtractIndexes,
  ExtractSchema,
  TableDefinition,
} from "../schema/table";
import type { SelectOptions, Trait, WhereClause } from "./primitives";

export interface HyperDB {
  intervalScan<
    TTable extends TableDefinition,
    K extends keyof ExtractIndexes<TTable>,
  >(
    table: TTable,
    indexName: K,
    clauses: WhereClause[],
    selectOptions?: SelectOptions,
  ): Generator<DBCmd, ExtractSchema<TTable>[]>;
  insert<TTable extends TableDefinition>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ): Generator<DBCmd, void>;
  upsert<TTable extends TableDefinition>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ): Generator<DBCmd, void>;
  delete<TTable extends TableDefinition>(
    table: TTable,
    ids: string[],
  ): Generator<DBCmd, void>;
  withTraits(...trait: Trait[]): HyperDB;
  getTraits(): Trait[];

  beginTx(): Generator<DBCmd, HyperDBTx>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  loadTables(tables: TableDefinition<any, any>[]): Generator<DBCmd, void>;
}

export interface HyperDBTx extends HyperDB {
  commit(): Generator<DBCmd, void>;
  rollback(): Generator<DBCmd, void>;
}
