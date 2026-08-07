import type { SqliteRowCompression } from "@will-be-done/hyperdb/drivers/sqlite";
import { compressFrameSync, decompressFrameSync } from "lz4-napi";

const MAGIC = new Uint8Array([0x48, 0x44, 0x42, 0x52]); // HDBR
const VERSION = 1;
const HEADER_LENGTH = 10;
const COMPRESSION_THRESHOLD = 256;
const MINIMUM_COMPRESSION_SAVINGS = 32;

export const TURSO_ROW_ENCODING_RAW = 0;
export const TURSO_ROW_ENCODING_LZ4 = 1;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });

function encodeEnvelope(
  encoding: number,
  originalLength: number,
  payload: Uint8Array,
): Uint8Array {
  const envelope = new Uint8Array(HEADER_LENGTH + payload.byteLength);
  envelope.set(MAGIC);
  envelope[4] = VERSION;
  envelope[5] = encoding;
  new DataView(envelope.buffer).setUint32(6, originalLength, true);
  envelope.set(payload, HEADER_LENGTH);
  return envelope;
}

function compress(data: string): Uint8Array {
  const raw = textEncoder.encode(data);
  if (raw.byteLength > 0xffff_ffff) {
    throw new Error("Turso row JSON exceeds the 4 GiB compression limit");
  }

  if (raw.byteLength >= COMPRESSION_THRESHOLD) {
    const compressed = compressFrameSync(Buffer.from(raw));
    if (
      compressed.byteLength + MINIMUM_COMPRESSION_SAVINGS <=
      raw.byteLength
    ) {
      return encodeEnvelope(TURSO_ROW_ENCODING_LZ4, raw.byteLength, compressed);
    }
  }

  return encodeEnvelope(TURSO_ROW_ENCODING_RAW, raw.byteLength, raw);
}

function decompress(data: Uint8Array): string {
  if (data.byteLength < HEADER_LENGTH) {
    throw new Error("Invalid Turso row-compression envelope: truncated header");
  }
  for (let index = 0; index < MAGIC.byteLength; index += 1) {
    if (data[index] !== MAGIC[index]) {
      throw new Error("Invalid Turso row-compression envelope: bad magic");
    }
  }
  if (data[4] !== VERSION) {
    throw new Error(
      `Unsupported Turso row-compression version: ${String(data[4])}`,
    );
  }

  const encoding = data[5];
  const originalLength = new DataView(
    data.buffer,
    data.byteOffset,
    data.byteLength,
  ).getUint32(6, true);
  const payload = data.subarray(HEADER_LENGTH);

  let raw: Uint8Array;
  if (encoding === TURSO_ROW_ENCODING_RAW) {
    raw = payload;
  } else if (encoding === TURSO_ROW_ENCODING_LZ4) {
    try {
      raw = decompressFrameSync(Buffer.from(payload));
    } catch (error) {
      throw new Error("Invalid Turso row-compression envelope: bad LZ4 frame", {
        cause: error,
      });
    }
  } else {
    throw new Error(
      `Unsupported Turso row-compression encoding: ${String(encoding)}`,
    );
  }

  if (raw.byteLength !== originalLength) {
    throw new Error(
      `Invalid Turso row-compression envelope: expected ${originalLength} bytes, got ${raw.byteLength}`,
    );
  }

  try {
    return textDecoder.decode(raw);
  } catch (error) {
    throw new Error("Invalid UTF-8 in Turso row-compression envelope", {
      cause: error,
    });
  }
}

export const tursoRowCompression: SqliteRowCompression = {
  compress,
  decompress,
};
