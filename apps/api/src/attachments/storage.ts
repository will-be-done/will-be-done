import { createReadStream } from "node:fs";
import { mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Context, Data, Effect, Layer } from "effect";
import { AppEnv, type EnvConfig } from "../env";

export type StoredAttachment = { id: string; modifiedAt: number };

export class AttachmentStorageError extends Data.TaggedError(
  "AttachmentStorageError",
)<{ readonly operation: string; readonly cause: unknown }> {}

type Result<A> = Effect.Effect<A, AttachmentStorageError>;

// Attachment bytes are immutable once written: an ID always names the same
// content, so writes are idempotent and readers can cache forever.
export interface AttachmentStore {
  readonly put: (spaceId: string, id: string, body: Buffer) => Result<void>;
  readonly get: (
    spaceId: string,
    id: string,
  ) => Result<{ body: Readable; size: number } | undefined>;
  readonly delete: (spaceId: string, id: string) => Result<void>;
  readonly listSpaces: Result<string[]>;
  readonly list: (spaceId: string) => Result<StoredAttachment[]>;
}

const SAFE_ID = /^[A-Za-z0-9_-]+$/;

const assertSafeId = (value: string) => {
  if (!SAFE_ID.test(value)) throw new Error(`Unsafe storage key: ${value}`);
};

const attempt = <A>(operation: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => new AttachmentStorageError({ operation, cause }),
  });

const isMissingFile = (error: unknown) =>
  (error as NodeJS.ErrnoException).code === "ENOENT";

export const makeLocalAttachmentStorage = (root: string): AttachmentStore => {
  const file = (spaceId: string, id: string) => {
    assertSafeId(spaceId);
    assertSafeId(id);
    return path.join(root, spaceId, id);
  };
  return {
    put: (spaceId, id, body) =>
      attempt("put", async () => {
        const target = file(spaceId, id);
        await mkdir(path.dirname(target), { recursive: true });
        // Readers never see a partially written file.
        const temp = `${target}.${crypto.randomUUID()}.tmp`;
        await writeFile(temp, body);
        await rename(temp, target);
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
          .filter((entry) => entry.isDirectory() && SAFE_ID.test(entry.name))
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
        for (const name of names) {
          if (!SAFE_ID.test(name)) continue;
          files.push({
            id: name,
            modifiedAt: (await stat(path.join(dir, name))).mtimeMs,
          });
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
    put: (spaceId, id, body) =>
      attempt("put", async () => {
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key(spaceId, id),
            Body: body,
            ContentLength: body.length,
          }),
        );
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
          if (name && SAFE_ID.test(name)) spaces.push(name);
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
            if (!id || !SAFE_ID.test(id)) continue;
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
