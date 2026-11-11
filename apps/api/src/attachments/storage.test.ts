import { createHash } from "node:crypto";
import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, test } from "bun:test";
import { Effect, Exit } from "effect";
import { makeLocalAttachmentStorage } from "./storage";

const sha256 = (text: string) =>
  createHash("sha256").update(text).digest("hex");

// Several chunks, as a request body arrives.
const body = (text: string) =>
  Readable.from(text.match(/.{1,3}/gs)!.map((part) => Buffer.from(part)));

let root: string | undefined;
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

const setup = async () => {
  root = await mkdtemp(path.join(tmpdir(), "wbd-attachments-"));
  return makeLocalAttachmentStorage(root);
};

describe("local attachment storage", () => {
  test("writes a streamed body and returns its checksum", async () => {
    const storage = await setup();

    const written = await Effect.runPromise(
      storage.put("space", "file", body("hello world"), { size: 11 }),
    );

    expect(written).toBe(sha256("hello world"));
    expect(await readFile(path.join(root!, "space", "file"), "utf8")).toBe(
      "hello world",
    );
  });

  test.each([
    ["longer", "hello world!", { size: 11 }],
    ["shorter", "hello", { size: 11 }],
    ["different", "hello there", { size: 11, sha256: sha256("hello world") }],
  ])("leaves nothing behind for %s content", async (_name, text, expected) => {
    const storage = await setup();
    await Effect.runPromise(
      storage.put("space", "file", body("hello world"), { size: 11 }),
    );

    const exit = await Effect.runPromiseExit(
      storage.put("space", "file", body(text), expected),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    expect(await readdir(path.join(root!, "space"))).toEqual(["file"]);
    expect(await readFile(path.join(root!, "space", "file"), "utf8")).toBe(
      "hello world",
    );
  });

  test("listing removes temp files a crash left behind", async () => {
    const storage = await setup();
    await Effect.runPromise(
      storage.put("space", "file", body("hello world"), { size: 11 }),
    );
    const dir = path.join(root!, "space");
    await writeFile(path.join(dir, "file.stale.tmp"), "partial");
    const old = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await utimes(path.join(dir, "file.stale.tmp"), old, old);
    // Possibly still being written.
    await writeFile(path.join(dir, "file.fresh.tmp"), "partial");

    const listed = await Effect.runPromise(storage.list("space"));

    expect(listed.map(({ id }) => id)).toEqual(["file"]);
    expect((await readdir(dir)).sort()).toEqual(["file", "file.fresh.tmp"]);
  });
});
