/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Database } from "sql.js";
import type {
  DBDriver,
  Row,
  SelectOptions,
  WhereClause,
  Value,
  DBDriverTX,
} from "../db.ts";
import initSqlJs from "sql.js";
import { chunk, cloneDeep } from "es-toolkit";
import type { TableDefinition } from "../table.ts";

function performInsertOperation(
  db: Database,
  tableName: string,
  values: Record<string, unknown>[],
): void {
  if (values.length === 0) return;

  const allValues = chunk(values, 12000);
  for (const values of allValues) {
    const valuesQ = values.map(() => "(?, ?)").join(", ");
    const insertSQL = `INSERT OR REPLACE INTO ${tableName} (id, data) VALUES ${valuesQ}`;

    db.exec(
      insertSQL,
      // @ts-expect-error it's ok
      values.flatMap((v) => [v.id, JSON.stringify(v)]),
    );
  }
}

function performUpdateOperation(
  db: Database,
  tableName: string,
  values: Row[],
): void {
  if (values.length === 0) return;

  const allValues = chunk(values, 12000);
  for (const values of allValues) {
    const valuesQ = values.map(() => "(?, ?)").join(", ");
    const updateSQL = `INSERT OR REPLACE INTO ${tableName} (id, data) VALUES ${valuesQ}`;

    db.exec(
      updateSQL,
      values.flatMap((v) => [v.id, JSON.stringify(v)]),
    );
  }
}

function performDeleteOperation(
  db: Database,
  tableName: string,
  values: string[],
): void {
  if (values.length === 0) return;

  const allValues = chunk(values, 12000);
  for (const values of allValues) {
    const placeholders = values.map(() => "?").join(", ");
    const deleteSQL = `DELETE FROM ${tableName} WHERE id IN (${placeholders})`;
    db.exec(deleteSQL, values);
  }
}

function* performScanOperation(
  db: Database,
  tableDefinitions: Map<string, TableDefinition>,
  table: string,
  indexName: string,
  clauses: WhereClause[],
  selectOptions: SelectOptions,
): Generator<unknown> {
  const { where, params } = buildWhereClause(
    indexName,
    table,
    clauses,
    tableDefinitions,
  );
  const orderClause = buildOrderClause(indexName, table, tableDefinitions);
  const limitClause =
    selectOptions.limit !== undefined ? `LIMIT ${selectOptions.limit}` : "";

  const sql = `
    SELECT data FROM ${table}
    ${where}
    ${orderClause}
    ${limitClause}
  `.trim();

  const q = db.prepare(sql);
  try {
    q.bind(params);

    while (q.step()) {
      const res = q.get();
      const record = JSON.parse(res[0] as string) as unknown;
      yield record;
    }
  } catch (error) {
    throw new Error(`Scan failed for index ${indexName}: ${error}`);
  } finally {
    q.free();
  }
}

function buildWhereClause(
  indexName: string,
  tableName: string,
  clauses: WhereClause[],
  tableDefinitions: Map<string, TableDefinition>,
): { where: string; params: any[] } {
  const tableDef = tableDefinitions.get(tableName);
  if (!tableDef) {
    throw new Error(`Table ${tableName} not found`);
  }

  const indexDef = tableDef.indexes[indexName];
  if (!indexDef) throw new Error(`Index ${indexName} not found`);

  const conditions: string[] = [];
  const params: any[] = [];

  for (const clause of clauses) {
    const currentCond: string[] = [];

    const buildColumnComparison = (
      operator: string,
      columnConditions: { col: string; val: Value }[],
    ) => {
      for (const { col, val } of columnConditions) {
        const columnPath = `json_extract(data, '$.${String(col)}')`;
        currentCond.push(`${columnPath} ${operator} ?`);
        params.push(val);
      }
    };

    if (clause.gt) {
      buildColumnComparison(">", clause.gt);
    }
    if (clause.gte) {
      buildColumnComparison(">=", clause.gte);
    }
    if (clause.lt) {
      buildColumnComparison("<", clause.lt);
    }
    if (clause.lte) {
      buildColumnComparison("<=", clause.lte);
    }
    if (clause.eq) {
      buildColumnComparison("=", clause.eq);
    }

    if (currentCond.length > 0) {
      conditions.push(`(${currentCond.join(" AND ")})`);
    }
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" OR ")}` : "";
  return { where: whereClause, params };
}

function buildOrderClause(
  indexName: string,
  tableName: string,
  tableDefinitions: Map<string, TableDefinition>,
  reverse: boolean = false,
): string {
  const tableDef = tableDefinitions.get(tableName);
  if (!tableDef) {
    return "";
  }

  const indexDef = tableDef.indexes[indexName];
  if (!indexDef) {
    return "";
  }

  const indexColumns = indexDef.cols;

  const orderColumns = indexColumns
    .map((col) => {
      const jsonPath = `json_extract(data, '$.${String(col)}')`;
      return `${jsonPath} ${reverse ? "DESC" : "ASC"}`;
    })
    .join(", ");

  return `ORDER BY ${orderColumns}`;
}

class SqlDriverTx implements DBDriverTX {
  private db: Database;
  private tableDefinitions: Map<string, TableDefinition>;
  private committed = false;
  private rolledback = false;
  private onFinish: () => void;

  constructor(
    db: Database,
    tableDefinitions: Map<string, TableDefinition>,
    onFinish: () => void,
  ) {
    this.db = db;
    this.tableDefinitions = tableDefinitions;
    this.db.exec("BEGIN TRANSACTION");
    this.onFinish = onFinish;
  }

  commit(): void {
    if (this.committed || this.rolledback) {
      throw new Error("Transaction already finished");
    }
    this.db.exec("COMMIT");
    this.committed = true;
    this.onFinish();
  }

  rollback(): void {
    if (this.committed || this.rolledback) {
      throw new Error("Transaction already finished");
    }
    this.db.exec("ROLLBACK");
    this.rolledback = true;
    this.onFinish();
  }

  insert(tableName: string, values: Record<string, unknown>[]): void {
    if (this.committed || this.rolledback) {
      throw new Error("Transaction already finished");
    }
    performInsertOperation(this.db, tableName, values);
  }

  update(tableName: string, values: Row[]): void {
    if (this.committed || this.rolledback) {
      throw new Error("Transaction already finished");
    }
    performUpdateOperation(this.db, tableName, values);
  }

  delete(tableName: string, values: string[]): void {
    if (this.committed || this.rolledback) {
      throw new Error("Transaction already finished");
    }
    performDeleteOperation(this.db, tableName, values);
  }

  *intervalScan(
    table: string,
    indexName: string,
    clauses: WhereClause[],
    selectOptions: SelectOptions,
  ): Generator<unknown> {
    if (this.committed || this.rolledback) {
      throw new Error("Transaction already finished");
    }
    yield* performScanOperation(
      this.db,
      this.tableDefinitions,
      table,
      indexName,
      clauses,
      selectOptions,
    );
  }
}

export class SqlDriver implements DBDriver {
  private db: Database;
  private tableDefinitions = new Map<string, TableDefinition>();
  private isInTransaction = false;

  constructor(db: Database) {
    this.db = db;
  }

  beginTx(): DBDriverTX {
    if (this.isInTransaction) {
      throw new Error("can't run while transaction is in progress");
    }

    this.isInTransaction = true;
    return new SqlDriverTx(
      this.db,
      this.tableDefinitions,
      () => (this.isInTransaction = false),
    );
  }

  insert(tableName: string, values: Record<string, unknown>[]): void {
    if (this.isInTransaction) {
      throw new Error("can't run while transaction is in progress");
    }
    if (values.length === 0) return;

    this.db.exec("BEGIN TRANSACTION");
    performInsertOperation(this.db, tableName, values);
    this.db.exec("COMMIT");
  }

  update(tableName: string, values: Row[]): void {
    if (this.isInTransaction) {
      throw new Error("can't run while transaction is in progress");
    }
    if (values.length === 0) return;

    this.db.exec("BEGIN TRANSACTION");
    performUpdateOperation(this.db, tableName, values);
    this.db.exec("COMMIT");
  }

  delete(tableName: string, values: string[]): void {
    if (this.isInTransaction) {
      throw new Error("can't run while transaction is in progress");
    }
    if (values.length === 0) return;

    this.db.exec("BEGIN TRANSACTION");
    performDeleteOperation(this.db, tableName, values);
    this.db.exec("COMMIT");
  }

  *intervalScan(
    table: string,
    indexName: string,
    clauses: WhereClause[],
    selectOptions: SelectOptions,
  ): Generator<unknown> {
    if (this.isInTransaction) {
      throw new Error("can't run while transaction is in progress");
    }

    yield* performScanOperation(
      this.db,
      this.tableDefinitions,
      table,
      indexName,
      clauses,
      selectOptions,
    );
  }

  loadTables(tableDefinitions: TableDefinition<any>[]): void {
    this.db.exec("BEGIN TRANSACTION");
    tableDefinitions = cloneDeep(tableDefinitions);
    for (const tableDef of tableDefinitions) {
      for (const [, indexDef] of Object.entries(tableDef.indexes)) {
        const cols = indexDef.cols;

        if (cols[cols.length - 1] !== "id") {
          cols.push("id");
        }
      }

      this.createTable(tableDef.tableName);
      this.createIndexes(tableDef);
      this.tableDefinitions.set(tableDef.tableName, tableDef);
    }
    this.db.exec("COMMIT");
  }

  private createTable(tableName: string): void {
    // Create main table
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL
      )
    `;
    console.log(createTableSQL);
    this.db.exec(createTableSQL);
  }

  private createIndexes(tableDef: TableDefinition<any>): void {
    for (const [indexName, indexDef] of Object.entries(tableDef.indexes)) {
      const cols = indexDef.cols;

      // Create a composite index using JSON path expressions
      const columnPaths = cols
        .map((col) => `json_extract(data, '$.${String(col)}') ASC`)
        .join(", ");

      // Only make the id index unique, all others should be non-unique
      const isIdIndex = cols.length === 1 && cols[0] === "id";
      const uniqueKeyword = isIdIndex ? "UNIQUE" : "";

      const createIndexSQL = `
          CREATE ${uniqueKeyword} INDEX IF NOT EXISTS idx_${tableDef.tableName}_${indexName} 
          ON ${tableDef.tableName}(${columnPaths})
        `;
      console.log(createIndexSQL);
      this.db.exec(createIndexSQL);
    }
  }

  static async init() {
    try {
      // Try to use sql.js directly (works in Node.js with proper setup)
      const SQL = await initSqlJs();

      return new SqlDriver(new SQL.Database());
    } catch (error) {
      console.error(error);
      throw new Error(
        "sql.js is required but not available. Use HyperDBSQLite.create() for proper async initialization.",
      );
    }
  }
}
