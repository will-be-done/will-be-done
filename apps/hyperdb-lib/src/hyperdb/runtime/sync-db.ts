import { execSync } from "../core/executor";
import type { HyperDB, HyperDBTx } from "../core/contracts";
import type { SelectOptions, WhereClause } from "../core/primitives";
import type {
  ExtractIndexes,
  ExtractSchema,
  TableDefinition,
} from "../schema/table";

export class SyncDBTx {
  private dbTx: HyperDBTx;
  constructor(dbTx: HyperDBTx) {
    this.dbTx = dbTx;
  }

  intervalScan<
    TTable extends TableDefinition,
    K extends keyof ExtractIndexes<TTable>,
  >(
    table: TTable,
    indexName: K,
    clauses: WhereClause[],
    selectOptions?: SelectOptions,
  ): ExtractSchema<TTable>[] {
    return execSync(
      this.dbTx.intervalScan(table, indexName, clauses, selectOptions),
    );
  }

  insert<TTable extends TableDefinition>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ): void {
    return execSync(this.dbTx.insert(table, records));
  }

  upsert<TTable extends TableDefinition>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ): void {
    return execSync(this.dbTx.upsert(table, records));
  }

  delete<TTable extends TableDefinition>(table: TTable, ids: string[]): void {
    return execSync(this.dbTx.delete(table, ids));
  }

  commit(): void {
    return execSync(this.dbTx.commit());
  }

  rollback(): void {
    return execSync(this.dbTx.rollback());
  }
}

export class SyncDB {
  private db: HyperDB;

  constructor(db: HyperDB) {
    this.db = db;
  }

  loadTables(tables: TableDefinition<any, any>[]): void {
    return execSync(this.db.loadTables(tables));
  }

  beginTx(): SyncDBTx {
    const tx = execSync(this.db.beginTx());
    return new SyncDBTx(tx);
  }

  intervalScan<
    TTable extends TableDefinition,
    K extends keyof ExtractIndexes<TTable>,
  >(
    table: TTable,
    indexName: K,
    clauses: WhereClause[],
    selectOptions?: SelectOptions,
  ): ExtractSchema<TTable>[] {
    return execSync(
      this.db.intervalScan(table, indexName, clauses, selectOptions),
    );
  }

  insert<TTable extends TableDefinition<any, any>>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ): void {
    return execSync(this.db.insert(table, records));
  }

  upsert<TTable extends TableDefinition<any, any>>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ): void {
    return execSync(this.db.upsert(table, records));
  }

  delete<TTable extends TableDefinition<any, any>>(
    table: TTable,
    ids: string[],
  ): void {
    return execSync(this.db.delete(table, ids));
  }
}
