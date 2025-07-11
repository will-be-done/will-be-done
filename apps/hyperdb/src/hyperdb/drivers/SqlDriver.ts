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

export class SqlDriver implements DBDriver {
  private db: Database;
  private tableDefinitions = new Map<string, TableDefinition>();

  constructor(db: Database) {
    this.db = db;
  }

  beginTx(): DBDriverTX {
    throw new Error("Method not implemented.");
  }

  insert(tableName: string, values: Record<string, unknown>[]): void {
    if (values.length === 0) return;

    const allValues = chunk(values, 12000);
    for (const values of allValues) {
      const valuesQ = values.map(() => "(?, ?)").join(", ");
      const insertSQL = `INSERT INTO ${tableName} (id, data) VALUES ${valuesQ}`;

      this.db.exec(
        insertSQL,
        // @ts-expect-error it's ok
        values.flatMap((v) => [v.id, JSON.stringify(v)]),
      );
      console.log(insertSQL);
    }
  }

  update(tableName: string, values: Row[]): void {
    if (values.length === 0) return;

    const allValues = chunk(values, 12000);
    for (const values of allValues) {
      const valuesQ = values.map(() => "(?, ?)").join(", ");
      const updateSQL = `INSERT OR REPLACE INTO ${tableName} (id, data) VALUES ${valuesQ}`;

      this.db.exec(
        updateSQL,
        values.flatMap((v) => [v.id, JSON.stringify(v)]),
      );
    }
  }

  delete(tableName: string, values: string[]): void {
    if (values.length === 0) return;

    const allValues = chunk(values, 12000);
    for (const values of allValues) {
      const placeholders = values.map(() => "?").join(", ");
      const deleteSQL = `DELETE FROM ${tableName} WHERE id IN (${placeholders})`;
      this.db.exec(deleteSQL, values);
    }
  }

  *intervalScan(
    table: string,
    indexName: string,
    clauses: WhereClause[],
    selectOptions: SelectOptions,
  ): Generator<unknown> {
    const { where, params } = this.buildWhereClause(indexName, table, clauses);
    const orderClause = this.buildOrderClause(indexName, table);
    const limitClause =
      selectOptions.limit !== undefined ? `LIMIT ${selectOptions.limit}` : "";

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
    clauses: WhereClause[],
  ): { where: string; params: any[] } {
    const tableDef = this.tableDefinitions.get(tableName);
    if (!tableDef) {
      throw new Error(`Table ${tableName} not found`);
    }

    const indexDef = tableDef.indexes[indexName];
    if (!indexDef) throw new Error(`Index ${indexName} not found`);

    const conditions: string[] = [];
    const params: any[] = [];

    for (const clause of clauses) {
      const currentCond: string[] = [];

      // Handle individual column conditions
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

  private buildOrderClause(
    indexName: string,
    tableName: string,
    reverse: boolean = false,
  ): string {
    const tableDef = this.tableDefinitions.get(tableName);
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

  loadTables(tableDefinitions: TableDefinition<any>[]): void {
    tableDefinitions = cloneDeep(tableDefinitions);
    for (const tableDef of tableDefinitions) {
      this.createTable(tableDef.tableName);
      this.createIndexes(tableDef);
      this.tableDefinitions.set(tableDef.tableName, tableDef);
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
    for (const [indexName, indexDef] of Object.entries(tableDef.indexes)) {
      const cols = [...indexDef.cols];

      if (cols[cols.length - 1] !== "id") {
        cols.push("id");
      }

      // Create a composite index using JSON path expressions
      const columnPaths = cols
        .map((col) => `json_extract(data, '$.${String(col)}') ASC`)
        .join(", ");
      const createIndexSQL = `
          CREATE UNIQUE INDEX IF NOT EXISTS idx_${tableDef.tableName}_${indexName} 
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
