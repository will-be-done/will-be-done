/* eslint-disable @typescript-eslint/no-explicit-any */
import { convertWhereToBound } from "../core/query/bounds";
import type { DBCmd } from "../commands/async";
import type { HyperDB } from "../core/contracts";
import type { BaseDBDriverOperations, DBDriver } from "../core/driver";
import type {
  Row,
  SelectOptions,
  Trait,
  WhereClause,
} from "../core/primitives";
import {
  normalizeRecordsForDriver,
  validateRecordsFromDriver,
  type CodecOptions,
} from "../storage/codec";
import type {
  ExtractIndexes,
  ExtractSchema,
  TableDefinition,
} from "../schema/table";
import { DBTx } from "./db-tx";

function* performScan(
  driver: BaseDBDriverOperations,
  table: TableDefinition,
  indexName: string,
  clauses: WhereClause[],
  options: CodecOptions,
  selectOptions?: SelectOptions,
) {
  if (clauses.length === 0) {
    throw new Error("scan clauses must be provided");
  }
  if (selectOptions && selectOptions.limit === 0) {
    return [];
  }

  const indexConfig = table.indexes[indexName as string];
  if (!indexConfig) {
    throw new Error(
      `Index not found: ${indexName as string} for table: ${table.tableName}`,
    );
  }

  // Validation-only; driver handles conversion.
  convertWhereToBound(indexConfig.cols as string[], clauses);

  const records = yield* driver.intervalScan(
    table.tableName,
    indexName as string,
    clauses,
    selectOptions || {},
  );

  return validateRecordsFromDriver(table, records, options);
}

function* performInsert(
  driver: BaseDBDriverOperations,
  table: TableDefinition,
  records: Row[],
  options: CodecOptions,
) {
  if (records.length === 0) return;
  yield* driver.insert(
    table.tableName,
    normalizeRecordsForDriver(table, records, options),
  );
}

function* performUpsert(
  driver: BaseDBDriverOperations,
  table: TableDefinition,
  records: Row[],
  options: CodecOptions,
) {
  if (records.length === 0) return;
  yield* driver.upsert(
    table.tableName,
    normalizeRecordsForDriver(table, records, options),
  );
}

function* performDelete(
  driver: BaseDBDriverOperations,
  table: TableDefinition,
  ids: string[],
) {
  if (ids.length === 0) return;
  yield* driver.delete(table.tableName, ids);
}

export class DB implements HyperDB {
  driver: DBDriver;
  tables: TableDefinition<any, any>[] = [];
  traits: Trait[] = [];
  options: CodecOptions;

  constructor(
    driver: DBDriver,
    tables: TableDefinition<any, any>[] = [],
    traitsOrOptions: Trait[] | Partial<CodecOptions> = [],
    options: Partial<CodecOptions> = {},
  ) {
    this.tables = tables;
    this.traits = Array.isArray(traitsOrOptions) ? traitsOrOptions : [];
    this.options = {
      runtimeValidation: false,
      ...(Array.isArray(traitsOrOptions) ? options : traitsOrOptions),
    };
    this.driver = driver;
  }

  withTraits(...traits: Trait[]): HyperDB {
    return new DB(
      this.driver,
      this.tables,
      [...this.traits, ...traits],
      this.options,
    );
  }

  getTraits(): Trait[] {
    return this.traits;
  }

  *loadTables(tables: TableDefinition<any, any>[]): Generator<DBCmd, void> {
    this.tables = tables;
    yield* this.driver.loadTables(tables);
  }

  *beginTx(): Generator<DBCmd, DBTx> {
    const tx = yield* this.driver.beginTx();
    return new DBTx(this, tx);
  }

  *intervalScan<
    TTable extends TableDefinition<any, any>,
    K extends keyof ExtractIndexes<TTable>,
  >(
    table: TTable,
    indexName: K,
    clauses: WhereClause[],
    selectOptions?: SelectOptions,
  ): Generator<DBCmd, ExtractSchema<TTable>[]> {
    return yield* performScan(
      this.driver,
      table,
      indexName as string,
      clauses,
      this.options,
      selectOptions,
    ) as Generator<DBCmd, ExtractSchema<TTable>[]>;
  }

  *insert<TTable extends TableDefinition<any, any>>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ) {
    yield* performInsert(this.driver, table, records as Row[], this.options);
  }

  *upsert<TTable extends TableDefinition<any, any>>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ) {
    yield* performUpsert(this.driver, table, records as Row[], this.options);
  }

  *delete<TTable extends TableDefinition<any, any>>(
    table: TTable,
    ids: string[],
  ) {
    yield* performDelete(this.driver, table, ids);
  }
}
