import { describe, expect, test } from "bun:test";
import {
  TURSO_ROW_ENCODING_LZ4,
  TURSO_ROW_ENCODING_RAW,
  tursoRowCompression,
} from "./tursoRowCompression";

function encodingOf(data: Uint8Array): number | undefined {
  return data[5];
}

function deterministicRandomBase64(length: number): string {
  const bytes = new Uint8Array(length);
  let state = 0x1234_5678;
  for (let index = 0; index < bytes.length; index += 1) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    bytes[index] = state >>> 24;
  }
  return Buffer.from(bytes).toString("base64");
}

describe("Turso row compression", () => {
  test("stores small JSON as raw UTF-8 in a versioned BLOB", () => {
    const json = JSON.stringify({ id: "one", value: 42 });

    const stored = tursoRowCompression.compress(json);

    expect(stored).toBeInstanceOf(Uint8Array);
    expect(encodingOf(stored)).toBe(TURSO_ROW_ENCODING_RAW);
    expect(tursoRowCompression.decompress(stored)).toBe(json);
  });

  test("uses LZ4 when it produces a worthwhile saving", () => {
    const json = JSON.stringify({
      id: "large-row",
      content: "repeated HyperDB row content ".repeat(500),
    });

    const stored = tursoRowCompression.compress(json);

    expect(encodingOf(stored)).toBe(TURSO_ROW_ENCODING_LZ4);
    expect(stored.byteLength).toBeLessThan(new TextEncoder().encode(json).length);
    expect(tursoRowCompression.decompress(stored)).toBe(json);
  });

  test("keeps large incompressible JSON raw", () => {
    const json = JSON.stringify({ value: deterministicRandomBase64(4_096) });

    const stored = tursoRowCompression.compress(json);

    expect(encodingOf(stored)).toBe(TURSO_ROW_ENCODING_RAW);
    expect(tursoRowCompression.decompress(stored)).toBe(json);
  });

  test("round-trips Unicode through the LZ4 representation", () => {
    const json = JSON.stringify({ value: "Привет 👋 こんにちは".repeat(100) });

    const stored = tursoRowCompression.compress(json);

    expect(encodingOf(stored)).toBe(TURSO_ROW_ENCODING_LZ4);
    expect(tursoRowCompression.decompress(stored)).toBe(json);
  });

  test("rejects invalid envelopes", () => {
    expect(() =>
      tursoRowCompression.decompress(new Uint8Array([1, 2, 3])),
    ).toThrow("truncated header");

    const valid = tursoRowCompression.compress('{"id":"one"}');

    const badMagic = valid.slice();
    badMagic[0] = 0;
    expect(() => tursoRowCompression.decompress(badMagic)).toThrow("bad magic");

    const badVersion = valid.slice();
    badVersion[4] = 2;
    expect(() => tursoRowCompression.decompress(badVersion)).toThrow(
      "Unsupported Turso row-compression version: 2",
    );

    const badEncoding = valid.slice();
    badEncoding[5] = 99;
    expect(() => tursoRowCompression.decompress(badEncoding)).toThrow(
      "Unsupported Turso row-compression encoding: 99",
    );

    const badLength = valid.slice();
    new DataView(badLength.buffer).setUint32(6, 999, true);
    expect(() => tursoRowCompression.decompress(badLength)).toThrow(
      "expected 999 bytes",
    );
  });
});
