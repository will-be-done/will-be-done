import { z } from "zod";
import type { BackupTier, BackupStatus } from "../slices/backupSlice";

export type { BackupTier, BackupStatus };

export const BackupConfigSchema = z.object({
  WBD_BACKUP_S3_ENABLED: z
    .string()
    .default("false")
    .transform((val) => val === "true"),
  WBD_BACKUP_S3_ACCESS_KEY_ID: z.string().optional(),
  WBD_BACKUP_S3_SECRET_ACCESS_KEY: z.string().optional(),
  WBD_BACKUP_S3_ENDPOINT: z.string().optional(),
  WBD_BACKUP_S3_BUCKET_NAME: z.string().optional(),
  WBD_BACKUP_S3_REGION: z.string().default("us-east-1"),
  WBD_BACKUP_ENABLED_TIERS: z
    .string()
    .default("hourly,daily,weekly,monthly")
    .transform((val) => val.split(",").map((s) => s.trim()) as BackupTier[]),
  WBD_BACKUP_HOURLY_INTERVAL_HOURS: z.coerce.number().int().min(1).default(6),
  WBD_BACKUP_HOURLY_KEEP_COUNT: z.coerce.number().int().min(1).default(2),
  WBD_BACKUP_DAILY_KEEP_DAYS: z.coerce.number().int().min(1).default(3),
  WBD_BACKUP_WEEKLY_KEEP_WEEKS: z.coerce.number().int().min(1).default(2),
  WBD_BACKUP_MONTHLY_KEEP_MONTHS: z.coerce.number().int().min(1).default(2),
});

export type BackupConfig = z.infer<typeof BackupConfigSchema>;

export type BackupMetadata = {
  files: string[];
  s3Keys: string[];
  totalSizeBytes: number;
  durationMs: number;
  error?: string;
};

export function getBackupConfig(): BackupConfig | null {
  const rawConfig = {
    WBD_BACKUP_S3_ENABLED: process.env.WBD_BACKUP_S3_ENABLED,
    WBD_BACKUP_S3_ACCESS_KEY_ID: process.env.WBD_BACKUP_S3_ACCESS_KEY_ID,
    WBD_BACKUP_S3_SECRET_ACCESS_KEY: process.env.WBD_BACKUP_S3_SECRET_ACCESS_KEY,
    WBD_BACKUP_S3_ENDPOINT: process.env.WBD_BACKUP_S3_ENDPOINT,
    WBD_BACKUP_S3_BUCKET_NAME: process.env.WBD_BACKUP_S3_BUCKET_NAME,
    WBD_BACKUP_S3_REGION: process.env.WBD_BACKUP_S3_REGION,
    WBD_BACKUP_HOURLY_INTERVAL_HOURS:
      process.env.WBD_BACKUP_HOURLY_INTERVAL_HOURS,
    WBD_BACKUP_HOURLY_KEEP_COUNT: process.env.WBD_BACKUP_HOURLY_KEEP_COUNT,
    WBD_BACKUP_DAILY_KEEP_DAYS: process.env.WBD_BACKUP_DAILY_KEEP_DAYS,
    WBD_BACKUP_WEEKLY_KEEP_WEEKS: process.env.WBD_BACKUP_WEEKLY_KEEP_WEEKS,
    WBD_BACKUP_MONTHLY_KEEP_MONTHS: process.env.WBD_BACKUP_MONTHLY_KEEP_MONTHS,
  };

  const config = BackupConfigSchema.parse(rawConfig);

  // If backup is disabled, return null
  if (!config.WBD_BACKUP_S3_ENABLED) {
    return null;
  }

  // If enabled, validate S3 credentials are present
  if (!config.WBD_BACKUP_S3_ACCESS_KEY_ID) {
    throw new Error(
      "WBD_BACKUP_S3_ACCESS_KEY_ID is required when backup is enabled",
    );
  }
  if (!config.WBD_BACKUP_S3_SECRET_ACCESS_KEY) {
    throw new Error(
      "WBD_BACKUP_S3_SECRET_ACCESS_KEY is required when backup is enabled",
    );
  }
  if (!config.WBD_BACKUP_S3_ENDPOINT) {
    throw new Error("WBD_BACKUP_S3_ENDPOINT is required when backup is enabled");
  }
  if (!config.WBD_BACKUP_S3_BUCKET_NAME) {
    throw new Error("WBD_BACKUP_S3_BUCKET_NAME is required when backup is enabled");
  }

  return config;
}
