import { convertWhereToBound } from "../core/query/bounds";
import type { DBCmd } from "../commands/async";
import type { HyperDBTx } from "../core/contracts";
import type { DBDriverTX } from "../core/driver";
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
import { refVar, type RefVar } from "../utils";

type OriginalDB = {
  options: CodecOptions;
  getTraits(): Trait[];
};

function* performScan(
  driver: DBDriverTX,
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
  driver: DBDriverTX,
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
  driver: DBDriverTX,
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
  driver: DBDriverTX,
  table: TableDefinition,
  ids: string[],
) {
  yield* driver.delete(table.tableName, ids);
}

export class DBTx implements HyperDBTx {
  driver: DBDriverTX;
  originalDB: OriginalDB;
  traits: Trait[] = [];
  txCounter: RefVar<number>;
  isFinished: RefVar<boolean>;
  options: CodecOptions;

  constructor(
    originalDB: OriginalDB,
    driverTx: DBDriverTX,
    txCounter: RefVar<number> = refVar(1),
    isFinished: RefVar<boolean> = refVar(false),
    currentTraits: Trait[] = [],
    options: CodecOptions = originalDB.options,
  ) {
    this.originalDB = originalDB;
    this.driver = driverTx;
    this.txCounter = txCounter;
    this.isFinished = isFinished;
    this.traits = currentTraits;
    this.options = options;
  }

  *loadTables(): Generator<DBCmd, void> {
    throw new Error("Not supported");
  }

  withTraits(...traits: Trait[]): HyperDBTx {
    return new DBTx(
      this.originalDB,
      this.driver,
      this.txCounter,
      this.isFinished,
      [...this.traits, ...traits],
      this.options,
    );
  }

  getTraits(): Trait[] {
    return [...this.traits, ...this.originalDB.getTraits()];
  }

  *beginTx(): Generator<DBCmd, HyperDBTx> {
    if (this.isFinished.val) {
      throw new Error("Transaction is finished");
    }

    this.txCounter.val++;

    return this;
  }

  *commit(): Generator<DBCmd> {
    if (this.isFinished.val) {
      throw new Error("Transaction is finished");
    }

    this.txCounter.val--;
    if (this.txCounter.val !== 0) return;

    this.isFinished.val = true;
    yield* this.driver.commit();
  }

  *rollback(): Generator<DBCmd> {
    if (this.isFinished.val) {
      throw new Error("Transaction is finished");
    }
    this.isFinished.val = true;
    yield* this.driver.rollback();
  }

  *intervalScan<
    TTable extends TableDefinition,
    K extends keyof ExtractIndexes<TTable>,
  >(
    table: TTable,
    indexName: K,
    clauses: WhereClause[],
    selectOptions?: SelectOptions,
  ): Generator<DBCmd, ExtractSchema<TTable>[]> {
    if (this.isFinished.val) {
      throw new Error("Transaction is finished");
    }

    return yield* performScan(
      this.driver,
      table,
      indexName as string,
      clauses,
      this.options,
      selectOptions,
    ) as Generator<DBCmd, ExtractSchema<TTable>[]>;
  }

  *insert<TTable extends TableDefinition>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ): Generator<DBCmd> {
    if (this.isFinished.val) {
      throw new Error("Transaction is finished");
    }

    yield* performInsert(this.driver, table, records as Row[], this.options);
  }

  *upsert<TTable extends TableDefinition>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ): Generator<DBCmd> {
    if (this.isFinished.val) {
      throw new Error("Transaction is finished");
    }

    yield* performUpsert(this.driver, table, records as Row[], this.options);
  }

  *delete<TTable extends TableDefinition>(
    table: TTable,
    ids: string[],
  ): Generator<DBCmd> {
    if (this.isFinished.val) {
      throw new Error("Transaction is finished");
    }

    yield* performDelete(this.driver, table, ids);
  }
}
