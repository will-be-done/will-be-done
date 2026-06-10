/* eslint-disable @typescript-eslint/no-explicit-any */
// Type utilities for column validation and index creation

export type Keys<T> = keyof T;
export type Values<T> = T[keyof T];

// Index type definitions
export type IndexType = "hash" | "btree";

// Column specification for indexes
export type ColumnSpec<T> = Keys<T>[];

// Index configuration
export interface IndexConfig<T> {
  type: IndexType;
  cols: ColumnSpec<T>;
}

// Validate that all columns in the index exist in the table
export type ValidateColumns<T, C> = C extends (keyof T)[] ? C : never;

// Type for index definitions
export type IndexDefinitions<T = any> = {
  [K: string]: {
    type: IndexType;
    cols: ValidateColumns<T, ColumnSpec<T>>;
  };
};

// The main table structure that gets returned
export interface TableDefinition<
  T = any,
  I extends IndexDefinitions<T> = IndexDefinitions,
> {
  tableName: string;
  schema: T;
  indexes: I;
  idIndexName: string;
}
export type ExtractSchema<TTable> =
  TTable extends TableDefinition<infer T, any> ? T : never;

export type ExtractIndexes<TTable> =
  TTable extends TableDefinition<any, infer I> ? I : never;

// Validation function for indexes
export function validateIndexes(indexes: IndexDefinitions<any>): void {
  // Runtime validation logic would go here
  for (const [indexName, config] of Object.entries(indexes)) {
    if (!config.type || !config.cols) {
      throw new Error(`Invalid index configuration for ${indexName}`);
    }

    // Validate index type
    if (!["hash", "btree", "unique"].includes(config.type)) {
      throw new Error(`Invalid index type: ${config.type}`);
    }

    console.log(`Validated index: ${indexName} (${config.type})`);
  }
}

// Factory function to create a table with indexes
export function table<T>(tableName: string) {
  return {
    withIndexes<I extends IndexDefinitions<T>>(
      indexes: I,
    ): TableDefinition<T, I> {
      // Validate indexes at runtime
      validateIndexes(indexes);

      const indexDef = Object.entries(indexes).find(
        ([, index]) =>
          index.type === "hash" &&
          index.cols[0] === "id" &&
          index.cols.length === 1,
      );

      if (!indexDef) {
        throw new Error("Table must have one hash id index");
      }

      for (const [indexName, indexDef] of Object.entries(indexes)) {
        const cols = new Set<string>();

        for (const col of indexDef.cols) {
          if (cols.has(col as string)) {
            throw new Error(
              `Index columns must be unique for index: ${indexName} table: ${tableName}`,
            );
          }
          cols.add(col as string);
        }
      }

      return {
        tableName,
        schema: {} as T,
        indexes,
        idIndexName: indexDef[0],
      };
    },
  };
}

// // Example usage with your types
// type MyTable = {
//   id: string;
//   name: string;
// };
//
// // Create the table with type-safe indexes
// const tasksTable = table<MyTable>("tasks").withIndexes({
//   ids: { type: "hash", cols: ["id"] },
//   namesWithIds: { type: "btree", cols: ["name", "id"] },
// });
//
// // Example of the returned structure
// console.log("Table created:", tasksTable.tableName);
// console.log("Schema type:", typeof tasksTable.schema);
// console.log("Indexes:", tasksTable.indexes);
//
