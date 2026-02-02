import {
  S3Client as AWSS3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import type { BackupConfig } from "./types";

export class S3Client {
  private client: AWSS3Client;
  private bucketName: string;

  constructor(config: BackupConfig) {
    this.bucketName = config.S3_BUCKET_NAME!;

    this.client = new AWSS3Client({
      region: config.S3_REGION,
      credentials: {
        accessKeyId: config.S3_ACCESS_KEY_ID!,
        secretAccessKey: config.S3_SECRET_ACCESS_KEY!,
      },
      endpoint: config.S3_ENDPOINT,
      forcePathStyle: true, // Required for MinIO and some S3-compatible services
    });
  }

  async uploadFile(localPath: string, s3Key: string): Promise<string> {
    const fileStream = createReadStream(localPath);
    const fileStats = await stat(localPath);

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
        Body: fileStream,
        ContentLength: fileStats.size,
        Metadata: {
          originalPath: localPath,
          uploadedAt: new Date().toISOString(),
        },
      })
    );

    return s3Key;
  }

  async deleteFile(s3Key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
      })
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
        })
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
        })
      );

      if (response.Contents) {
        keys.push(
          ...response.Contents.map((obj) => obj.Key!).filter(
            (key): key is string => Boolean(key)
          )
        );
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return keys;
  }
}
