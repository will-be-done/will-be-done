/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  type InferObject,
  type Validator,
  isIndexableValueValidator,
  v,
} from "./values";

export type Keys<T> = keyof T;
export type Values<T> = T[keyof T];

export type IndexType = "hash" | "btree";
export type IndexableValue = string | number | boolean | null;

export type IndexableColumn<T> = {
  [K in keyof T]-?: Exclude<T[K], undefined> extends IndexableValue ? K : never;
}[keyof T];

export type ColumnSpec<T> = readonly Keys<T>[];

export interface IndexConfig<T> {
  type: IndexType;
  cols: ColumnSpec<T>;
}

export type ValidateColumns<T, C> = C extends readonly (keyof T)[] ? C : never;

export type IndexDefinitions<T = any> = {
  [K: string]: {
    type: IndexType;
    cols: ValidateColumns<T, ColumnSpec<T>>;
  };
};

export type AnyIndexDefinitions = {
  [K: string]: {
    type: IndexType;
    cols: readonly PropertyKey[];
  };
};

export type ValidatorSchema = Record<string, Validator<any>>;
export type ValidatorSchemaWithId = ValidatorSchema & { id: Validator<any> };

export type InferTableSchema<TSchema extends ValidatorSchema> =
  InferObject<TSchema>;

export interface TableDefinition<
  T = any,
  I extends AnyIndexDefinitions = AnyIndexDefinitions,
> {
  tableName: string;
  schema: T;
  schemaValidator?: Validator<T>;
  schemaFields?: ValidatorSchema;
  indexes: I;
  idIndexName: string;
  index<
    const TName extends string,
    const TCols extends readonly IndexableColumn<T>[],
  >(
    name: TName,
    columns: TCols,
  ): TableDefinition<
    T,
    I & {
      [K in TName]: {
        type: "btree";
        cols: TCols;
      };
    }
  >;
}

export type ExtractSchema<TTable> =
  TTable extends TableDefinition<infer T, any> ? T : never;

export type ExtractIndexes<TTable> =
  TTable extends TableDefinition<any, infer I> ? I : never;

function validateKey(key: string, kind: string, tableName: string): void {
  if (key === "" || key.startsWith("$")) {
    throw new Error(
      `${kind} keys cannot be empty or start with $ for table: ${tableName}`,
    );
  }
}

export function validateIndexes(
  tableName: string,
  indexes: AnyIndexDefinitions,
  schemaFields?: ValidatorSchema,
): void {
  for (const [indexName, config] of Object.entries(indexes)) {
    validateKey(indexName, "Index", tableName);

    if (!config.type || !config.cols) {
      throw new Error(`Invalid index configuration for ${indexName}`);
    }

    if (!["hash", "btree"].includes(config.type)) {
      throw new Error(`Invalid index type: ${config.type}`);
    }

    if (config.type === "hash" && config.cols.length !== 1) {
      throw new Error(
        `Hash index must have exactly one column for index: ${indexName} table: ${tableName}`,
      );
    }

    const cols = new Set<string>();
    for (const col of config.cols) {
      const colName = String(col);
      validateKey(colName, "Index column", tableName);

      if (cols.has(colName)) {
        throw new Error(
          `Index columns must be unique for index: ${indexName} table: ${tableName}`,
        );
      }
      cols.add(colName);

      const fieldValidator = schemaFields?.[colName];
      if (schemaFields && !fieldValidator) {
        throw new Error(
          `Index column ${colName} is not in table schema for index: ${indexName} table: ${tableName}`,
        );
      }
      if (
        fieldValidator &&
        !isIndexableValueValidator(fieldValidator as Validator<unknown>)
      ) {
        throw new Error(
          `Index column ${colName} is not SQLite-comparable for index: ${indexName} table: ${tableName}`,
        );
      }
    }
  }
}

function findIdIndex(indexes: AnyIndexDefinitions): string {
  const indexDef = Object.entries(indexes).find(
    ([, index]) =>
      index.type === "hash" &&
      index.cols[0] === "id" &&
      index.cols.length === 1,
  );

  if (!indexDef) {
    throw new Error("Table must have one hash id index");
  }

  return indexDef[0];
}

function addIndexMethod<T, I extends AnyIndexDefinitions>(
  tableDef: Omit<TableDefinition<T, I>, "index">,
): TableDefinition<T, I> {
  return {
    ...tableDef,
    index(name, columns) {
      const nextIndexes = {
        ...tableDef.indexes,
        [name]: { type: "btree", cols: columns },
      } as I & Record<string, { type: "btree"; cols: typeof columns }>;

      validateIndexes(tableDef.tableName, nextIndexes, tableDef.schemaFields);

      return addIndexMethod({
        ...tableDef,
        indexes: nextIndexes,
      }) as any;
    },
  };
}

function validateSchemaFields(
  tableName: string,
  schema: ValidatorSchema,
): void {
  if (!("id" in schema)) {
    throw new Error(`Table ${tableName} schema must include an id field`);
  }

  for (const [key, validator] of Object.entries(schema)) {
    validateKey(key, "Schema", tableName);
    if (!validator || typeof validator.normalize !== "function") {
      throw new Error(`Invalid validator for field ${key} table: ${tableName}`);
    }
  }
}

export function defineTable<const TSchema extends ValidatorSchemaWithId>(
  tableName: string,
  schema: TSchema,
): TableDefinition<
  InferTableSchema<TSchema>,
  {
    id: {
      type: "hash";
      cols: readonly ["id"];
    };
  }
> {
  validateKey(tableName, "Table", tableName);
  validateSchemaFields(tableName, schema);

  const schemaValidator = v.object(schema) as Validator<InferTableSchema<TSchema>>;
  const indexes = {
    id: { type: "hash", cols: ["id"] as const },
  } satisfies {
    id: {
      type: "hash";
      cols: readonly ["id"];
    };
  };

  validateIndexes(tableName, indexes, schema);

  return addIndexMethod({
    tableName,
    schema: {} as InferTableSchema<TSchema>,
    schemaValidator,
    schemaFields: schema,
    indexes,
    idIndexName: "id",
  });
}

export function table<T extends { id: string }>(tableName: string) {
  return {
    withIndexes<I extends IndexDefinitions<T>>(
      indexes: I,
    ): TableDefinition<T, I> {
      validateKey(tableName, "Table", tableName);
      validateIndexes(tableName, indexes);

      const idIndexName = findIdIndex(indexes);

      return addIndexMethod({
        tableName,
        schema: {} as T,
        indexes,
        idIndexName,
      });
    },
  };
}
