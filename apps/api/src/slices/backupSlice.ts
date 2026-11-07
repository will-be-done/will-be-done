import {
  deleteRows,
  insert,
  selectFrom,
  upsert,
  v,
  type ActionGenerator,
} from "@will-be-done/hyperdb";
import { action, selector } from "../builders";
import { uuidv7 } from "uuidv7";
import {
  backupFileTable,
  backupStateTable,
  backupTierStateTable,
  type BackupFile,
  type BackupState,
  type BackupTier,
  type BackupTierState,
} from "./tables";

export {
  backupStateTable,
  backupFileTable,
  backupTierStateTable,
  type BackupFile,
  type BackupState,
  type BackupStatus,
  type BackupTier,
  type BackupTierState,
} from "./tables";

export const getBackupById = selector({
  name: "getBackupById",
  args: { id: v.string() },
  handler: function* getBackupById({ id }) {
    const backups = yield* selectFrom(backupStateTable, "byId")
      .where((q) => q.eq("id", id))
      .limit(1);
    return backups[0] as BackupState | undefined;
  },
});

export const getBackupsByTier = selector({
  name: "getBackupsByTier",
  args: {
    tier: v.union(
      v.literal("hourly"),
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("monthly"),
    ),
  },
  handler: function* getBackupsByTier({ tier }) {
    const backups = yield* selectFrom(
      backupStateTable,
      "byTierScheduledAt",
    ).where((q) => q.eq("tier", tier));
    return backups.reverse() as BackupState[];
  },
});

export const getCompletedBackupsByTier = selector({
  name: "getCompletedBackupsByTier",
  args: {
    tier: v.union(
      v.literal("hourly"),
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("monthly"),
    ),
  },
  handler: function* getCompletedBackupsByTier({ tier }) {
    const allBackups = yield* getBackupsByTier({ tier });
    return allBackups.filter((b) => b.status === "completed");
  },
});

export const getTierState = selector({
  name: "getTierState",
  args: {
    tier: v.union(
      v.literal("hourly"),
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("monthly"),
    ),
  },
  handler: function* getTierState({ tier }) {
    const states = yield* selectFrom(backupTierStateTable, "byTier")
      .where((q) => q.eq("tier", tier))
      .limit(1);
    return states[0] as BackupTierState | undefined;
  },
});

export const createBackup = action({
  name: "createBackup",
  args: {
    tier: v.union(
      v.literal("hourly"),
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("monthly"),
    ),
    scheduledAt: v.string(),
  },
  handler: function* createBackup({ tier, scheduledAt }) {
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
  },
});

export const startBackup = action({
  name: "startBackup",
  args: { id: v.string() },
  handler: function* startBackup({ id }) {
    const backup = yield* getBackupById({ id });
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
  },
});

export const completeBackup = action({
  name: "completeBackup",
  args: { id: v.string(), totalSizeBytes: v.number(), durationMs: v.number() },
  handler: function* completeBackup({ id, totalSizeBytes, durationMs }) {
    const backup = yield* getBackupById({ id });
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
  },
});

export const failBackup = action({
  name: "failBackup",
  args: { id: v.string(), error: v.string() },
  handler: function* failBackup({ id, error }) {
    const backup = yield* getBackupById({ id });
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
  },
});

export const updateTierState = action({
  name: "updateTierState",
  args: {
    tier: v.union(
      v.literal("hourly"),
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("monthly"),
    ),
    updates: v.partial(backupTierStateTable.v()),
  },
  handler: function* updateTierState({
    tier,
    updates,
  }: {
    tier: BackupTier;
    updates: Partial<Omit<BackupTierState, "id" | "tier">>;
  }) {
    const existing = yield* getTierState({ tier });

    if (existing) {
      yield* upsert(backupTierStateTable, [{ ...existing, ...updates }]);
    } else {
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
  },
});

export const createBackupFile = action({
  name: "createBackupFile",
  args: {
    backupId: v.string(),
    tier: v.union(
      v.literal("hourly"),
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("monthly"),
    ),
    scheduledAt: v.string(),
    fileName: v.string(),
    s3Key: v.string(),
    sizeBytes: v.number(),
    compressedSizeBytes: v.number(),
    vacuumDurationMs: v.number(),
    uploadDurationMs: v.number(),
    compressionDurationMs: v.number(),
  },
  handler: function* createBackupFile({
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
  }) {
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
  },
});

export const getBackupFiles = selector({
  name: "getBackupFiles",
  args: { backupId: v.string() },
  handler: function* getBackupFiles({ backupId }) {
    const files = yield* selectFrom(backupFileTable, "byBackupId").where((q) =>
      q.eq("backupId", backupId),
    );
    return files as BackupFile[];
  },
});

export const getBackupFilesByTierAndTime = selector({
  name: "getBackupFilesByTierAndTime",
  args: {
    tier: v.union(
      v.literal("hourly"),
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("monthly"),
    ),
    scheduledAt: v.string(),
  },
  handler: function* getBackupFilesByTierAndTime({ tier, scheduledAt }) {
    const files = yield* selectFrom(backupFileTable, "byTierScheduledAt").where(
      (q) => q.eq("tier", tier).eq("scheduledAt", scheduledAt),
    );
    return files as BackupFile[];
  },
});

export const deleteBackup = action({
  name: "deleteBackup",
  args: { id: v.string() },
  handler: function* deleteBackup({ id }) {
    yield* deleteRows(backupStateTable, [id]);
  },
});

export const deleteBackupWithFiles = action({
  name: "deleteBackupWithFiles",
  args: { id: v.string() },
  handler: function* deleteBackupWithFiles({ id }): ActionGenerator<void> {
    const files = yield* getBackupFiles({ backupId: id });

    const fileIds = files.map((f) => f.id);
    if (fileIds.length > 0) {
      yield* deleteRows(backupFileTable, fileIds);
    }

    yield* deleteRows(backupStateTable, [id]);
  },
});
