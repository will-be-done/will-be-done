import { orderBy, sortBy, omitBy } from "es-toolkit";
import initSqlJs, { type Database } from "sql.js";

type ScanOptions = {
  // prefix?: Tuple;
  lte?: Tuple;
  gte?: Tuple;
  lt?: Tuple;
  gt?: Tuple;
  limit?: number;
};
type Bounds = {
  /** This prevents developers from accidentally using ScanArgs instead of TupleBounds */
  prefix?: never;
  gte?: Tuple;
  gt?: Tuple;
  lte?: Tuple;
  lt?: Tuple;
};

export const MIN = Symbol("MIN");
export const MAX = Symbol("MAX");

function normalizeTupleBounds(args: ScanOptions, tupleCount: number): Bounds {
  let gte: Tuple | undefined;
  let gt: Tuple | undefined;
  let lte: Tuple | undefined;
  let lt: Tuple | undefined;

  if (args.gte) {
    gte = [...args.gte, ...new Array(tupleCount - args.gte.length).fill(MIN)];
  } else if (args.gt) {
    gt = [...args.gt, ...new Array(tupleCount - args.gt.length).fill(MIN)];
  }

  if (args.lte) {
    lte = [...args.lte, ...new Array(tupleCount - args.lte.length).fill(MAX)];
  } else if (args.lt) {
    lt = [...args.lt, ...new Array(tupleCount - args.lt.length).fill(MAX)];
  }

  return omitBy({ gte, gt, lte, lt }, (x) => x === undefined);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// Base schema type that all table records must extend
type TableSchema = Record<string, unknown> & { id: string };

// Index definition maps index names to arrays of column names
type IndexDefinition<T extends TableSchema> = {
  [indexName: string]: { cols: (keyof T)[] };
};

// Table definition combines name with its indexes and schema type
interface TableDefinition<T extends TableSchema> {
  name: string;
  indexes: IndexDefinition<T>;
  _schemaType?: T; // Phantom type to carry schema information
}

// Helper function to create typed table definitions
export function table<T extends TableSchema>(
  name: string,
  indexes: IndexDefinition<T>,
): TableDefinition<T> {
  return { name, indexes };
}

// Extract schema type from table definition
type ExtractSchema<T> = T extends TableDefinition<infer S> ? S : never;

type InmemIndex = {
  isUnique: boolean;
  columns: string[];
  data: { keys: Tuple; value: unknown }[];
};

const encodingByte = {
  null: "b",
  integer: "c",
  float: "d",
  string: "e",
  virtual: "z",
} as const;

export class UnreachableError extends Error {
  constructor(obj: never, message?: string) {
    super((message + ": " || "Unreachable: ") + obj);
  }
}

export type Value = string | number | boolean | null | typeof MIN | typeof MAX;
export type Tuple = Value[];
type EncodingType = keyof typeof encodingByte;
export const encodingRank = sortBy(
  Object.entries(encodingByte) as [EncodingType, string][],
  [(obj: [EncodingType, string]): string => obj[1]],
).map(([key]) => key as EncodingType);

export function compare<K extends string | number | boolean>(
  a: K,
  b: K,
): number {
  if (a > b) {
    return 1;
  }
  if (a < b) {
    return -1;
  }
  return 0;
}

export function encodingTypeOf(value: Value): EncodingType {
  if (value === null) {
    return "null";
  }
  if (value === true || value === false) {
    return "integer";
  }
  if (typeof value === "string") {
    return "string";
  }
  if (typeof value === "number" && Number.isInteger(value)) {
    return "integer";
  }
  if (typeof value === "number") {
    return "float";
  }
  if (value === MIN || value === MAX) {
    return "virtual";
  }

  throw new UnreachableError(value, "Unknown value type");
}

export function compareValue(a: Value, b: Value): number {
  const at = encodingTypeOf(a);
  const bt = encodingTypeOf(b);
  if (at === bt) {
    if (at === "integer") {
      return compare(a as number, b as number);
    } else if (at === "float") {
      return compare(a as number, b as number);
    } else if (at === "null") {
      return 0;
    } else if (at === "string") {
      return compare(a as string, b as string);
    } else if (at === "virtual") {
      throw new Error("Cannot save virtual values into tuple");
    } else {
      throw new UnreachableError(at);
    }
  }

  if (b == MIN) {
    return 1;
  }
  if (b == MAX) {
    return -1;
  }

  return compare(encodingRank.indexOf(at), encodingRank.indexOf(bt));
}

export function compareTuple(a: Tuple, b: Tuple) {
  const len = Math.min(a.length, b.length);

  for (let i = 0; i < len; i++) {
    const dir = compareValue(a[i], b[i]);
    if (dir === 0) {
      continue;
    }
    return dir;
  }

  if (a.length > b.length) {
    return 1;
  } else if (a.length < b.length) {
    return -1;
  } else {
    return 0;
  }
}

function insertKey(index: InmemIndex, keys: Tuple, value: unknown): InmemIndex {
  const newData = orderBy(
    [...index.data, { keys, value }],
    keys.map((_, i) => (obj) => obj.keys[i]),
    keys.map(() => "asc"),
  );

  return {
    ...index,
    data: newData,
  };
}

function* selectKey(
  index: InmemIndex,
  scanOptions: ScanOptions,
): Generator<unknown> {
  const { gte, lte, gt, lt, limit } = scanOptions;
  const data = index.data;
  let count = 0;

  for (const { keys, value } of data) {
    // Check greater than or equal (gte)
    if (gte && compareTuple(keys, gte) < 0) {
      continue;
    }

    // Check greater than (gt)
    if (gt && compareTuple(keys, gt) <= 0) {
      continue;
    }

    // Check less than or equal (lte)
    if (lte && compareTuple(keys, lte) > 0) {
      continue;
    }

    // Check less than (lt)
    if (lt && compareTuple(keys, lt) >= 0) {
      continue;
    }

    // Check limit before yielding
    if (limit !== undefined && count >= limit) {
      break;
    }

    yield value;
    count++;
  }
}

interface DBDriver {
  loadTables(table: TableDefinition<any>[]): void;
  selectKey(
    table: string,
    indexName: string,
    options: ScanOptions,
  ): Generator<unknown>;
  insert(tableName: string, values: Record<string, unknown>[]): void;
}

export class InmemDriver implements DBDriver {
  data = new Map<
    string,
    {
      indexes: Record<string, InmemIndex>;
    }
  >();

  constructor() {}

  loadTables(tables: TableDefinition<any>[]): void {
    for (const tableDef of tables) {
      // this.tableDefinitions.set(tableDef.name, tableDef);
      const indexes: Record<string, InmemIndex> = {};

      for (const [indexName, columns] of Object.entries(tableDef.indexes)) {
        indexes[indexName] = {
          isUnique: false,
          data: [],
          columns: columns.cols as string[],
        };
      }
      this.data.set(tableDef.name, {
        indexes: indexes,
      });
    }
  }

  *selectKey(
    tableName: string,
    indexName: string,
    options: ScanOptions,
  ): Generator<unknown> {
    const tableData = this.data.get(tableName);
    if (!tableData) {
      throw new Error(`Table ${tableName} not found`);
    }
    const index = tableData.indexes[indexName as string];

    const normalizedBounds = normalizeTupleBounds(
      options || {},
      index.columns.length,
    );
    const scanOptions = { ...normalizedBounds, limit: options?.limit };

    for (const data of selectKey(index, scanOptions)) {
      yield data;
    }
  }

  insert(tableName: string, values: Record<string, unknown>[]): void {
    let tblData = this.data.get(tableName);
    if (!tblData) {
      throw new Error(`Table ${tableName} not found`);
    }

    for (const record of values) {
      for (const [indexName, index] of Object.entries(tblData.indexes)) {
        const newIndex = insertKey(
          index,
          index.columns.map((key) => record[key] as Value),
          record,
        );

        tblData = {
          ...tblData,
          indexes: {
            ...tblData.indexes,
            [indexName]: newIndex,
          },
        };
      }
    }

    this.data.set(tableName, tblData);
  }
}

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

export class DB {
  data = new Map<
    string,
    {
      indexes: Record<string, InmemIndex>;
    }
  >();
  driver: DBDriver;

  constructor(driver: DBDriver, tables: TableDefinition<any>[]) {
    driver.loadTables(tables);
    this.driver = driver;
  }

  // Scan method with proper return typing
  *scan<TTable extends TableDefinition<any>>(
    table: TTable,
    indexName: keyof TTable["indexes"],
    options?: ScanOptions,
  ): Generator<ExtractSchema<TTable>> {
    for (const data of this.driver.selectKey(
      table.name,
      indexName as string,
      options || {},
    )) {
      yield data as ExtractSchema<TTable>;
    }
  }

  insert<TTable extends TableDefinition<any>>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ) {
    this.driver.insert(table.name, records);
  }
}
