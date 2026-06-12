import type { Row } from "../core/primitives";
import type { TableDefinition } from "../schema/table";
import {
  formatPath,
  hasNormalizeValue,
  isNormalizeFailure,
  isNormalizeOmitted,
  isOptionalValidator,
  type NormalizeResult,
  type ValidationPath,
  type Validator,
} from "../schema/values";
import {
  fail,
  isPlainObject,
  success,
  validObjectKey,
  validRecordKey,
} from "../schema/validation-utils";

export type CodecOptions = {
  runtimeValidation: boolean;
};

function sanitizeAny(
  value: unknown,
  path: ValidationPath = [],
): NormalizeResult<unknown> {
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

  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    return success(value);
  }

  if (Array.isArray(value)) {
    const normalized: unknown[] = [];
    for (let index = 0; index < value.length; index++) {
      const item = sanitizeAny(value[index], [...path, index]);
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
      const field = sanitizeAny(fieldValue, [...path, key]);
      if (isNormalizeFailure(field)) return field;
      if (hasNormalizeValue(field)) normalized[key] = field.value;
    }
    return success(normalized);
  }

  return fail(`unsupported value type ${typeof value}`, path);
}

function sanitizeWithValidatorShape(
  validator: Validator<unknown>,
  value: unknown,
  path: ValidationPath = [],
): NormalizeResult<unknown> {
  if (validator.kind === "optional") {
    if (value === undefined) {
      return { ok: true, omitted: true };
    }
    return sanitizeWithValidatorShape(validator.inner, value, path);
  }

  if (value === undefined) {
    return fail("undefined is not a valid stored value", path);
  }

  if (validator.kind === "object" && isPlainObject(value)) {
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      if (!validObjectKey(key)) {
        return fail("object keys cannot be empty or start with $", [
          ...path,
          key,
        ]);
      }
      if (!(key in validator.fields)) {
        return fail(`unexpected object field ${key}`, [...path, key]);
      }
    }

    for (const [key, fieldValidator] of Object.entries(validator.fields)) {
      if (!(key in value)) {
        if (isOptionalValidator(fieldValidator)) continue;
        return fail("missing required field", [...path, key]);
      }

      const field = sanitizeWithValidatorShape(fieldValidator, value[key], [
        ...path,
        key,
      ]);
      if (isNormalizeFailure(field)) return field;
      if (hasNormalizeValue(field)) normalized[key] = field.value;
    }
    return success(normalized);
  }

  if (validator.kind === "array" && Array.isArray(value)) {
    const normalized: unknown[] = [];
    for (let index = 0; index < value.length; index++) {
      const item = sanitizeWithValidatorShape(validator.item, value[index], [
        ...path,
        index,
      ]);
      if (isNormalizeFailure(item)) return item;
      if (isNormalizeOmitted(item)) {
        return fail("undefined is not valid inside arrays", [...path, index]);
      }
      normalized.push(item.value);
    }
    return success(normalized);
  }

  if (validator.kind === "record" && isPlainObject(value)) {
    const normalized: Record<string, unknown> = {};
    for (const [key, fieldValue] of Object.entries(value)) {
      if (!validRecordKey(key)) {
        return fail(
          "record keys must be non-empty ASCII keys that do not start with $",
          [...path, key],
        );
      }

      const field = sanitizeWithValidatorShape(
        validator.valueValidator,
        fieldValue,
        [...path, key],
      );
      if (isNormalizeFailure(field)) return field;
      if (isNormalizeOmitted(field)) {
        return fail("undefined is not valid as a record value", [...path, key]);
      }
      normalized[key] = field.value;
    }
    return success(normalized);
  }

  return sanitizeAny(value, path);
}

function errorPrefix(table: TableDefinition, value: unknown): string {
  const id =
    isPlainObject(value) && "id" in value && value.id !== undefined
      ? ` record ${String(value.id)}`
      : "";
  return `Table ${table.tableName}${id}`;
}

function assertRecordResult<T>(
  table: TableDefinition,
  original: unknown,
  result: NormalizeResult<T>,
): T {
  if (isNormalizeFailure(result)) {
    throw new Error(
      `${errorPrefix(table, original)}: ${result.message} at ${formatPath(
        result.path,
      )}`,
    );
  }
  if (isNormalizeOmitted(result)) {
    throw new Error(`${errorPrefix(table, original)}: record was omitted`);
  }
  return result.value;
}

function assertStringId(table: TableDefinition, original: unknown, value: unknown) {
  if (!isPlainObject(value) || typeof value.id !== "string") {
    throw new Error(`${errorPrefix(table, original)}: id must be a string at id`);
  }
}

function encodeBytes(bytes: Uint8Array): number[] {
  return Array.from(bytes);
}

export function encodeValueForStorage(value: unknown): unknown {
  if (typeof value === "bigint") {
    return { $hyperdbType: "bigint", value: value.toString() };
  }

  if (value instanceof ArrayBuffer) {
    return {
      $hyperdbType: "arrayBuffer",
      value: encodeBytes(new Uint8Array(value)),
    };
  }

  if (ArrayBuffer.isView(value)) {
    return {
      $hyperdbType: "bytes",
      value: encodeBytes(
        new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
      ),
    };
  }

  if (Array.isArray(value)) {
    return value.map(encodeValueForStorage);
  }

  if (isPlainObject(value)) {
    const encoded: Record<string, unknown> = {};
    for (const [key, fieldValue] of Object.entries(value)) {
      encoded[key] = encodeValueForStorage(fieldValue);
    }
    return encoded;
  }

  return value;
}

export function decodeValueFromStorage(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(decodeValueFromStorage);
  }

  if (isPlainObject(value)) {
    if (value.$hyperdbType === "bigint" && typeof value.value === "string") {
      return BigInt(value.value);
    }

    if (
      value.$hyperdbType === "arrayBuffer" &&
      Array.isArray(value.value)
    ) {
      return new Uint8Array(value.value as number[]).buffer;
    }

    if (value.$hyperdbType === "bytes" && Array.isArray(value.value)) {
      return new Uint8Array(value.value as number[]);
    }

    const decoded: Record<string, unknown> = {};
    for (const [key, fieldValue] of Object.entries(value)) {
      decoded[key] = decodeValueFromStorage(fieldValue);
    }
    return decoded;
  }

  return value;
}

export function normalizeRecordForDriver<TTable extends TableDefinition>(
  table: TTable,
  record: unknown,
  options: CodecOptions,
): Row {
  const normalized = table.schemaValidator
    ? options.runtimeValidation
      ? assertRecordResult(table, record, table.schemaValidator.normalize(record))
      : assertRecordResult(
          table,
          record,
          sanitizeWithValidatorShape(table.schemaValidator, record),
        )
    : assertRecordResult(table, record, sanitizeAny(record));

  assertStringId(table, record, normalized);

  return normalized as Row;
}

export function normalizeRecordsForDriver<TTable extends TableDefinition>(
  table: TTable,
  records: unknown[],
  options: CodecOptions,
): Row[] {
  return records.map((record) => normalizeRecordForDriver(table, record, options));
}

export function validateRecordFromDriver<T>(
  table: TableDefinition<T>,
  record: unknown,
  options: CodecOptions,
): T {
  if (!options.runtimeValidation || !table.schemaValidator) {
    return record as T;
  }

  return assertRecordResult(table, record, table.schemaValidator.normalize(record));
}

export function validateRecordsFromDriver<T>(
  table: TableDefinition<T>,
  records: unknown[],
  options: CodecOptions,
): T[] {
  return records.map((record) => validateRecordFromDriver(table, record, options));
}
