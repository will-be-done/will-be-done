import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline, type Readable, Transform } from "node:stream";
import { pipeline as pipelineAsync } from "node:stream/promises";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { ATTACHMENT_ID } from "@will-be-done/slices/space";
import { Context, Data, Effect, Layer } from "effect";
import { AppEnv, type EnvConfig } from "../env";

export type StoredAttachment = { id: string; modifiedAt: number };

export class AttachmentStorageError extends Data.TaggedError(
  "AttachmentStorageError",
)<{ readonly operation: string; readonly cause: unknown }> {}

// The body's length or checksum is not the one the caller expected.
export class AttachmentContentMismatchError extends Data.TaggedError(
  "AttachmentContentMismatchError",
) {}

type Result<A> = Effect.Effect<A, AttachmentStorageError>;

export type ExpectedContent = { size: number; sha256?: string };

// Attachment bytes are immutable once written: an ID always names the same
// content, so writes are idempotent and readers can cache forever.
export interface AttachmentStore {
  // Streams the body without holding it in memory. Bytes that do not match
  // `expected` never replace stored ones. Returns their SHA-256.
  readonly put: (
    spaceId: string,
    id: string,
    body: Readable,
    expected: ExpectedContent,
  ) => Effect.Effect<
    string,
    AttachmentStorageError | AttachmentContentMismatchError
  >;
  readonly get: (
    spaceId: string,
    id: string,
  ) => Result<{ body: Readable; size: number } | undefined>;
  readonly delete: (spaceId: string, id: string) => Result<void>;
  readonly listSpaces: Result<string[]>;
  readonly list: (spaceId: string) => Result<StoredAttachment[]>;
}

const assertSafeId = (value: string) => {
  if (!ATTACHMENT_ID.test(value)) throw new Error(`Unsafe storage key: ${value}`);
};

const attempt = <A>(operation: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => new AttachmentStorageError({ operation, cause }),
  });

const attemptPut = <A>(run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) =>
      cause instanceof AttachmentContentMismatchError
        ? cause
        : new AttachmentStorageError({ operation: "put", cause }),
  });

// Hashes and counts bytes as they stream past, failing unless exactly
// `expected.size` bytes pass. `digest` is undefined on a checksum mismatch,
// and is known once the whole body has passed.
const measure = (expected: ExpectedContent) => {
  const hash = createHash("sha256");
  let bytes = 0;
  let sha256: string | undefined;
  const stream = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > expected.size) {
        callback(new AttachmentContentMismatchError());
        return;
      }
      hash.update(chunk);
      callback(null, chunk);
    },
    flush(callback) {
      if (bytes !== expected.size) {
        callback(new AttachmentContentMismatchError());
        return;
      }
      sha256 = hash.digest("hex");
      callback();
    },
  });
  const complete = () => sha256 !== undefined;
  const digest = () =>
    !expected.sha256 || sha256 === expected.sha256 ? sha256 : undefined;
  return { stream, complete, digest };
};

// Uploads take minutes at most, so an older temp file was abandoned.
const STALE_TEMP_MS = 24 * 60 * 60 * 1000;

const isMissingFile = (error: unknown) =>
  (error as NodeJS.ErrnoException).code === "ENOENT";

export const makeLocalAttachmentStorage = (root: string): AttachmentStore => {
  const file = (spaceId: string, id: string) => {
    assertSafeId(spaceId);
    assertSafeId(id);
    return path.join(root, spaceId, id);
  };
  return {
    put: (spaceId, id, body, expected) =>
      attemptPut(async () => {
        const target = file(spaceId, id);
        await mkdir(path.dirname(target), { recursive: true });
        // Readers never see a partial or unchecked file.
        const temp = `${target}.${crypto.randomUUID()}.tmp`;
        const measured = measure(expected);
        try {
          await pipelineAsync(body, measured.stream, createWriteStream(temp));
          const sha256 = measured.digest();
          if (!sha256) throw new AttachmentContentMismatchError();
          await rename(temp, target);
          return sha256;
        } catch (error) {
          await rm(temp, { force: true });
          throw error;
        }
      }),
    get: (spaceId, id) =>
      attempt("get", async () => {
        const target = file(spaceId, id);
        try {
          const { size } = await stat(target);
          return { body: createReadStream(target), size };
        } catch (error) {
          if (isMissingFile(error)) return undefined;
          throw error;
        }
      }),
    delete: (spaceId, id) =>
      attempt("delete", () => rm(file(spaceId, id), { force: true })),
    listSpaces: attempt("listSpaces", async () => {
      try {
        const entries = await readdir(root, { withFileTypes: true });
        return entries
          .filter((entry) => entry.isDirectory() && ATTACHMENT_ID.test(entry.name))
          .map((entry) => entry.name);
      } catch (error) {
        if (isMissingFile(error)) return [];
        throw error;
      }
    }),
    list: (spaceId) =>
      attempt("list", async () => {
        assertSafeId(spaceId);
        const dir = path.join(root, spaceId);
        let names: string[];
        try {
          names = await readdir(dir);
        } catch (error) {
          if (isMissingFile(error)) return [];
          throw error;
        }
        const files: StoredAttachment[] = [];
        const staleBefore = Date.now() - STALE_TEMP_MS;
        for (const name of names) {
          const file = path.join(dir, name);
          let modifiedAt: number;
          try {
            modifiedAt = (await stat(file)).mtimeMs;
          } catch (error) {
            // Deleted since it was listed.
            if (isMissingFile(error)) continue;
            throw error;
          }
          if (ATTACHMENT_ID.test(name)) files.push({ id: name, modifiedAt });
          // A write that never finished: the process died mid-upload.
          else if (name.endsWith(".tmp") && modifiedAt < staleBefore) {
            await rm(file, { force: true });
          }
        }
        return files;
      }),
  };
};

const makeS3AttachmentStorage = (
  client: S3Client,
  bucket: string,
  prefix: string,
): AttachmentStore => {
  const key = (spaceId: string, id: string) => {
    assertSafeId(spaceId);
    assertSafeId(id);
    return `${prefix}${spaceId}/${id}`;
  };
  async function* pages(keyPrefix: string, delimiter?: string) {
    let continuationToken: string | undefined;
    do {
      const response = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: keyPrefix,
          Delimiter: delimiter,
          ContinuationToken: continuationToken,
        }),
      );
      yield response;
      continuationToken = response.NextContinuationToken;
    } while (continuationToken);
  }
  return {
    put: (spaceId, id, body, expected) =>
      attemptPut(async () => {
        const measured = measure(expected);
        // The SDK does not notice a failed body stream and would wait for the
        // rest of it, so an error aborts the request. S3 then stores nothing.
        const abort = new AbortController();
        let failure: unknown;
        const source = pipeline(body, measured.stream, (error) => {
          if (!error) return;
          failure = error;
          abort.abort(error);
        });
        await client
          .send(
            new PutObjectCommand({
              Bucket: bucket,
              Key: key(spaceId, id),
              Body: source,
              ContentLength: expected.size,
              // S3 rejects other bytes, so they never replace stored ones.
              ...(expected.sha256 && {
                ChecksumSHA256: Buffer.from(expected.sha256, "hex").toString(
                  "base64",
                ),
              }),
            }),
            { abortSignal: abort.signal },
          )
          .catch((error: unknown) => {
            if (failure) throw failure;
            // S3 refuses wrong bytes by their checksum, as a 400.
            if (measured.complete() && !measured.digest()) {
              throw new AttachmentContentMismatchError();
            }
            throw error;
          });
        // A body longer than its length can fail after S3 took the rest.
        if (failure) throw failure;
        const sha256 = measured.digest();
        if (!sha256) {
          // A store that ignored the checksum kept them anyway.
          await client.send(
            new DeleteObjectCommand({ Bucket: bucket, Key: key(spaceId, id) }),
          );
          throw new AttachmentContentMismatchError();
        }
        return sha256;
      }),
    get: (spaceId, id) =>
      attempt("get", async () => {
        try {
          const response = await client.send(
            new GetObjectCommand({ Bucket: bucket, Key: key(spaceId, id) }),
          );
          return {
            body: response.Body as Readable,
            size: response.ContentLength ?? 0,
          };
        } catch (error) {
          if ((error as { name?: string }).name === "NoSuchKey") {
            return undefined;
          }
          throw error;
        }
      }),
    delete: (spaceId, id) =>
      attempt("delete", async () => {
        await client.send(
          new DeleteObjectCommand({ Bucket: bucket, Key: key(spaceId, id) }),
        );
      }),
    listSpaces: attempt("listSpaces", async () => {
      const spaces: string[] = [];
      for await (const page of pages(prefix, "/")) {
        for (const { Prefix } of page.CommonPrefixes ?? []) {
          const name = Prefix?.slice(prefix.length).replace(/\/$/, "");
          if (name && ATTACHMENT_ID.test(name)) spaces.push(name);
        }
      }
      return spaces;
    }),
    list: (spaceId) =>
      attempt("list", async () => {
        assertSafeId(spaceId);
        const spacePrefix = `${prefix}${spaceId}/`;
        const files: StoredAttachment[] = [];
        for await (const page of pages(spacePrefix)) {
          for (const object of page.Contents ?? []) {
            const id = object.Key?.slice(spacePrefix.length);
            if (!id || !ATTACHMENT_ID.test(id)) continue;
            files.push({ id, modifiedAt: object.LastModified?.getTime() ?? 0 });
          }
        }
        return files;
      }),
  };
};

export const makeAttachmentStorage = (env: EnvConfig): AttachmentStore => {
  if (env.WBD_ATTACHMENTS_STORAGE === "local") {
    return makeLocalAttachmentStorage(env.WBD_ATTACHMENTS_PATH);
  }
  // parseEnvConfig requires the credentials and bucket for S3.
  const client = new S3Client({
    region: env.WBD_ATTACHMENTS_S3_REGION,
    credentials: {
      accessKeyId: env.WBD_ATTACHMENTS_S3_ACCESS_KEY_ID!,
      secretAccessKey: env.WBD_ATTACHMENTS_S3_SECRET_ACCESS_KEY!,
    },
    endpoint: env.WBD_ATTACHMENTS_S3_ENDPOINT,
    // MinIO and R2 compatibility, as for backups.
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  const prefix = env.WBD_ATTACHMENTS_S3_PREFIX.replace(/^\/+/, "");
  return makeS3AttachmentStorage(
    client,
    env.WBD_ATTACHMENTS_S3_BUCKET_NAME!,
    prefix && !prefix.endsWith("/") ? `${prefix}/` : prefix,
  );
};

export class AttachmentStorage extends Context.Service<
  AttachmentStorage,
  AttachmentStore
>()("@will-be-done/api/AttachmentStorage") {
  static readonly layer = Layer.effect(
    AttachmentStorage,
    Effect.gen(function* () {
      return makeAttachmentStorage(yield* AppEnv);
    }),
  );
}
