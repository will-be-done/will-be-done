import {
  S3Client as AWSS3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { readFile, stat } from "fs/promises";
import { Effect } from "effect";
import type { BackupConfig } from "./types";

const UPLOAD_TIMEOUT = "5 minutes";

export class S3Client {
  private client: AWSS3Client;
  private bucketName: string;

  constructor(config: BackupConfig) {
    console.log("[S3Client] Initializing S3 client");
    this.bucketName = config.WBD_BACKUP_S3_BUCKET_NAME!;

    this.client = new AWSS3Client({
      region: config.WBD_BACKUP_S3_REGION,
      credentials: {
        accessKeyId: config.WBD_BACKUP_S3_ACCESS_KEY_ID!,
        secretAccessKey: config.WBD_BACKUP_S3_SECRET_ACCESS_KEY!,
      },
      endpoint: config.WBD_BACKUP_S3_ENDPOINT,
      forcePathStyle: true, // Required for MinIO and some S3-compatible services
      requestChecksumCalculation: "WHEN_REQUIRED", // Disable automatic checksums for R2 compatibility (AWS SDK v3 >= 3.729.0)
      responseChecksumValidation: "WHEN_REQUIRED", // Disable checksum validation on GET operations for R2 compatibility
    });
  }

  async verifyBucketAccess(): Promise<void> {
    try {
      await this.client.send(
        new HeadBucketCommand({
          Bucket: this.bucketName,
        }),
      );
      console.log(`[S3Client] ✓ Bucket access verified: ${this.bucketName}`);
    } catch (error: unknown) {
      const err = error as Record<string, unknown>;
      console.error(`[S3Client] ✗ Bucket access failed:`, err?.message);
      throw new Error(
        `Cannot access S3 bucket "${this.bucketName}": ${err?.message || String(error)}`,
        { cause: error },
      );
    }
  }

  async uploadFile(localPath: string, s3Key: string): Promise<string> {
    const fileStats = await stat(localPath);
    const startTime = Date.now();

    try {
      const fileBuffer = await readFile(localPath);

      await Effect.runPromise(
        Effect.tryPromise({
          try: (abortSignal) =>
            this.client.send(
              new PutObjectCommand({
                Bucket: this.bucketName,
                Key: s3Key,
                Body: fileBuffer,
                ContentLength: fileStats.size,
                Metadata: {
                  originalPath: localPath,
                  uploadedAt: new Date().toISOString(),
                },
              }),
              { abortSignal },
            ),
          catch: (error) => error,
        }).pipe(
          Effect.timeoutOrElse({
            duration: UPLOAD_TIMEOUT,
            orElse: () =>
              Effect.fail(
                new Error(`Upload timeout after 5 minutes for ${s3Key}`),
              ),
          }),
        ),
      );

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(
        `[S3Client] Uploaded ${s3Key} in ${duration}s (${(fileStats.size / 1024 / 1024).toFixed(2)} MB)`,
      );
    } catch (error: unknown) {
      const err = error as Record<string, unknown>;
      console.error(`[S3Client] Upload failed for ${s3Key}:`, err?.message);
      const errorMsg = `S3 upload failed for ${s3Key}: ${
        (err?.message as string) || String(error)
      }`;
      throw new Error(errorMsg, { cause: error });
    }

    return s3Key;
  }

  async deleteFile(s3Key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
      }),
    );
  }

  async deleteFiles(s3Keys: string[]): Promise<void> {
    if (s3Keys.length === 0) return;

    // S3 DeleteObjects supports up to 1000 keys per request
    const chunkSize = 1000;
    for (let i = 0; i < s3Keys.length; i += chunkSize) {
      const chunk = s3Keys.slice(i, i + chunkSize);

      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucketName,
          Delete: {
            Objects: chunk.map((key) => ({ Key: key })),
          },
        }),
      );
    }
  }

  async listFiles(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let continuationToken: string | undefined;

    do {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucketName,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );

      if (response.Contents) {
        keys.push(
          ...response.Contents.map((obj) => obj.Key!).filter(
            (key): key is string => Boolean(key),
          ),
        );
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return keys;
  }
}
