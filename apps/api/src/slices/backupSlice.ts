import {
  action,
  deleteRows,
  defineTable,
  type ExtractSchema,
  insert,
  selectFrom,
  selector,
  upsert,
  v,
} from "@will-be-done/hyperdb-lib";
import { uuidv7 } from "uuidv7";

export type BackupStatus = "pending" | "running" | "completed" | "failed";
export type BackupTier = "hourly" | "daily" | "weekly" | "monthly";

const backupTierValidator = v.union(
  v.literal("hourly"),
  v.literal("daily"),
  v.literal("weekly"),
  v.literal("monthly"),
);

const backupStatusValidator = v.union(
  v.literal("pending"),
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed"),
);

const nullableString = () => v.union(v.string(), v.null());
const nullableNumber = () => v.union(v.number(), v.null());

export const backupStateTable = defineTable("backup_state", {
  id: v.string(),
  tier: backupTierValidator,
  status: backupStatusValidator,
  scheduledAt: v.string(),
  startedAt: nullableString(),
  completedAt: nullableString(),
  totalSizeBytes: v.number(),
  durationMs: nullableNumber(),
  error: nullableString(),
})
  .index("byTier", ["tier"])
  .index("byScheduledAt", ["scheduledAt"])
  .index("byTierScheduledAt", ["tier", "scheduledAt"]);
export type BackupState = ExtractSchema<typeof backupStateTable>;

export const backupFileTable = defineTable("backup_file", {
  id: v.string(),
  backupId: v.string(),
  tier: backupTierValidator,
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
  .index("byTierScheduledAt", ["tier", "scheduledAt"])
  .index("byS3Key", ["s3Key"], { type: "hash" });
export type BackupFile = ExtractSchema<typeof backupFileTable>;

export const backupTierStateTable = defineTable("backup_tier_state", {
  id: v.string(),
  tier: backupTierValidator,
  lastScheduledTime: nullableString(),
  nextScheduledTime: nullableString(),
  lastCompletedAt: nullableString(),
  consecutiveFailures: v.number(),
  isBackupInProgress: v.boolean(),
})
  .index("byTier", ["tier"], { type: "hash" });
export type BackupTierState = ExtractSchema<typeof backupTierStateTable>;

const getBackupById = selector(function* (id: string) {
  const backups = yield* selectFrom(backupStateTable, "byId")
      .where((q) => q.eq("id", id))
      .limit(1);
  return backups[0] as BackupState | undefined;
});

const getBackupsByTier = selector(function* (tier: BackupTier) {
  const backups = yield* selectFrom(backupStateTable, "byTierScheduledAt").where((q) =>
      q.eq("tier", tier),
    );
  // BTree index returns in ascending order, reverse for descending
  return backups.reverse() as BackupState[];
});

const getCompletedBackupsByTier = selector(function* (tier: BackupTier) {
  const allBackups = yield* getBackupsByTier(tier);
  return allBackups.filter((b) => b.status === "completed");
});

const getTierState = selector(function* (tier: BackupTier) {
  const states = yield* selectFrom(backupTierStateTable, "byTier")
      .where((q) => q.eq("tier", tier))
      .limit(1);
  return states[0] as BackupTierState | undefined;
});

const createBackup = action(function* (tier: BackupTier, scheduledAt: string) {
  const backupId = uuidv7();

  const backup: BackupState = {
    id: backupId,
    tier,
    status: "pending",
    scheduledAt,
    startedAt: null,
    completedAt: null,
    totalSizeBytes: 0,
    durationMs: null,
    error: null,
  };

  yield* insert(backupStateTable, [backup]);

  return backupId;
});

const startBackup = action(function* (id: string) {
  const backup = yield* getBackupById(id);
  if (!backup) {
    throw new Error(`Backup ${id} not found`);
  }

  yield* upsert(backupStateTable, [
    {
      ...backup,
      status: "running",
      startedAt: new Date().toISOString(),
    },
  ]);
});

const completeBackup = action(function* (
  id: string,
  totalSizeBytes: number,
  durationMs: number,
) {
  const backup = yield* getBackupById(id);
  if (!backup) {
    throw new Error(`Backup ${id} not found`);
  }

  yield* upsert(backupStateTable, [
    {
      ...backup,
      status: "completed",
      completedAt: new Date().toISOString(),
      totalSizeBytes,
      durationMs,
    },
  ]);
});

const failBackup = action(function* (id: string, error: string) {
  const backup = yield* getBackupById(id);
  if (!backup) {
    throw new Error(`Backup ${id} not found`);
  }

  yield* upsert(backupStateTable, [
    {
      ...backup,
      status: "failed",
      completedAt: new Date().toISOString(),
      error,
    },
  ]);
});

const updateTierState = action(function* (
  tier: BackupTier,
  updates: Partial<Omit<BackupTierState, "id" | "tier">>,
) {
  const existing = yield* getTierState(tier);

  if (existing) {
    yield* upsert(backupTierStateTable, [{ ...existing, ...updates }]);
  } else {
    // Create new tier state
    const tierState: BackupTierState = {
      id: uuidv7(),
      tier,
      lastScheduledTime: updates.lastScheduledTime || null,
      nextScheduledTime: updates.nextScheduledTime || null,
      lastCompletedAt: updates.lastCompletedAt || null,
      consecutiveFailures: updates.consecutiveFailures || 0,
      isBackupInProgress: updates.isBackupInProgress || false,
    };
    yield* insert(backupTierStateTable, [tierState]);
  }
});

const createBackupFile = action(function* (
  backupId: string,
  tier: BackupTier,
  scheduledAt: string,
  fileName: string,
  s3Key: string,
  sizeBytes: number,
  compressedSizeBytes: number,
  vacuumDurationMs: number,
  uploadDurationMs: number,
  compressionDurationMs: number,
) {
  const fileId = uuidv7();
  const now = new Date().toISOString();

  const backupFile: BackupFile = {
    id: fileId,
    backupId,
    tier,
    scheduledAt,
    fileName,
    s3Key,
    sizeBytes,
    compressedSizeBytes,
    vacuumDurationMs,
    uploadDurationMs,
    compressionDurationMs,
    createdAt: now,
  };

  yield* insert(backupFileTable, [backupFile]);

  return fileId;
});

const getBackupFiles = selector(function* (backupId: string) {
  const files = yield* selectFrom(backupFileTable, "byBackupId").where((q) =>
      q.eq("backupId", backupId),
    );
  return files as BackupFile[];
});

const getBackupFilesByTierAndTime = selector(function* (
  tier: BackupTier,
  scheduledAt: string,
) {
  const files = yield* selectFrom(backupFileTable, "byTierScheduledAt").where((q) =>
      q.eq("tier", tier).eq("scheduledAt", scheduledAt),
    );
  return files as BackupFile[];
});

const deleteBackup = action(function* (id: string) {
  yield* deleteRows(backupStateTable, [id]);
});

const deleteBackupWithFiles = action(function* (id: string) {
  // Get all files for this backup
  const files = yield* getBackupFiles(id);

  // Delete all files
  const fileIds = files.map((f) => f.id);
  if (fileIds.length > 0) {
    yield* deleteRows(backupFileTable, fileIds);
  }

  // Delete the backup itself
  yield* deleteRows(backupStateTable, [id]);
});

export const backupSlice = {
  getBackupById,
  getBackupsByTier,
  getCompletedBackupsByTier,
  getTierState,
  createBackup,
  startBackup,
  completeBackup,
  failBackup,
  updateTierState,
  createBackupFile,
  getBackupFiles,
  getBackupFilesByTierAndTime,
  deleteBackup,
  deleteBackupWithFiles,
};
