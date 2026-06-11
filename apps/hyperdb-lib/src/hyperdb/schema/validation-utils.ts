type ValidationPath = readonly (string | number)[];
type NormalizeResult<T> =
  | { ok: true; value: T; omitted: false }
  | { ok: true; omitted: true }
  | { ok: false; message: string; path: ValidationPath };

export function validObjectKey(key: string): boolean {
  return key !== "" && !key.startsWith("$");
}

export function validRecordKey(key: string): boolean {
  return validObjectKey(key) && /^[\x00-\x7F]+$/.test(key);
}

export function fail(message: string, path: ValidationPath): NormalizeResult<never> {
  return { ok: false, message, path };
}

export function success<T>(value: T): NormalizeResult<T> {
  return { ok: true, value, omitted: false };
}

export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof ArrayBuffer) &&
    !ArrayBuffer.isView(value)
  );
}
