/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  type Infer,
  type InferObject,
  type Validator,
  isIndexableValueValidator,
  v,
} from "./values";

export type Keys<T> = keyof T;
export type Values<T> = T[keyof T];
export type UnionKeys<T> = T extends unknown ? keyof T : never;
export type UnionValue<T, K extends PropertyKey> = T extends unknown
  ? K extends keyof T
    ? T[K]
    : never
  : never;

export type IndexType = "hash" | "btree";
export type IndexableValue =
  | string
  | number
  | bigint
  | boolean
  | null
  | ArrayBuffer
  | ArrayBufferView;

type IsAny<T> = 0 extends 1 & T ? true : false;

type IsIndexableValue<T> =
  IsAny<T> extends true
    ? false
    : [T] extends [never]
      ? false
      : Exclude<T, IndexableValue> extends never
        ? true
        : false;

export type IndexableColumn<T> = {
  [K in UnionKeys<T>]-?: IsIndexableValue<
    Exclude<UnionValue<T, K>, undefined>
  > extends true
    ? K
    : never;
}[UnionKeys<T>];

export type ColumnSpec<T> = readonly Keys<T>[];

export type ValidateColumns<T, C> = C extends readonly (keyof T)[] ? C : never;

export type AnyIndexDefinitions = {
  [K: string]: {
    type: IndexType;
    cols: readonly PropertyKey[];
  };
};

export type IndexOptions<TType extends IndexType = IndexType> = {
  type?: TType;
};

export type ValidatorSchema = Record<string, Validator<any>>;
export type ValidatorSchemaWithId = ValidatorSchema & { id: Validator<string> };

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
  index<
    const TName extends string,
    const TCols extends readonly IndexableColumn<T>[],
  >(
    name: TName,
    columns: TCols,
    options: { type: "btree" },
  ): TableDefinition<
    T,
    I & {
      [K in TName]: {
        type: "btree";
        cols: TCols;
      };
    }
  >;
  index<const TName extends string, const TCol extends IndexableColumn<T>>(
    name: TName,
    columns: readonly [TCol],
    options: { type: "hash" },
  ): TableDefinition<
    T,
    I & {
      [K in TName]: {
        type: "hash";
        cols: readonly [TCol];
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
      if (fieldValidator && !isIndexableValueValidator(fieldValidator)) {
        throw new Error(
          `Index column ${colName} is not comparable for index: ${indexName} table: ${tableName}`,
        );
      }
    }
  }
}

function addIndexMethod<T, I extends AnyIndexDefinitions>(
  tableDef: Omit<TableDefinition<T, I>, "index">,
): TableDefinition<T, I> {
  return {
    ...tableDef,
    index(
      name: string,
      columns: readonly IndexableColumn<T>[],
      options?: IndexOptions,
    ) {
      const type = options?.type ?? "btree";
      const nextIndexes = {
        ...tableDef.indexes,
        [name]: { type, cols: columns },
      } as I & Record<string, { type: typeof type; cols: typeof columns }>;

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

function validatorHasStringId(validator: Validator<unknown>): boolean {
  if (validator.kind === "object") {
    return validator.fields.id?.kind === "string";
  }

  if (validator.kind === "union") {
    return validator.validators.every(validatorHasStringId);
  }

  return false;
}

function validateSchemaValidator(
  tableName: string,
  schemaValidator: Validator<unknown>,
): void {
  if (!validatorHasStringId(schemaValidator)) {
    throw new Error(`Table ${tableName} schema must include an id field`);
  }
}

function collectObjectSchemaFields(
  schemaValidator: Validator<unknown>,
): ValidatorSchema[] | undefined {
  if (schemaValidator.kind === "object") {
    return [schemaValidator.fields];
  }

  if (schemaValidator.kind === "union") {
    const schemaFields: ValidatorSchema[] = [];
    for (const variantValidator of schemaValidator.validators) {
      const variantFields = collectObjectSchemaFields(variantValidator);
      if (!variantFields) return undefined;
      schemaFields.push(...variantFields);
    }
    return schemaFields;
  }

  return undefined;
}

function schemaFieldsFromValidator(
  schemaValidator: Validator<unknown>,
): ValidatorSchema | undefined {
  const variantFields = collectObjectSchemaFields(schemaValidator);
  if (!variantFields) return undefined;

  const fieldValidators = new Map<string, Validator<unknown>[]>();
  for (const fields of variantFields) {
    for (const [fieldName, fieldValidator] of Object.entries(fields)) {
      const validators = fieldValidators.get(fieldName);
      if (validators) {
        validators.push(fieldValidator);
      } else {
        fieldValidators.set(fieldName, [fieldValidator]);
      }
    }
  }

  const schemaFields: ValidatorSchema = {};
  for (const [fieldName, validators] of fieldValidators) {
    schemaFields[fieldName] =
      validators.length === 1 ? validators[0] : v.union(...validators);
  }

  return schemaFields;
}

function isStandaloneSchemaValidator(
  schemaOrValidator: ValidatorSchemaWithId | Validator<{ id: string }>,
): schemaOrValidator is Validator<{ id: string }> {
  return (
    "normalize" in schemaOrValidator &&
    typeof schemaOrValidator.normalize === "function"
  );
}

function normalizeSchemaInput(
  tableName: string,
  schemaOrValidator: ValidatorSchemaWithId | Validator<{ id: string }>,
): { schemaValidator: Validator<unknown>; schemaFields?: ValidatorSchema } {
  if (isStandaloneSchemaValidator(schemaOrValidator)) {
    validateSchemaValidator(tableName, schemaOrValidator);
    return {
      schemaValidator: schemaOrValidator,
      schemaFields: schemaFieldsFromValidator(schemaOrValidator),
    };
  }

  validateSchemaFields(tableName, schemaOrValidator);

  return {
    schemaValidator: v.object(schemaOrValidator),
    schemaFields: schemaOrValidator,
  };
}

export function defineTable<const TSchema extends ValidatorSchemaWithId>(
  tableName: string,
  schema: TSchema,
): TableDefinition<
  InferTableSchema<TSchema>,
  {
    byId: {
      type: "hash";
      cols: readonly ["id"];
    };
  }
>;
export function defineTable<const TValidator extends Validator<{ id: string }>>(
  tableName: string,
  schemaValidator: TValidator,
): TableDefinition<
  Infer<TValidator>,
  {
    byId: {
      type: "hash";
      cols: readonly ["id"];
    };
  }
>;
export function defineTable(
  tableName: string,
  schemaOrValidator: ValidatorSchemaWithId | Validator<{ id: string }>,
): TableDefinition<
  any,
  {
    byId: {
      type: "hash";
      cols: readonly ["id"];
    };
  }
> {
  validateKey(tableName, "Table", tableName);
  const { schemaValidator, schemaFields } = normalizeSchemaInput(
    tableName,
    schemaOrValidator,
  );
  const indexes = {
    byId: { type: "hash", cols: ["id"] as const },
  } satisfies {
    byId: {
      type: "hash";
      cols: readonly ["id"];
    };
  };

  validateIndexes(tableName, indexes, schemaFields);

  return addIndexMethod({
    tableName,
    schema: {} as any,
    schemaValidator,
    schemaFields,
    indexes,
    idIndexName: "byId",
  });
}
