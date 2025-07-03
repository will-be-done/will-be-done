/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Database } from "sql.js";
import type {
  DBDriver,
  ScanOptions,
  TableDefinition,
  Tuple,
} from "../db.ts";
import initSqlJs from "sql.js";

export class SqlDriver implements DBDriver {
  private db: Database;
  private tableDefinitions = new Map<string, TableDefinition<any>>();

  constructor(db: Database) {
    this.db = db;
  }
  *selectKey(
    table: string,
    indexName: string,
    options: ScanOptions,
  ): Generator<unknown> {
    const { where, params } = this.buildWhereClause(indexName, table, options);
    const orderClause = this.buildOrderClause(indexName, table);
    const limitClause =
      options.limit !== undefined ? `LIMIT ${options.limit}` : "";

    const sql = `
      SELECT data FROM ${table}
      ${where}
      ${orderClause}
      ${limitClause}
    `.trim();
    console.log(sql);

    const q = this.db.prepare(sql);
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

  private buildWhereClause(
    indexName: string,
    tableName: string,
    options: ScanOptions,
  ): { where: string; params: any[] } {
    const tableDef = this.tableDefinitions.get(tableName);
    if (!tableDef) {
      throw new Error(`Table ${tableName} not found`);
    }

    const indexColumns = tableDef.indexes[indexName].cols;
    if (!indexColumns) {
      throw new Error(`Index ${indexName} not found on table ${tableName}`);
    }

    const conditions: string[] = [];
    const params: any[] = [];

    // Handle tuple comparisons using row value constructors (supported in SQLite)
    const buildTupleComparison = (operator: string, values: Tuple) => {
      const columnPaths = indexColumns
        .slice(0, values.length)
        .map((col) => `json_extract(data, '$.${String(col)}')`);

      if (values.length === 1) {
        // Simple case: single column
        conditions.push(`${columnPaths[0]} ${operator} ?`);
        params.push(values[0]);
      } else {
        // Use row value constructor for tuple comparison
        const columnList = columnPaths.join(", ");
        const valueList = values.map(() => "?").join(", ");
        conditions.push(`(${columnList}) ${operator} (${valueList})`);
        params.push(...values);
      }
    };

    if (options.gt) {
      buildTupleComparison(">", options.gt);
    }
    if (options.gte) {
      buildTupleComparison(">=", options.gte);
    }
    if (options.lt) {
      buildTupleComparison("<", options.lt);
    }
    if (options.lte) {
      buildTupleComparison("<=", options.lte);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    return { where: whereClause, params };
  }

  private buildOrderClause(
    indexName: string,
    tableName: string,
    reverse: boolean = false,
  ): string {
    const tableDef = this.tableDefinitions.get(tableName);
    if (!tableDef) {
      return "";
    }

    const indexColumns = tableDef.indexes[indexName];
    if (!indexColumns) {
      return "";
    }

    const orderColumns = indexColumns.cols
      .map((col) => {
        const jsonPath = `json_extract(data, '$.${String(col)}')`;
        return `${jsonPath} ${reverse ? "DESC" : "ASC"}`;
      })
      .join(", ");

    return `ORDER BY ${orderColumns}`;
  }

  insert(tableName: string, values: Record<string, unknown>[]): void {
    const valuesQ = values.map(() => "(?, ?)").join(", ");
    const insertSQL = `INSERT INTO ${tableName} (id, data) VALUES ${valuesQ}`;

    this.db.exec(
      insertSQL,
      // @ts-expect-error it's ok
      values.flatMap((v) => [v.id, JSON.stringify(v)]),
    );

    console.log(insertSQL);
  }

  loadTables(tableDefinitions: TableDefinition<any>[]): void {
    for (const tableDef of tableDefinitions) {
      this.createTable(tableDef.name);
      this.createIndexes(tableDef);
      this.tableDefinitions.set(tableDef.name, tableDef);
    }
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
    for (const [indexName, { cols }] of Object.entries(tableDef.indexes)) {
      // Create a composite index using JSON path expressions
      const columnPaths = cols
        .map((col) => `json_extract(data, '$.${String(col)}') ASC`)
        .join(", ");
      const createIndexSQL = `
          CREATE INDEX IF NOT EXISTS idx_${tableDef.name}_${indexName} 
          ON ${tableDef.name}(${columnPaths})
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
