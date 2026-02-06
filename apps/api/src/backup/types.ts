import { z } from "zod";
import type { BackupTier, BackupStatus } from "../slices/backupSlice";

export type { BackupTier, BackupStatus };

export const BackupConfigSchema = z.object({
  IS_S3_SQLITE_BACKUP_ENABLED: z
    .string()
    .default("false")
    .transform((val) => val === "true"),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_BUCKET_NAME: z.string().optional(),
  S3_REGION: z.string().default("us-east-1"),
  BACKUP_ENABLED_TIERS: z
    .string()
    .default("hourly,daily,weekly,monthly")
    .transform((val) => val.split(",").map((s) => s.trim()) as BackupTier[]),
  BACKUP_HOURLY_INTERVAL_HOURS: z.coerce.number().int().min(1).default(6),
  BACKUP_HOURLY_KEEP_COUNT: z.coerce.number().int().min(1).default(2),
  BACKUP_DAILY_KEEP_DAYS: z.coerce.number().int().min(1).default(3),
  BACKUP_WEEKLY_KEEP_WEEKS: z.coerce.number().int().min(1).default(2),
  BACKUP_MONTHLY_KEEP_MONTHS: z.coerce.number().int().min(1).default(2),
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
    IS_S3_SQLITE_BACKUP_ENABLED: process.env.IS_S3_SQLITE_BACKUP_ENABLED,
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_BUCKET_NAME: process.env.S3_BUCKET_NAME,
    S3_REGION: process.env.S3_REGION,
    BACKUP_HOURLY_INTERVAL_HOURS: process.env.BACKUP_HOURLY_INTERVAL_HOURS,
    BACKUP_HOURLY_KEEP_COUNT: process.env.BACKUP_HOURLY_KEEP_COUNT,
    BACKUP_DAILY_KEEP_DAYS: process.env.BACKUP_DAILY_KEEP_DAYS,
    BACKUP_WEEKLY_KEEP_WEEKS: process.env.BACKUP_WEEKLY_KEEP_WEEKS,
    BACKUP_MONTHLY_KEEP_MONTHS: process.env.BACKUP_MONTHLY_KEEP_MONTHS,
  };

  const config = BackupConfigSchema.parse(rawConfig);

  // If backup is disabled, return null
  if (!config.IS_S3_SQLITE_BACKUP_ENABLED) {
    return null;
  }

  // If enabled, validate S3 credentials are present
  if (!config.S3_ACCESS_KEY_ID) {
    throw new Error("S3_ACCESS_KEY_ID is required when backup is enabled");
  }
  if (!config.S3_SECRET_ACCESS_KEY) {
    throw new Error("S3_SECRET_ACCESS_KEY is required when backup is enabled");
  }
  if (!config.S3_ENDPOINT) {
    throw new Error("S3_ENDPOINT is required when backup is enabled");
  }
  if (!config.S3_BUCKET_NAME) {
    throw new Error("S3_BUCKET_NAME is required when backup is enabled");
  }

  return config;
}
