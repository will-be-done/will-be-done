import { createHash } from "node:crypto";
import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, test } from "bun:test";
import { Effect, Exit } from "effect";
import { parseEnvConfig } from "../env";
import {
  AttachmentContentMismatchError,
  makeAttachmentStorage,
  makeLocalAttachmentStorage,
} from "./storage";

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

describe("S3 attachment storage", () => {
  test("reports bytes S3 rejects by checksum as mismatched content", async () => {
    // S3 reads the whole body, then refuses a wrong x-amz-checksum-sha256.
    const stored: string[] = [];
    const server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        const received = Buffer.concat(chunks);
        const checksum = request.headers["x-amz-checksum-sha256"];
        const digest = createHash("sha256").update(received).digest("base64");
        if (checksum === undefined || checksum === digest) {
          stored.push(received.toString());
          response.writeHead(200);
          response.end();
          return;
        }
        response.writeHead(400, { "content-type": "application/xml" });
        response.end(
          "<Error><Code>BadDigest</Code><Message>Checksum mismatch</Message></Error>",
        );
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    try {
      const { port } = server.address() as AddressInfo;
      const storage = makeAttachmentStorage(
        parseEnvConfig({
          WBD_ATTACHMENTS_STORAGE: "s3",
          WBD_ATTACHMENTS_S3_ENDPOINT: `http://127.0.0.1:${port}`,
          WBD_ATTACHMENTS_S3_BUCKET_NAME: "bucket",
          WBD_ATTACHMENTS_S3_ACCESS_KEY_ID: "key",
          WBD_ATTACHMENTS_S3_SECRET_ACCESS_KEY: "secret",
        }),
      );

      await Effect.runPromise(
        storage.put("space", "file", body("hello world"), {
          size: 11,
          sha256: sha256("hello world"),
        }),
      );
      const error = await Effect.runPromise(
        Effect.flip(
          storage.put("space", "file", body("hello there"), {
            size: 11,
            sha256: sha256("hello world"),
          }),
        ),
      );

      expect(error).toBeInstanceOf(AttachmentContentMismatchError);
      expect(stored).toEqual(["hello world"]);
    } finally {
      server.close();
    }
  });
});
