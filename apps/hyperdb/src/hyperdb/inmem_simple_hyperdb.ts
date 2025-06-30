import { orderBy } from "es-toolkit";

type ScanOptions = {
  lte?: unknown[];
  gte?: unknown[];
  lt?: unknown[];
  gt?: unknown[];
  limit?: number;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
// Base schema type that all table records must extend
type TableSchema = Record<string, unknown> & { id: string };

// Index definition maps index names to arrays of column names
type IndexDefinition<T extends TableSchema> = {
  [indexName: string]: { path: (keyof T)[]; value: keyof T | typeof SELF };
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

export const SELF = Symbol("self");

// Extract schema type from table definition
type ExtractSchema<T> = T extends TableDefinition<infer S> ? S : never;

// Extract table definition from table name
type FindTableByName<
  TTables extends readonly TableDefinition<any>[],
  TName extends string,
> = Extract<TTables[number], { name: TName }>;

type Index = {
  isUnique: boolean;
  columns: string[];
  valueDef: typeof SELF | string;
  data: { keys: unknown[]; value: unknown }[];
};

function compareKeys(keys1: unknown[], keys2: unknown[]): number {
  const minLength = Math.min(keys1.length, keys2.length);

  for (let i = 0; i < minLength; i++) {
    const val1 = keys1[i];
    const val2 = keys2[i];

    if (val1 < val2) return -1;
    if (val1 > val2) return 1;
  }

  // If all compared values are equal, compare by length
  return keys1.length - keys2.length;
}

function insertKey(index: Index, keys: unknown[], value: unknown): Index {
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
  index: Index,
  scanOptions: ScanOptions,
): Generator<unknown> {
  const { gte, lte, gt, lt, limit } = scanOptions;
  const data = index.data;
  let count = 0;

  for (const { keys, value } of data) {
    // Check greater than or equal (gte)
    if (gte && compareKeys(keys, gte) < 0) {
      continue;
    }

    // Check greater than (gt)
    if (gt && compareKeys(keys, gt) <= 0) {
      continue;
    }

    // Check less than or equal (lte)
    if (lte && compareKeys(keys, lte) > 0) {
      continue;
    }

    // Check less than (lt)
    if (lt && compareKeys(keys, lt) >= 0) {
      continue;
    }

    yield value;
    count++;

    // Check limit
    if (limit && count >= limit) {
      break;
    }
  }
}

export class InmemDB<TTables extends readonly TableDefinition<any>[]> {
  // private tableDefinitions = new Map<string, TTables[number]>();
  data = new Map<
    TTables[number]["name"],
    {
      indexes: Record<string, Index>;
    }
  >();

  constructor(tables: TTables) {
    for (const tableDef of tables) {
      // this.tableDefinitions.set(tableDef.name, tableDef);
      const indexes: Record<string, Index> = {};

      for (const [indexName, columns] of Object.entries(tableDef.indexes)) {
        indexes[indexName] = {
          isUnique: false,
          data: [],
          columns: columns.path as string[],
          valueDef: columns.value as string | typeof SELF,
        };
      }
      this.data.set(tableDef.name, {
        indexes: indexes,
      });
    }
  }

  // Scan method with proper return typing
  *scan<TName extends TTables[number]["name"]>(
    table: FindTableByName<TTables, TName>,
    indexName: keyof FindTableByName<TTables, TName>["indexes"],
    options?: ScanOptions,
  ): Generator<ExtractSchema<FindTableByName<TTables, TName>>> {
    const tableName = table.name;
    const tableData = this.data.get(tableName);
    if (!tableData) {
      throw new Error(`Table ${tableName} not found`);
    }
    const index = tableData.indexes[indexName as string];

    for (const data of selectKey(index, options || {})) {
      yield data as ExtractSchema<FindTableByName<TTables, TName>>;
    }
  }

  insert<TName extends TTables[number]["name"]>(
    table: FindTableByName<TTables, TName>,
    record: ExtractSchema<FindTableByName<TTables, TName>>,
  ) {
    let tblData = this.data.get(table.name);
    if (!tblData) {
      throw new Error(`Table ${table.name} not found`);
    }

    for (const [indexName, index] of Object.entries(tblData.indexes)) {
      const newIndex = insertKey(
        index,
        index.columns.map((key) => record[key]),
        index.valueDef === SELF ? record : record[index.valueDef],
      );

      tblData = {
        ...tblData,
        indexes: {
          ...tblData.indexes,
          [indexName]: newIndex,
        },
      };
    }

    this.data.set(table.name, tblData);
  }
}
