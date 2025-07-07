/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Database } from "sql.js";
import type {
  DBDriver,
  Row,
  SelectOptions,
  Tuple,
  TupleScanOptions,
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

  insert(tableName: string, values: Record<string, unknown>[]): void {
    if (values.length === 0) return;

    const allValues = chunk(values, 12000);
    for (const values of allValues) {
      const valuesQ = values.map(() => "(?, ?)").join(", ");
      const insertSQL = `INSERT OR REPLACE INTO ${tableName} (id, data) VALUES ${valuesQ}`;

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

  // *equalScan(
  //   table: string,
  //   indexName: string,
  //   values: Value[],
  // ): Generator<unknown> {
  //   const tableDef = this.tableDefinitions.get(table);
  //   if (!tableDef) {
  //     throw new Error(`Table ${table} not found`);
  //   }
  //
  //   const indexDef = tableDef.indexes[indexName];
  //   if (!indexDef) throw new Error(`Index ${indexName} not found`);
  //
  //   if (indexDef.type !== "equal")
  //     throw new Error("equal scan only supports equal indexes");
  //   if (indexDef.col !== "id")
  //     throw new Error("equal scan only supports id column");
  //
  //   const allIds = chunk(values, 32000);
  //   for (const values of allIds) {
  //     const placeholders = values.map(() => "?").join(", ");
  //     const sql = `SELECT data FROM ${table} WHERE id IN (${placeholders})`;
  //
  //     const q = this.db.prepare(sql);
  //     try {
  //       q.bind(values as string[]);
  //
  //       while (q.step()) {
  //         const res = q.get();
  //
  //         const record = JSON.parse(res[0] as string) as unknown;
  //         yield record;
  //       }
  //     } catch (error) {
  //       throw new Error(`Hash id sacn failed for index ${table}: ${error}`);
  //     } finally {
  //       q.free();
  //     }
  //   }
  // }

  *intervalScan(
    table: string,
    indexName: string,
    options: TupleScanOptions[],
    selectOptions: SelectOptions,
  ): Generator<unknown> {
    const { where, params } = this.buildWhereClause(indexName, table, options);
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
    allOptions: TupleScanOptions[],
  ): { where: string; params: any[] } {
    const tableDef = this.tableDefinitions.get(tableName);
    if (!tableDef) {
      throw new Error(`Table ${tableName} not found`);
    }

    const indexDef = tableDef.indexes[indexName];
    if (!indexDef) throw new Error(`Index ${indexName} not found`);

    const indexColumns = indexDef.cols;

    const conditions: string[][] = [];
    const params: any[] = [];

    for (const options of allOptions) {
      const currentCond: string[] = [];
      // Handle tuple comparisons using row value constructors (supported in SQLite)
      const buildTupleComparison = (operator: string, values: Tuple) => {
        const columnPaths = indexColumns
          .slice(0, values.length)
          .map((col) => `json_extract(data, '$.${String(col)}')`);

        if (values.length === 1) {
          // Simple case: single column
          currentCond.push(`${columnPaths[0]} ${operator} ?`);
          params.push(values[0]);
        } else {
          // Use row value constructor for tuple comparison
          const columnList = columnPaths.join(", ");
          const valueList = values.map(() => "?").join(", ");
          currentCond.push(`(${columnList}) ${operator} (${valueList})`);
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

      conditions.push(currentCond);
    }

    const whereClause =
      params.length > 0
        ? `WHERE ${conditions.map((cond) => `(${cond.join(" AND ")})`).join(" OR ")}`
        : "";
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
