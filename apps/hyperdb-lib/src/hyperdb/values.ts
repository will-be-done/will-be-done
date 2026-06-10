/* eslint-disable @typescript-eslint/no-explicit-any */

export type Infer<TValidator> =
  TValidator extends Validator<infer TValue> ? TValue : never;

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

export type ValidationPath = readonly (string | number)[];

export type NormalizeResult<T> =
  | { ok: true; value: T; omitted: false }
  | { ok: true; omitted: true }
  | { ok: false; message: string; path: ValidationPath };

export interface Validator<T> {
  readonly kind: string;
  readonly literalValue?: unknown;
  readonly validators?: readonly Validator<any>[];
  readonly fields?: Record<string, Validator<any>>;
  readonly inner?: Validator<any>;
  readonly item?: Validator<any>;
  readonly keyValidator?: Validator<any>;
  readonly valueValidator?: Validator<any>;
  normalize(value: unknown, path?: ValidationPath): NormalizeResult<T>;
}

export interface OptionalValidator<T> extends Validator<T | undefined> {
  readonly isOptional: true;
  readonly inner: Validator<T>;
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

function validObjectKey(key: string): boolean {
  return key !== "" && !key.startsWith("$");
}

function validRecordKey(key: string): boolean {
  return validObjectKey(key) && /^[\x00-\x7F]+$/.test(key);
}

function fail(message: string, path: ValidationPath): NormalizeResult<never> {
  return { ok: false, message, path };
}

function success<T>(value: T): NormalizeResult<T> {
  return { ok: true, value, omitted: false };
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof ArrayBuffer) &&
    !ArrayBuffer.isView(value)
  );
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

function primitive<T>(
  kind: string,
  guard: (value: unknown) => value is T,
  expected: string,
): Validator<T> {
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
    case "boolean":
    case "null":
      return true;
    case "literal": {
      const literalValue = (validator as { literalValue?: unknown }).literalValue;
      return (
        literalValue === null ||
        typeof literalValue === "string" ||
        typeof literalValue === "number" ||
        typeof literalValue === "boolean"
      );
    }
    case "union":
      return (
        validator.validators?.every(isIndexableValueValidator) === true
      );
    case "optional":
      return validator.inner ? isIndexableValueValidator(validator.inner) : false;
    default:
      return false;
  }
}

export const v = {
  string(): Validator<string> {
    return primitive("string", (value): value is string => typeof value === "string", "string");
  },

  number(): Validator<number> {
    return primitive(
      "number",
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value),
      "finite number",
    );
  },

  boolean(): Validator<boolean> {
    return primitive(
      "boolean",
      (value): value is boolean => typeof value === "boolean",
      "boolean",
    );
  },

  null(): Validator<null> {
    return primitive("null", (value): value is null => value === null, "null");
  },

  array<T>(item: Validator<T>): Validator<T[]> {
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
  ): Validator<InferObject<TFields>> {
    return {
      kind: "object",
      fields,
      normalize(value, path = []) {
        if (!isPlainObject(value)) {
          return fail("expected object", path);
        }

        for (const key of Object.keys(fields)) {
          if (!validObjectKey(key)) {
            return fail("object keys cannot be empty or start with $", [
              ...path,
              key,
            ]);
          }
        }

        for (const key of Object.keys(value)) {
          if (!validObjectKey(key)) {
            return fail("object keys cannot be empty or start with $", [
              ...path,
              key,
            ]);
          }
          if (!(key in fields)) {
            return fail(`unexpected object field ${key}`, [...path, key]);
          }
        }

        const normalized: Record<string, unknown> = {};
        for (const [key, validator] of Object.entries(fields)) {
          if (!(key in value)) {
            if ((validator as OptionalValidator<any>).isOptional) continue;
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
  ): Validator<Record<TKey, TValue>> {
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
  ): Validator<Infer<TValidators[number]>> {
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
        return fail(`expected one of union variants: ${messages.join("; ")}`, path);
      },
    };
  },

  literal<T extends string | number | boolean | null>(
    literalValue: T,
  ): Validator<T> {
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
