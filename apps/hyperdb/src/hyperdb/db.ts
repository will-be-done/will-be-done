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
export type Row = Record<string, unknown> & { id: string };

export type EqualIndexDef<T extends Row> = {
  col: keyof T;
  type: "equal";
  name: string;
};

export type RangeIndexDef<T extends Row> = {
  cols: (keyof T)[];
  type: "range";
  name: string;
};
export type IndexDef<T extends Row> = RangeIndexDef<T> | EqualIndexDef<T>;

// Index definition maps index names to arrays of column names
export type AllIndexes<T extends Row> = {
  [indexName: string]: IndexDef<T>;
};

type EqualIndexDefInput<T extends Row> = {
  type: "equal";
  col: keyof T;
};

type RangeIndexDefInput<T extends Row> = {
  type: "range";
  cols: (keyof T)[];
};
export type AllIndexesDefInput<T extends Row> = {
  [indexName: string]: EqualIndexDefInput<T> | RangeIndexDefInput<T>;
};

// Table definition combines name with its indexes and schema type
export interface TableDefinition<T extends Row> {
  name: string;
  indexes: AllIndexes<T>;
  idIndexName: string;
  _schemaType?: T; // Phantom type to carry schema information
}

// Helper function to create typed table definitions
export function table<T extends Row>(
  name: string,
  indexes: AllIndexesDefInput<T>,
): TableDefinition<T> {
  const finalIndexes: AllIndexes<T> = Object.fromEntries(
    Object.entries(indexes).map(([indexName, indexDef]) => {
      if (indexDef.type === "range") {
        return [
          indexName,
          { ...indexDef, name: indexName } satisfies RangeIndexDef<T>,
        ];
      } else {
        return [
          indexName,
          { ...indexDef, name: indexName } satisfies EqualIndexDef<T>,
        ];
      }
    }),
  );

  const indexDef = Object.values(finalIndexes).find(
    (index): index is IndexDef<T> =>
      index.type === "equal" && index.col === "id",
  );

  if (!indexDef) {
    throw new Error("Table must have one equal id index");
  }

  return { name, indexes: finalIndexes, idIndexName: indexDef.name };
}

// Extract schema type from table definition
export type ExtractSchema<T> = T extends TableDefinition<infer S> ? S : never;

export interface DBDriver {
  loadTables(table: TableDefinition<any>[]): void;
  intervalScan(
    table: string,
    indexName: string,
    options: ScanOptions,
  ): Generator<unknown> | Generator<Promise<unknown>>;
  equalScan(table: string, column: string, values: Value[]): Generator<unknown>;
  insert(tableName: string, values: Row[]): void;
  update(tableName: string, values: Row[]): void;
  delete(tableName: string, values: string[]): void;
}

export class DB {
  driver: DBDriver;
  tables: TableDefinition<any>[];

  constructor(driver: DBDriver, tables: TableDefinition<any>[]) {
    for (const table of tables) {
      const idIndex = Object.values(table.indexes).find(
        (index): index is IndexDef<any> => index.type === "equal",
      );

      if (!idIndex) {
        throw new Error("Table must have one equal id index");
      }
    }

    driver.loadTables(tables);
    this.driver = driver;
    this.tables = tables;
  }

  *hashScan<TTable extends TableDefinition<any>>(
    table: TTable,
    indexName: string,
    ids: string[],
  ): Generator<ExtractSchema<TTable>> {
    for (const data of this.driver.equalScan(table.name, indexName, ids)) {
      if (data instanceof Promise) {
        throw new Error("async scan not supported");
      }

      yield data as ExtractSchema<TTable>;
    }
  }

  // Scan method with proper return typing
  *intervalScan<TTable extends TableDefinition<any>>(
    table: TTable,
    indexName: keyof TTable["indexes"],
    options?: ScanOptions,
  ): Generator<ExtractSchema<TTable>> {
    for (const data of this.driver.intervalScan(
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
  async *asyncIntervalScan<TTable extends TableDefinition<any>>(
    table: TTable,
    indexName: keyof TTable["indexes"],
    options?: ScanOptions,
  ): AsyncGenerator<ExtractSchema<TTable>> {
    const gen = this.driver.intervalScan(
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

  update<TTable extends TableDefinition<any>>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ) {
    this.driver.update(table.name, records);
  }

  delete<TTable extends TableDefinition<any>>(table: TTable, ids: string[]) {
    this.driver.delete(table.name, ids);
  }
}

// TODO:
// 0. DONE test asyncScan
// 1. DONE update, delete support
// 2. generator based selector + ability to subscribe to selector
// 3. hash type index
// 3. tx support
// 4. DONE separate by files
// 5. ONLY ON THE END: fix index typing issue
