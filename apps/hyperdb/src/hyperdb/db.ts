export type Value = string | number | boolean | null | typeof MIN | typeof MAX;
export type Tuple = Value[];
export type ScanOptions = {
  // prefix?: Tuple;
  lte?: Tuple;
  gte?: Tuple;
  lt?: Tuple;
  gt?: Tuple;
  limit?: number;
};
export type Bounds = {
  /** This prevents developers from accidentally using ScanArgs instead of TupleBounds */
  prefix?: never;
  gte?: Tuple;
  gt?: Tuple;
  lte?: Tuple;
  lt?: Tuple;
};

export const MIN = Symbol("MIN");
export const MAX = Symbol("MAX");

/* eslint-disable @typescript-eslint/no-explicit-any */
// Base schema type that all table records must extend
export type TableSchema = Record<string, unknown> & { id: string };

// Index definition maps index names to arrays of column names
export type IndexDefinition<T extends TableSchema> = {
  [indexName: string]: { cols: (keyof T)[] };
};

// Table definition combines name with its indexes and schema type
export interface TableDefinition<T extends TableSchema> {
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
export type ExtractSchema<T> = T extends TableDefinition<infer S> ? S : never;

export interface DBDriver {
  loadTables(table: TableDefinition<any>[]): void;
  selectKey(
    table: string,
    indexName: string,
    options: ScanOptions,
  ): Generator<unknown> | Generator<Promise<unknown>>;
  insert(tableName: string, values: Record<string, unknown>[]): void;
}

export class DB {
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
      if (data instanceof Promise) {
        throw new Error("async scan not supported");
      }

      yield data as ExtractSchema<TTable>;
    }
  }
  // Scan method with proper return typing
  async *asyncScan<TTable extends TableDefinition<any>>(
    table: TTable,
    indexName: keyof TTable["indexes"],
    options?: ScanOptions,
  ): AsyncGenerator<ExtractSchema<TTable>> {
    const gen = this.driver.selectKey(
      table.name,
      indexName as string,
      options || {},
    );

    let res = gen.next();

    while (!res.done) {
      if (res.value instanceof Promise) {
        res = gen.next((await res.value) as ExtractSchema<TTable>);
      } else {
        yield res.value as ExtractSchema<TTable>;
        res = gen.next();
      }
    }
  }

  insert<TTable extends TableDefinition<any>>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ) {
    this.driver.insert(table.name, records);
  }
}

// TODO:
// 0. DONE test asyncScan
// 1. update, delete support
// 2. generator based selector + ability to subscribe to selector
// 3. tx support
// 4. DONE separate by files
// 5. ONLY ON THE END: fix index typing issue
