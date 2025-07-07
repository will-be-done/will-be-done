import { convertWhereToBound } from "./bounds";
import type { ExtractIndexes, ExtractSchema, TableDefinition } from "./table";

export type WhereClause = {
  lt?: { col: string; val: Value }[];
  lte?: { col: string; val: Value }[];
  gt?: { col: string; val: Value }[];
  gte?: { col: string; val: Value }[];
  eq?: { col: string; val: Value }[];
};

export interface HyperDB {
  intervalScan<
    TTable extends TableDefinition,
    K extends keyof ExtractIndexes<TTable>,
  >(
    table: TTable,
    indexName: K,
    clauses: WhereClause[],
    selectOptions?: SelectOptions,
  ): Generator<ExtractSchema<TTable>>;
  insert<TTable extends TableDefinition>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ): void;
  update<TTable extends TableDefinition>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ): void;
  delete<TTable extends TableDefinition>(table: TTable, ids: string[]): void;
}

export type Value = string | number | boolean | null;
export type ScanValue = Value | typeof MIN | typeof MAX;
export type Tuple = ScanValue[];
export type TupleScanOptions = {
  lte?: Tuple;
  gte?: Tuple;
  lt?: Tuple;
  gt?: Tuple;
};

export type SelectOptions = {
  limit?: number;
};

export const MIN = Symbol("MIN");
export const MAX = Symbol("MAX");

/* eslint-disable @typescript-eslint/no-explicit-any */
// Base schema type that all table records must extend
export type Row = Record<string, string | number | boolean | null> & {
  id: string;
};

// export type EqualIndexDef<T extends Row> = {
//   col: keyof T;
//   type: "equal";
//   name: string;
// };
//
// export type RangeIndexDef<T extends Row> = {
//   cols: (keyof T)[];
//   type: "range";
//   name: string;
// };
// export type IndexDef<T extends Row> = RangeIndexDef<T> | EqualIndexDef<T>;
//
// // Index definition maps index names to arrays of column names
// export type AllIndexes<T extends Row> = {
//   [indexName: string]: IndexDef<T>;
// };
//
// type EqualIndexDefInput<T extends Row> = {
//   type: "equal";
//   col: keyof T;
// };
//
// type RangeIndexDefInput<T extends Row> = {
//   type: "range";
//   cols: (keyof T)[];
// };
// export type AllIndexesDefInput<T extends Row> = {
//   [indexName: string]: EqualIndexDefInput<T> | RangeIndexDefInput<T>;
// };
//
// // Table definition combines name with its indexes and schema type
// export interface TableDefinition<T extends Row> {
//   name: string;
//   indexes: AllIndexes<T>;
//   idIndexName: string;
//   _schemaType?: T; // Phantom type to carry schema information
// }
//
// // Helper function to create typed table definitions
// export function table<T extends Row>(
//   name: string,
//   indexes: AllIndexesDefInput<T>,
// ): TableDefinition<T> {
//   const finalIndexes: AllIndexes<T> = Object.fromEntries(
//     Object.entries(indexes).map(([indexName, indexDef]) => {
//       if (indexDef.type === "range") {
//         return [
//           indexName,
//           { ...indexDef, name: indexName } satisfies RangeIndexDef<T>,
//         ];
//       } else {
//         return [
//           indexName,
//           { ...indexDef, name: indexName } satisfies EqualIndexDef<T>,
//         ];
//       }
//     }),
//   );
//
//   const indexDef = Object.values(finalIndexes).find(
//     (index): index is IndexDef<T> =>
//       index.type === "equal" && index.col === "id",
//   );
//
//   if (!indexDef) {
//     throw new Error("Table must have one equal id index");
//   }
//
//   return { name, indexes: finalIndexes, idIndexName: indexDef.name };
// }
//
// // Extract schema type from table definition
// export type ExtractSchema<T> = T extends TableDefinition<infer S> ? S : never;

export interface DBDriver {
  loadTables(table: TableDefinition<any, any>[]): void;
  intervalScan(
    table: string,
    indexName: string,
    clauses: WhereClause[],
    selectOptions: SelectOptions,
  ): Generator<unknown> | Generator<Promise<unknown>>;
  // equalScan(table: string, column: string, values: Value[]): Generator<unknown>;
  insert(tableName: string, values: Row[]): void;
  update(tableName: string, values: Row[]): void;
  delete(tableName: string, values: string[]): void;
}

export class DB implements HyperDB {
  driver: DBDriver;
  tables: TableDefinition<any, any>[];

  constructor(driver: DBDriver, tables: TableDefinition<any, any>[]) {
    // for (const table of tables) {
    //   const idIndex = Object.values(table.indexes).find(
    //     (index): index is IndexDef<any> => index.type === "equal",
    //   );
    //
    //   if (!idIndex) {
    //     throw new Error("Table must have one equal id index");
    //   }
    // }

    driver.loadTables(tables);
    this.driver = driver;
    this.tables = tables;
  }
  //
  // *hashScan<TTable extends TableDefinition<any>>(
  //   table: TTable,
  //   indexName: string,
  //   ids: string[],
  // ): Generator<ExtractSchema<TTable>> {
  //   for (const data of this.driver.equalScan(table.name, indexName, ids)) {
  //     if (data instanceof Promise) {
  //       throw new Error("async scan not supported");
  //     }
  //
  //     yield data as ExtractSchema<TTable>;
  //   }
  // }

  // Scan method with proper return typing
  *intervalScan<
    TTable extends TableDefinition<any, any>,
    K extends keyof ExtractIndexes<TTable>,
  >(
    table: TTable,
    indexName: K,
    clauses: WhereClause[],
    selectOptions?: SelectOptions,
  ): Generator<ExtractSchema<TTable>> {
    if (clauses.length === 0) {
      throw new Error("scan clauses must be provided");
    }
    if (selectOptions && selectOptions.limit === 0) {
      return;
    }

    const indexConfig = table.indexes[indexName as string];
    if (!indexConfig) {
      throw new Error(
        `Index not found: ${indexName as string} for table: ${table.tableName}`,
      );
    }

    // Just for validation
    const bounds = convertWhereToBound(indexConfig, clauses);
    console.log("bounds", bounds);

    for (const data of this.driver.intervalScan(
      table.tableName,
      indexName as string,
      clauses,
      selectOptions || {},
    )) {
      if (data instanceof Promise) {
        throw new Error("async scan not supported");
      }

      yield data as ExtractSchema<TTable>;
    }
  }
  // Scan method with proper return typing
  // async *asyncIntervalScan<TTable extends TableDefinition<any>>(
  //   table: TTable,
  //   indexName: keyof TTable["indexes"],
  //   options?: ScanOptions,
  // ): AsyncGenerator<ExtractSchema<TTable>> {
  //   const gen = this.driver.intervalScan(
  //     table.name,
  //     indexName as string,
  //     options || {},
  //   );
  //
  //   let res = gen.next();
  //
  //   while (!res.done) {
  //     if (res.value instanceof Promise) {
  //       res = gen.next((await res.value) as ExtractSchema<TTable>);
  //     } else {
  //       yield res.value as ExtractSchema<TTable>;
  //       res = gen.next();
  //     }
  //   }
  // }

  insert<TTable extends TableDefinition<any, any>>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ) {
    if (records.length === 0) return;
    this.driver.insert(table.tableName, records);
  }

  update<TTable extends TableDefinition<any, any>>(
    table: TTable,
    records: ExtractSchema<TTable>[],
  ) {
    if (records.length === 0) return;
    this.driver.update(table.tableName, records);
  }

  delete<TTable extends TableDefinition<any, any>>(
    table: TTable,
    ids: string[],
  ) {
    if (ids.length === 0) return;
    this.driver.delete(table.tableName, ids);
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
