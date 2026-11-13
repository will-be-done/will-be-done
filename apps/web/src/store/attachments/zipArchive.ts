import { inflateSync, Zip, ZipDeflate, ZipPassThrough } from "fflate";

const END_SIGNATURE = 0x06054b50;
const ENTRY_SIGNATURE = 0x02014b50;
const END_SIZE = 22;
const MAX_COMMENT_SIZE = 0xffff;
const ENTRY_SIZE = 46;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const LOCAL_HEADER_SIZE = 30;
const MAX_ARCHIVE_SIZE = 0xffffffff;
const STORED = 0;
const DEFLATED = 8;

// Builds a zip one file at a time. Finished files are handed to the browser
// as Blobs, so the page holds only the file being added.
export const makeZipWriter = () => {
  const parts: Blob[] = [];
  let chunks: Uint8Array[] = [];
  let failure: unknown;
  const zip = new Zip((cause, chunk) => {
    if (cause) failure = cause;
    else chunks.push(chunk);
  });
  let size = 0;
  const flush = () => {
    if (failure) throw failure;
    const part = new Blob(chunks as BlobPart[]);
    size += part.size;
    // Larger archives need Zip64, which neither side here speaks.
    if (size > MAX_ARCHIVE_SIZE) throw new Error("The archive is over 4 GB");
    parts.push(part);
    chunks = [];
  };

  return {
    // Stored as is, for content that is compressed already.
    add: (name: string, bytes: Uint8Array, options?: { compress: boolean }) => {
      const entry = options?.compress
        ? new ZipDeflate(name)
        : new ZipPassThrough(name);
      zip.add(entry);
      entry.push(bytes, true);
      flush();
    },
    finish: () => {
      zip.end();
      flush();
      return new Blob(parts, { type: "application/zip" });
    },
  };
};

// Reads entries straight from the file through its central directory. A
// stored entry is a slice of the file, so it costs no memory.
export const readZip = async (file: Blob) => {
  const tailStart = Math.max(0, file.size - END_SIZE - MAX_COMMENT_SIZE);
  const tail = new DataView(await file.slice(tailStart).arrayBuffer());
  let end = tail.byteLength - END_SIZE;
  while (end >= 0 && tail.getUint32(end, true) !== END_SIGNATURE) end--;
  if (end < 0) throw new Error("Not a zip archive");

  const count = tail.getUint16(end + 10, true);
  const directorySize = tail.getUint32(end + 12, true);
  const directoryStart = tail.getUint32(end + 16, true);
  if (count === 0xffff || directoryStart === 0xffffffff) {
    throw new Error("Zip64 archives are not supported");
  }
  if (directoryStart + directorySize > file.size) {
    throw new Error("The zip directory is damaged");
  }

  const bytes = new Uint8Array(
    await file
      .slice(directoryStart, directoryStart + directorySize)
      .arrayBuffer(),
  );
  const directory = new DataView(bytes.buffer);
  const decoder = new TextDecoder();
  const entries = new Map<
    string,
    { method: number; size: number; headerStart: number }
  >();
  let at = 0;
  for (let index = 0; index < count; index++) {
    if (
      at + ENTRY_SIZE > bytes.length ||
      directory.getUint32(at, true) !== ENTRY_SIGNATURE
    ) {
      throw new Error("The zip directory is damaged");
    }
    const nameSize = directory.getUint16(at + 28, true);
    const name = decoder.decode(
      bytes.subarray(at + ENTRY_SIZE, at + ENTRY_SIZE + nameSize),
    );
    entries.set(name, {
      method: directory.getUint16(at + 10, true),
      size: directory.getUint32(at + 20, true),
      headerStart: directory.getUint32(at + 42, true),
    });
    at +=
      ENTRY_SIZE +
      nameSize +
      directory.getUint16(at + 30, true) +
      directory.getUint16(at + 32, true);
  }

  return {
    get: async (name: string, type?: string) => {
      const entry = entries.get(name);
      if (!entry) return undefined;
      if (entry.headerStart + LOCAL_HEADER_SIZE > file.size) {
        throw new Error(`The zip entry ${name} is damaged`);
      }
      const header = new DataView(
        await file
          .slice(entry.headerStart, entry.headerStart + LOCAL_HEADER_SIZE)
          .arrayBuffer(),
      );
      const start =
        entry.headerStart +
        LOCAL_HEADER_SIZE +
        header.getUint16(26, true) +
        header.getUint16(28, true);
      if (
        header.getUint32(0, true) !== LOCAL_HEADER_SIGNATURE ||
        start + entry.size > file.size
      ) {
        throw new Error(`The zip entry ${name} is damaged`);
      }
      const content = file.slice(start, start + entry.size, type);
      if (entry.method === STORED) return content;
      if (entry.method !== DEFLATED) {
        throw new Error(`Unsupported zip compression ${entry.method}`);
      }
      const inflated = inflateSync(new Uint8Array(await content.arrayBuffer()));
      return new Blob([inflated as BlobPart], { type });
    },
  };
};
