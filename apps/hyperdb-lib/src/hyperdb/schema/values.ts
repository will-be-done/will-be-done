/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  fail,
  isPlainObject,
  success,
  validObjectKey,
  validRecordKey,
} from "./validation-utils";

export type ValidationPath = readonly (string | number)[];

export type NormalizeResult<T> =
  | { ok: true; value: T; omitted: false }
  | { ok: true; omitted: true }
  | { ok: false; message: string; path: ValidationPath };

export type Infer<TValidator> =
  TValidator extends {
    normalize(
      value: unknown,
      path?: ValidationPath,
    ): NormalizeResult<infer TValue>;
  }
    ? TValue
    : never;

type OptionalKeys<TFields extends Record<string, Validator<any>>> = {
  [K in keyof TFields]: TFields[K] extends OptionalValidator<any> ? K : never;
}[keyof TFields];

type RequiredKeys<TFields extends Record<string, Validator<any>>> = Exclude<
  keyof TFields,
  OptionalKeys<TFields>
>;

export type InferObject<TFields extends Record<string, Validator<any>>> = {
  [K in RequiredKeys<TFields>]: Infer<TFields[K]>;
} & {
  [K in OptionalKeys<TFields>]?: TFields[K] extends OptionalValidator<infer T>
    ? T
    : never;
};

type PrimitiveValidatorKind =
  | "string"
  | "number"
  | "bigint"
  | "boolean"
  | "null";
type ValidatorKind =
  | PrimitiveValidatorKind
  | "arrayBuffer"
  | "array"
  | "object"
  | "record"
  | "union"
  | "literal"
  | "optional"
  | "any";

interface ValidatorOutput<T> {
  normalize(value: unknown, path?: ValidationPath): NormalizeResult<T>;
}

interface BaseValidator<T, TKind extends ValidatorKind>
  extends ValidatorOutput<T> {
  readonly kind: TKind;
}

export type PrimitiveValidator<
  T,
  TKind extends PrimitiveValidatorKind,
> = BaseValidator<T, TKind>;

export type StringValidator = PrimitiveValidator<string, "string">;
export type NumberValidator = PrimitiveValidator<number, "number">;
export type BigIntValidator = PrimitiveValidator<bigint, "bigint">;
export type BooleanValidator = PrimitiveValidator<boolean, "boolean">;
export type NullValidator = PrimitiveValidator<null, "null">;
export type ArrayBufferValidator = BaseValidator<ArrayBuffer, "arrayBuffer">;

export interface ArrayValidator<T> extends BaseValidator<T[], "array"> {
  readonly item: Validator<T>;
}

export interface ObjectValidator<
  TFields extends Record<string, Validator<any>>,
> extends BaseValidator<InferObject<TFields>, "object"> {
  readonly fields: TFields;
}

export interface RecordValidator<TKey extends string, TValue>
  extends BaseValidator<Record<TKey, TValue>, "record"> {
  readonly keyValidator: Validator<TKey>;
  readonly valueValidator: Validator<TValue>;
}

export interface UnionValidator<TValidators extends readonly Validator<any>[]>
  extends BaseValidator<Infer<TValidators[number]>, "union"> {
  readonly validators: TValidators;
}

export interface LiteralValidator<
  T extends string | number | bigint | boolean | null,
>
  extends BaseValidator<T, "literal"> {
  readonly literalValue: T;
}

export interface OptionalValidator<T>
  extends BaseValidator<T | undefined, "optional"> {
  readonly isOptional: true;
  readonly inner: Validator<T>;
}

export type AnyValidator = BaseValidator<any, "any">;

export type Validator<T> = (
  | StringValidator
  | NumberValidator
  | BigIntValidator
  | BooleanValidator
  | NullValidator
  | ArrayBufferValidator
  | ArrayValidator<any>
  | ObjectValidator<Record<string, Validator<any>>>
  | RecordValidator<string, any>
  | UnionValidator<readonly Validator<any>[]>
  | LiteralValidator<string | number | bigint | boolean | null>
  | OptionalValidator<any>
  | AnyValidator
) &
  ValidatorOutput<T>;

export function isOptionalValidator(
  validator: Validator<any>,
): validator is OptionalValidator<any> {
  return validator.kind === "optional";
}

export function formatPath(path: ValidationPath): string {
  if (path.length === 0) return "<root>";
  return path
    .map((part) =>
      typeof part === "number"
        ? `[${part}]`
        : part === ""
          ? '[""]'
          : `.${String(part)}`,
    )
    .join("")
    .replace(/^\./, "");
}

export function isNormalizeFailure<T>(
  result: NormalizeResult<T>,
): result is { ok: false; message: string; path: ValidationPath } {
  return result.ok === false;
}

export function isNormalizeOmitted<T>(
  result: NormalizeResult<T>,
): result is { ok: true; omitted: true } {
  return result.ok === true && result.omitted === true;
}

export function hasNormalizeValue<T>(
  result: NormalizeResult<T>,
): result is { ok: true; value: T; omitted: false } {
  return result.ok === true && result.omitted === false;
}

function normalizeAny(
  value: unknown,
  path: ValidationPath = [],
): NormalizeResult<any> {
  if (value === undefined) {
    return fail("undefined is not a valid stored value", path);
  }

  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return success(value);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return fail("number must be finite", path);
    }
    return success(value);
  }

  if (value instanceof ArrayBuffer) {
    return success(value);
  }

  if (ArrayBuffer.isView(value)) {
    return success(value);
  }

  if (Array.isArray(value)) {
    const normalized: unknown[] = [];
    for (let index = 0; index < value.length; index++) {
      const item = normalizeAny(value[index], [...path, index]);
      if (isNormalizeFailure(item)) return item;
      if (isNormalizeOmitted(item)) {
        return fail("undefined is not valid inside arrays", [...path, index]);
      }
      normalized.push(item.value);
    }
    return success(normalized);
  }

  if (isPlainObject(value)) {
    const normalized: Record<string, unknown> = {};
    for (const [key, fieldValue] of Object.entries(value)) {
      if (!validObjectKey(key)) {
        return fail("object keys cannot be empty or start with $", [
          ...path,
          key,
        ]);
      }
      const field = normalizeAny(fieldValue, [...path, key]);
      if (isNormalizeFailure(field)) return field;
      if (hasNormalizeValue(field)) normalized[key] = field.value;
    }
    return success(normalized);
  }

  return fail(`unsupported value type ${typeof value}`, path);
}

function primitive<T, TKind extends PrimitiveValidatorKind>(
  kind: TKind,
  guard: (value: unknown) => value is T,
  expected: string,
): PrimitiveValidator<T, TKind> {
  return {
    kind,
    normalize(value, path = []) {
      if (value === undefined) {
        return fail("undefined is not a valid stored value", path);
      }
      if (!guard(value)) {
        return fail(`expected ${expected}`, path);
      }
      return success(value);
    },
  };
}

export function assertValid<T>(validator: Validator<T>, value: unknown): T {
  const result = validator.normalize(value);
  if (isNormalizeFailure(result)) {
    throw new Error(`${result.message} at ${formatPath(result.path)}`);
  }
  if (isNormalizeOmitted(result)) {
    throw new Error(`value was omitted at ${formatPath([])}`);
  }
  return result.value;
}

export function isIndexableValueValidator(validator: Validator<unknown>): boolean {
  switch (validator.kind) {
    case "string":
    case "number":
    case "bigint":
    case "boolean":
    case "null":
    case "arrayBuffer":
      return true;
    case "literal": {
      const literalValue = validator.literalValue;
      return (
        literalValue === null ||
        typeof literalValue === "string" ||
        typeof literalValue === "number" ||
        typeof literalValue === "bigint" ||
        typeof literalValue === "boolean"
      );
    }
    case "union":
      return validator.validators.every(isIndexableValueValidator);
    case "optional":
      return isIndexableValueValidator(validator.inner);
    default:
      return false;
  }
}

export const v = {
  string(): StringValidator {
    return primitive(
      "string",
      (value): value is string => typeof value === "string",
      "string",
    );
  },

  number(): NumberValidator {
    return primitive(
      "number",
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value),
      "finite number",
    );
  },

  bigint(): BigIntValidator {
    return primitive(
      "bigint",
      (value): value is bigint => typeof value === "bigint",
      "bigint",
    );
  },

  boolean(): BooleanValidator {
    return primitive(
      "boolean",
      (value): value is boolean => typeof value === "boolean",
      "boolean",
    );
  },

  null(): NullValidator {
    return primitive("null", (value): value is null => value === null, "null");
  },

  arrayBuffer(): ArrayBufferValidator {
    return {
      kind: "arrayBuffer",
      normalize(value, path = []) {
        if (!(value instanceof ArrayBuffer)) {
          return fail("expected ArrayBuffer", path);
        }
        return success(value);
      },
    };
  },

  array<T>(item: Validator<T>): ArrayValidator<T> {
    return {
      kind: "array",
      item,
      normalize(value, path = []) {
        if (!Array.isArray(value)) {
          return fail("expected array", path);
        }

        const normalized: T[] = [];
        for (let index = 0; index < value.length; index++) {
          const itemResult = item.normalize(value[index], [...path, index]);
          if (isNormalizeFailure(itemResult)) return itemResult;
          if (isNormalizeOmitted(itemResult)) {
            return fail("undefined is not valid inside arrays", [
              ...path,
              index,
            ]);
          }
          normalized.push(itemResult.value);
        }
        return success(normalized);
      },
    };
  },

  object<TFields extends Record<string, Validator<any>>>(
    fields: TFields,
  ): ObjectValidator<TFields> {
    const objectFields = { ...fields };
    const fieldEntries = Object.entries(objectFields);
    const invalidFieldKey = fieldEntries.find(
      ([key]) => !validObjectKey(key),
    )?.[0];

    return {
      kind: "object",
      fields: objectFields,
      normalize(value, path = []) {
        if (!isPlainObject(value)) {
          return fail("expected object", path);
        }

        if (invalidFieldKey !== undefined) {
          return fail("object keys cannot be empty or start with $", [
            ...path,
            invalidFieldKey,
          ]);
        }

        for (const key of Object.keys(value)) {
          if (!validObjectKey(key)) {
            return fail("object keys cannot be empty or start with $", [
              ...path,
              key,
            ]);
          }
          if (!(key in objectFields)) {
            return fail(`unexpected object field ${key}`, [...path, key]);
          }
        }

        const normalized: Record<string, unknown> = {};
        for (const [key, validator] of fieldEntries) {
          if (!(key in value)) {
            if (isOptionalValidator(validator)) continue;
            return fail("missing required field", [...path, key]);
          }

          const fieldResult = validator.normalize(value[key], [...path, key]);
          if (isNormalizeFailure(fieldResult)) return fieldResult;
          if (hasNormalizeValue(fieldResult)) {
            normalized[key] = fieldResult.value;
          }
        }

        return success(normalized as InferObject<TFields>);
      },
    };
  },

  record<TKey extends string, TValue>(
    keyValidator: Validator<TKey>,
    valueValidator: Validator<TValue>,
  ): RecordValidator<TKey, TValue> {
    return {
      kind: "record",
      keyValidator,
      valueValidator,
      normalize(value, path = []) {
        if (!isPlainObject(value)) {
          return fail("expected object", path);
        }

        const normalized: Record<string, TValue> = {};
        for (const [key, fieldValue] of Object.entries(value)) {
          if (!validRecordKey(key)) {
            return fail("record keys must be non-empty ASCII keys that do not start with $", [
              ...path,
              key,
            ]);
          }

          const keyResult = keyValidator.normalize(key, [...path, key]);
          if (isNormalizeFailure(keyResult)) return keyResult;

          const fieldResult = valueValidator.normalize(fieldValue, [
            ...path,
            key,
          ]);
          if (isNormalizeFailure(fieldResult)) return fieldResult;
          if (isNormalizeOmitted(fieldResult)) {
            return fail("undefined is not valid as a record value", [
              ...path,
              key,
            ]);
          }
          normalized[key] = fieldResult.value;
        }

        return success(normalized as Record<TKey, TValue>);
      },
    };
  },

  union<TValidators extends readonly Validator<any>[]>(
    ...validators: TValidators
  ): UnionValidator<TValidators> {
    return {
      kind: "union",
      validators,
      normalize(value, path = []) {
        const messages: string[] = [];
        for (const validator of validators) {
          const result = validator.normalize(value, path);
          if (hasNormalizeValue(result) || isNormalizeOmitted(result)) {
            return result;
          }
          messages.push(result.message);
        }
        return fail(
          `expected one of union variants: ${messages.join("; ")}`,
          path,
        );
      },
    };
  },

  literal<T extends string | number | bigint | boolean | null>(
    literalValue: T,
  ): LiteralValidator<T> {
    return {
      kind: "literal",
      literalValue,
      normalize(value, path = []) {
        if (value === literalValue) {
          return success(literalValue);
        }
        return fail(`expected literal ${String(literalValue)}`, path);
      },
    };
  },

  optional<T>(inner: Validator<T>): OptionalValidator<T> {
    return {
      kind: "optional",
      isOptional: true,
      inner,
      normalize(value, path = []) {
        if (value === undefined) {
          return { ok: true, omitted: true };
        }
        return inner.normalize(value, path);
      },
    };
  },

  any(): Validator<any> {
    return {
      kind: "any",
      normalize: normalizeAny,
    };
  },
};
