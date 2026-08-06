import { defineTable, type ExtractSchema, v } from "@will-be-done/hyperdb";

export const usersTable = defineTable("users", {
  id: v.string(),
  email: v.string(),
  password: v.string(),
  createdAt: v.string(),
  updatedAt: v.string(),
})
  .index("byIds", ["id"])
  .index("byEmail", ["email"]);
export type User = ExtractSchema<typeof usersTable>;

export const tokensTable = defineTable("tokens", {
  id: v.string(),
  userId: v.string(),
  createdAt: v.string(),
  lastUsedAt: v.optional(v.string()),
  lastUsedIp: v.optional(v.string()),
  lastUsedUserAgent: v.optional(v.string()),
}).index("byUserId", ["userId"]);
export type Token = ExtractSchema<typeof tokensTable>;

export const dbsTable = defineTable("dbs", {
  id: v.string(),
  type: v.union(v.literal("user"), v.literal("space")),
  userId: v.string(),
}).index("byIdTypes", ["id", "type"]);
export type Db = ExtractSchema<typeof dbsTable>;

export type BackupStatus = "pending" | "running" | "completed" | "failed";
export type BackupTier = "hourly" | "daily" | "weekly" | "monthly";

const backupTier = v.union(
  v.literal("hourly"),
  v.literal("daily"),
  v.literal("weekly"),
  v.literal("monthly"),
);

const backupStatus = v.union(
  v.literal("pending"),
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed"),
);

const nullableString = () => v.union(v.string(), v.null());
const nullableNumber = () => v.union(v.number(), v.null());

export const backupStateTable = defineTable("backup_state", {
  id: v.string(),
  tier: backupTier,
  status: backupStatus,
  scheduledAt: v.string(),
  startedAt: nullableString(),
  completedAt: nullableString(),
  totalSizeBytes: v.number(),
  durationMs: nullableNumber(),
  error: nullableString(),
})
  .index("byScheduledAt", ["scheduledAt"])
  .index("byTierScheduledAt", ["tier", "scheduledAt"]);
export type BackupState = ExtractSchema<typeof backupStateTable>;

export const backupFileTable = defineTable("backup_file", {
  id: v.string(),
  backupId: v.string(),
  tier: backupTier,
  scheduledAt: v.string(),
  fileName: v.string(),
  s3Key: v.string(),
  sizeBytes: v.number(),
  compressedSizeBytes: v.number(),
  vacuumDurationMs: v.number(),
  uploadDurationMs: v.number(),
  compressionDurationMs: v.number(),
  createdAt: v.string(),
})
  .index("byBackupId", ["backupId"])
  .index("byTierScheduledAt", ["tier", "scheduledAt"]);
export type BackupFile = ExtractSchema<typeof backupFileTable>;

export const backupTierStateTable = defineTable("backup_tier_state", {
  id: v.string(),
  tier: backupTier,
  lastScheduledTime: nullableString(),
  nextScheduledTime: nullableString(),
  lastCompletedAt: nullableString(),
  consecutiveFailures: v.number(),
  isBackupInProgress: v.boolean(),
}).index("byTier", ["tier"]);
export type BackupTierState = ExtractSchema<typeof backupTierStateTable>;
