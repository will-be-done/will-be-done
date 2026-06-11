/* eslint-disable @typescript-eslint/no-explicit-any */
import { MAX, MIN, type Row } from "../../core/primitives";
import { UnreachableError } from "../../utils";

export type SqliteSortKeyMode = "scan" | "stored";

const MAX_DECIMAL_LENGTH = 999999999999999;

function isEncodedObject(
  value: unknown,
): value is { $hyperdbType?: unknown; value?: unknown } {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !(value instanceof ArrayBuffer) &&
    !ArrayBuffer.isView(value)
  );
}

function toHex(value: number, width: number): string {
  return value.toString(16).padStart(width, "0");
}

function encodeCodeUnitString(value: string): string {
  let encoded = "";
  for (let i = 0; i < value.length; i++) {
    encoded += toHex(value.charCodeAt(i), 4);
  }
  return encoded + "!";
}

function encodeByteArray(bytes: readonly number[]): string {
  return bytes.map((byte) => toHex(byte, 2)).join("") + "!";
}

function isByteArray(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.every(
      (byte) =>
        Number.isInteger(byte) &&
        Number.isFinite(byte) &&
        byte >= 0 &&
        byte <= 255,
    )
  );
}

function isEncodedBytesObject(value: unknown): value is {
  $hyperdbType: "arrayBuffer" | "bytes";
  value: number[];
} {
  return (
    isEncodedObject(value) &&
    (value.$hyperdbType === "arrayBuffer" || value.$hyperdbType === "bytes") &&
    isByteArray(value.value)
  );
}

function bytesOf(value: unknown): number[] {
  if (value instanceof ArrayBuffer) {
    return Array.from(new Uint8Array(value));
  }
  if (ArrayBuffer.isView(value)) {
    return Array.from(
      new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
    );
  }
  if (isEncodedBytesObject(value)) {
    return value.value;
  }
  return [];
}

function bigintOf(value: unknown): bigint {
  if (typeof value === "bigint") {
    return value;
  }
  if (
    isEncodedObject(value) &&
    value.$hyperdbType === "bigint" &&
    typeof value.value === "string"
  ) {
    return BigInt(value.value);
  }
  throw new UnreachableError(value as never, "Expected bigint value");
}

function encodeBigint(value: unknown): string {
  const bigint = bigintOf(value);
  const negative = bigint < 0n;
  const digits = (negative ? -bigint : bigint).toString();
  if (digits.length > MAX_DECIMAL_LENGTH) {
    throw new Error("BigInt is too large to encode as a SQLite sort key");
  }

  if (!negative) {
    return `1${digits.length.toString().padStart(15, "0")}${digits}`;
  }

  const invertedLength = MAX_DECIMAL_LENGTH - digits.length;
  const invertedDigits = digits
    .split("")
    .map((digit) => String(9 - Number(digit)))
    .join("");

  return `0${invertedLength.toString().padStart(15, "0")}${invertedDigits}`;
}

function encodeNumber(value: number): string {
  const normalized = Object.is(value, -0) ? 0 : value;
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setFloat64(0, normalized, false);
  const bytes = Array.from(new Uint8Array(buffer));

  if ((bytes[0] & 0x80) !== 0) {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = (~bytes[i]) & 0xff;
    }
  } else {
    bytes[0] = bytes[0] ^ 0x80;
  }

  return bytes.map((byte) => toHex(byte, 2)).join("");
}

function encodeArrayPayload(values: readonly unknown[]): string {
  return values.map((item) => encodeStoredSortValue(item)).join("") + "!";
}

function encodeObjectPayload(value: Record<string, unknown>): string {
  const keys = Object.keys(value).sort();
  return (
    encodeArrayPayload(keys) +
    keys.map((key) => encodeStoredSortValue(value[key])).join("") +
    "!"
  );
}

function encodeScanSortValue(value: unknown): string {
  if (value === MIN) return "00";
  if (value === MAX) return "zz";
  if (value === null || value === undefined) return "20";
  if (typeof value === "number") return `40${encodeNumber(value)}`;
  if (typeof value === "boolean") return `40${encodeNumber(Number(value))}`;
  if (typeof value === "string") return `60${encodeCodeUnitString(value)}`;

  throw new UnreachableError(value as never, "Unknown scan sort-key value");
}

function encodeStoredSortValue(value: unknown): string {
  if (value === MIN) return "00";
  if (value === MAX) return "zz";
  if (value === undefined) return "10";
  if (value === null) return "20";

  if (
    typeof value === "bigint" ||
    (isEncodedObject(value) &&
      value.$hyperdbType === "bigint" &&
      typeof value.value === "string")
  ) {
    return `30${encodeBigint(value)}`;
  }

  if (typeof value === "number") return `40${encodeNumber(value)}`;
  if (typeof value === "boolean") return `50${value ? "1" : "0"}`;
  if (typeof value === "string") return `60${encodeCodeUnitString(value)}`;

  if (
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value) ||
    isEncodedBytesObject(value)
  ) {
    return `70${encodeByteArray(bytesOf(value))}`;
  }

  if (Array.isArray(value)) return `80${encodeArrayPayload(value)}`;
  if (isEncodedObject(value)) return `90${encodeObjectPayload(value)}`;

  throw new UnreachableError(value as never, "Unknown stored sort-key value");
}

export function encodeSqliteSortKeyTuple(
  tuple: readonly unknown[],
  mode: SqliteSortKeyMode,
): string {
  const encodeValue =
    mode === "stored" ? encodeStoredSortValue : encodeScanSortValue;

  return tuple.map((value) => encodeValue(value)).join("");
}

export function getSqliteSortKeyTuple(
  row: Row,
  indexColumns: readonly string[],
  includeMissing: boolean,
): unknown[] | undefined {
  const values: unknown[] = [];

  for (const col of indexColumns) {
    if (!Object.prototype.hasOwnProperty.call(row, col)) {
      if (!includeMissing) return undefined;
      values.push(undefined);
      continue;
    }

    const value = row[col];
    values.push(value === undefined && !includeMissing ? null : value);
  }

  return values;
}
