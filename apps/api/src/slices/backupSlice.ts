import {
  action,
  deleteRows,
  insert,
  runQuery,
  selectFrom,
  selector,
  table,
  update,
} from "@will-be-done/hyperdb";
import { uuidv7 } from "uuidv7";

export type BackupStatus = "pending" | "running" | "completed" | "failed";
export type BackupTier = "hourly" | "daily" | "weekly" | "monthly";

export type BackupState = {
  id: string;
  tier: BackupTier;
  status: BackupStatus;
  scheduledAt: string; // Deterministic scheduled time for this backup window
  startedAt: string | null;
  completedAt: string | null;
  totalSizeBytes: number;
  durationMs: number | null;
  error: string | null;
};

export type BackupFile = {
  id: string;
  backupId: string;
  tier: BackupTier;
  scheduledAt: string; // Same as parent backup's scheduledAt
  fileName: string; // e.g., "main.sqlite"
  s3Key: string; // Full S3 path
  sizeBytes: number;
  compressedSizeBytes: number;
  vacuumDurationMs: number;
  uploadDurationMs: number;
  compressionDurationMs: number;
  createdAt: string;
};

export const backupStateTable = table<BackupState>("backup_state").withIndexes({
  byId: { cols: ["id"], type: "hash" },
  byTier: { cols: ["tier"], type: "btree" },
  byScheduledAt: { cols: ["scheduledAt"], type: "btree" },
  byTierScheduledAt: { cols: ["tier", "scheduledAt"], type: "btree" },
});

export const backupFileTable = table<BackupFile>("backup_file").withIndexes({
  byId: { cols: ["id"], type: "hash" },
  byBackupId: { cols: ["backupId"], type: "btree" },
  byTierScheduledAt: { cols: ["tier", "scheduledAt"], type: "btree" },
  byS3Key: { cols: ["s3Key"], type: "hash" },
});

export type BackupTierState = {
  id: string;
  tier: BackupTier;
  lastScheduledTime: string | null; // Last scheduled window
  nextScheduledTime: string | null; // Next scheduled window
  lastCompletedAt: string | null; // Actual completion time
  consecutiveFailures: number;
  isBackupInProgress: boolean; // Prevent concurrent backups
};

export const backupTierStateTable = table<BackupTierState>(
  "backup_tier_state",
).withIndexes({
  byId: { cols: ["id"], type: "hash" },
  byTier: { cols: ["tier"], type: "hash" },
});

const getBackupById = selector(function* (id: string) {
  const backups = yield* runQuery(
    selectFrom(backupStateTable, "byId")
      .where((q) => q.eq("id", id))
      .limit(1),
  );
  return backups[0] as BackupState | undefined;
});

const getBackupsByTier = selector(function* (tier: BackupTier) {
  const backups = yield* runQuery(
    selectFrom(backupStateTable, "byTierScheduledAt").where((q) =>
      q.eq("tier", tier),
    ),
  );
  // BTree index returns in ascending order, reverse for descending
  return backups.reverse() as BackupState[];
});

const getCompletedBackupsByTier = selector(function* (tier: BackupTier) {
  const allBackups = yield* getBackupsByTier(tier);
  return allBackups.filter((b) => b.status === "completed");
});

const getTierState = selector(function* (tier: BackupTier) {
  const states = yield* runQuery(
    selectFrom(backupTierStateTable, "byTier")
      .where((q) => q.eq("tier", tier))
      .limit(1),
  );
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

  yield* update(backupStateTable, [
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

  yield* update(backupStateTable, [
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

  yield* update(backupStateTable, [
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
    yield* update(backupTierStateTable, [{ ...existing, ...updates }]);
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
  const files = yield* runQuery(
    selectFrom(backupFileTable, "byBackupId").where((q) =>
      q.eq("backupId", backupId),
    ),
  );
  return files as BackupFile[];
});

const getBackupFilesByTierAndTime = selector(function* (
  tier: BackupTier,
  scheduledAt: string,
) {
  const files = yield* runQuery(
    selectFrom(backupFileTable, "byTierScheduledAt").where((q) =>
      q.eq("tier", tier).eq("scheduledAt", scheduledAt),
    ),
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
