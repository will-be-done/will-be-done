import { createReadStream } from "node:fs";
import { mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { z } from "zod";
import { getEnvConfig } from "../env";

export type StoredAttachment = { id: string; modifiedAt: number };

// Attachment bytes are immutable once written: an ID always names the same
// content, so writes are idempotent and readers can cache forever.
export interface AttachmentStorage {
  put(spaceId: string, id: string, body: Buffer): Promise<void>;
  get(
    spaceId: string,
    id: string,
  ): Promise<{ body: Readable; size: number } | undefined>;
  has(spaceId: string, id: string): Promise<boolean>;
  delete(spaceId: string, id: string): Promise<void>;
  listSpaces(): Promise<string[]>;
  list(spaceId: string): Promise<StoredAttachment[]>;
}

const SAFE_ID = /^[A-Za-z0-9_-]+$/;

const assertSafeId = (value: string) => {
  if (!SAFE_ID.test(value)) throw new Error(`Unsafe storage key: ${value}`);
};

export class LocalAttachmentStorage implements AttachmentStorage {
  constructor(readonly root: string) {}

  private file(spaceId: string, id: string) {
    assertSafeId(spaceId);
    assertSafeId(id);
    return path.join(this.root, spaceId, id);
  }

  async put(spaceId: string, id: string, body: Buffer) {
    const target = this.file(spaceId, id);
    await mkdir(path.dirname(target), { recursive: true });
    // Readers never see a partially written file.
    const temp = `${target}.${crypto.randomUUID()}.tmp`;
    await writeFile(temp, body);
    await rename(temp, target);
  }

  async get(spaceId: string, id: string) {
    const target = this.file(spaceId, id);
    try {
      const { size } = await stat(target);
      return { body: createReadStream(target), size };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }

  async has(spaceId: string, id: string) {
    try {
      await stat(this.file(spaceId, id));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }

  async delete(spaceId: string, id: string) {
    await rm(this.file(spaceId, id), { force: true });
  }

  async listSpaces() {
    try {
      const entries = await readdir(this.root, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isDirectory() && SAFE_ID.test(entry.name))
        .map((entry) => entry.name);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  async list(spaceId: string) {
    assertSafeId(spaceId);
    const dir = path.join(this.root, spaceId);
    let names: string[];
    try {
      names = await readdir(dir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
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
  }
}

export class S3AttachmentStorage implements AttachmentStorage {
  constructor(
    private client: S3Client,
    private bucket: string,
    private prefix: string,
  ) {}

  private key(spaceId: string, id: string) {
    assertSafeId(spaceId);
    assertSafeId(id);
    return `${this.prefix}${spaceId}/${id}`;
  }

  async put(spaceId: string, id: string, body: Buffer) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.key(spaceId, id),
        Body: body,
        ContentLength: body.length,
      }),
    );
  }

  async get(spaceId: string, id: string) {
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: this.key(spaceId, id),
        }),
      );
      return {
        body: response.Body as Readable,
        size: response.ContentLength ?? 0,
      };
    } catch (error) {
      if ((error as { name?: string }).name === "NoSuchKey") return undefined;
      throw error;
    }
  }

  async has(spaceId: string, id: string) {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: this.key(spaceId, id),
        }),
      );
      return true;
    } catch (error) {
      const { name, $metadata } = error as {
        name?: string;
        $metadata?: { httpStatusCode?: number };
      };
      if (name === "NotFound" || $metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  async delete(spaceId: string, id: string) {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: this.key(spaceId, id),
      }),
    );
  }

  private async *pages(prefix: string, delimiter?: string) {
    let continuationToken: string | undefined;
    do {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          Delimiter: delimiter,
          ContinuationToken: continuationToken,
        }),
      );
      yield response;
      continuationToken = response.NextContinuationToken;
    } while (continuationToken);
  }

  async listSpaces() {
    const spaces: string[] = [];
    for await (const page of this.pages(this.prefix, "/")) {
      for (const { Prefix } of page.CommonPrefixes ?? []) {
        const name = Prefix?.slice(this.prefix.length).replace(/\/$/, "");
        if (name && SAFE_ID.test(name)) spaces.push(name);
      }
    }
    return spaces;
  }

  async list(spaceId: string) {
    assertSafeId(spaceId);
    const prefix = `${this.prefix}${spaceId}/`;
    const files: StoredAttachment[] = [];
    for await (const page of this.pages(prefix)) {
      for (const object of page.Contents ?? []) {
        const id = object.Key?.slice(prefix.length);
        if (!id || !SAFE_ID.test(id)) continue;
        files.push({ id, modifiedAt: object.LastModified?.getTime() ?? 0 });
      }
    }
    return files;
  }
}

const AttachmentConfigSchema = z.object({
  WBD_ATTACHMENTS_STORAGE: z.enum(["local", "s3"]).default("local"),
  WBD_ATTACHMENTS_PATH: z.string().optional(),
  WBD_ATTACHMENTS_S3_ACCESS_KEY_ID: z.string().optional(),
  WBD_ATTACHMENTS_S3_SECRET_ACCESS_KEY: z.string().optional(),
  WBD_ATTACHMENTS_S3_ENDPOINT: z.string().optional(),
  WBD_ATTACHMENTS_S3_BUCKET_NAME: z.string().optional(),
  WBD_ATTACHMENTS_S3_REGION: z.string().default("us-east-1"),
  WBD_ATTACHMENTS_S3_PREFIX: z.string().default("attachments/"),
});

export const attachmentStoragePath = () =>
  process.env.WBD_ATTACHMENTS_PATH ||
  path.join(getEnvConfig().WBD_STORAGE_PATH, "attachments");

export function createAttachmentStorage(): AttachmentStorage {
  const config = AttachmentConfigSchema.parse(process.env);
  if (config.WBD_ATTACHMENTS_STORAGE === "local") {
    return new LocalAttachmentStorage(attachmentStoragePath());
  }
  const missing = (
    [
      "WBD_ATTACHMENTS_S3_ACCESS_KEY_ID",
      "WBD_ATTACHMENTS_S3_SECRET_ACCESS_KEY",
      "WBD_ATTACHMENTS_S3_BUCKET_NAME",
    ] as const
  ).filter((name) => !config[name]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Missing required attachment S3 environment variables: ${missing.join(", ")}`,
    );
  }
  const client = new S3Client({
    region: config.WBD_ATTACHMENTS_S3_REGION,
    credentials: {
      accessKeyId: config.WBD_ATTACHMENTS_S3_ACCESS_KEY_ID!,
      secretAccessKey: config.WBD_ATTACHMENTS_S3_SECRET_ACCESS_KEY!,
    },
    endpoint: config.WBD_ATTACHMENTS_S3_ENDPOINT,
    // MinIO and R2 compatibility, as for backups.
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  const prefix = config.WBD_ATTACHMENTS_S3_PREFIX.replace(/^\/+/, "");
  return new S3AttachmentStorage(
    client,
    config.WBD_ATTACHMENTS_S3_BUCKET_NAME!,
    prefix && !prefix.endsWith("/") ? `${prefix}/` : prefix,
  );
}

let storage: AttachmentStorage | undefined;

export const getAttachmentStorage = () =>
  (storage ??= createAttachmentStorage());
