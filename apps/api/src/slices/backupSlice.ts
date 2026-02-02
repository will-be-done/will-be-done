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
import type { GenReturn } from "@will-be-done/slices";

export type BackupStatus = "pending" | "running" | "completed" | "failed";
export type BackupTier = "hourly" | "daily" | "weekly" | "monthly";

export type BackupMetadata = {
  files: string[];
  s3Keys: string[];
  totalSizeBytes: number;
  durationMs: number;
  error?: string;
};

export type BackupState = {
  id: string;
  tier: BackupTier;
  status: BackupStatus;
  createdAt: string;
  completedAt: string | null;
  metadata: string | null; // JSON stringified BackupMetadata
};

export const backupStateTable = table<BackupState>("backup_state").withIndexes({
  byId: { cols: ["id"], type: "hash" },
  byTier: { cols: ["tier"], type: "btree" },
  byCreatedAt: { cols: ["createdAt"], type: "btree" },
  byTierCreatedAt: { cols: ["tier", "createdAt"], type: "btree" },
});

export type BackupTierState = {
  id: string;
  tier: BackupTier;
  lastBackupAt: string | null;
  nextBackupAt: string | null;
  consecutiveFailures: number;
};

export const backupTierStateTable = table<BackupTierState>(
  "backup_tier_state"
).withIndexes({
  byId: { cols: ["id"], type: "hash" },
  byTier: { cols: ["tier"], type: "hash" },
});

export const backupSlice = {
  // Selectors
  getBackupById: selector(function* (
    id: string
  ): GenReturn<BackupState | undefined> {
    const backups = yield* runQuery(
      selectFrom(backupStateTable, "byId")
        .where((q) => q.eq("id", id))
        .limit(1)
    );
    return backups[0];
  }),

  getBackupsByTier: selector(function* (
    tier: BackupTier
  ): GenReturn<BackupState[]> {
    const backups = yield* runQuery(
      selectFrom(backupStateTable, "byTierCreatedAt").where((q) =>
        q.eq("tier", tier)
      )
    );
    // BTree index returns in ascending order, reverse for descending
    return backups.reverse();
  }),

  getCompletedBackupsByTier: selector(function* (
    tier: BackupTier
  ): GenReturn<BackupState[]> {
    const allBackups = yield* backupSlice.getBackupsByTier(tier);
    return allBackups.filter((b) => b.status === "completed");
  }),

  getTierState: selector(function* (
    tier: BackupTier
  ): GenReturn<BackupTierState | undefined> {
    const states = yield* runQuery(
      selectFrom(backupTierStateTable, "byTier")
        .where((q) => q.eq("tier", tier))
        .limit(1)
    );
    return states[0];
  }),

  // Actions
  createBackup: action(function* (tier: BackupTier): GenReturn<string> {
    const backupId = uuidv7();
    const now = new Date().toISOString();

    const backup: BackupState = {
      id: backupId,
      tier,
      status: "pending",
      createdAt: now,
      completedAt: null,
      metadata: null,
    };

    yield* insert(backupStateTable, [backup]);

    return backupId;
  }),

  updateBackupStatus: action(function* (
    id: string,
    status: BackupStatus,
    metadata?: BackupMetadata
  ): GenReturn<void> {
    const backup = yield* backupSlice.getBackupById(id);
    if (!backup) {
      throw new Error(`Backup ${id} not found`);
    }

    const updates: Partial<BackupState> = {
      status,
    };

    if (status === "completed" || status === "failed") {
      updates.completedAt = new Date().toISOString();
    }

    if (metadata) {
      updates.metadata = JSON.stringify(metadata);
    }

    yield* update(backupStateTable, [{ ...backup, ...updates }]);
  }),

  updateTierState: action(function* (
    tier: BackupTier,
    updates: Partial<Omit<BackupTierState, "id" | "tier">>
  ): GenReturn<void> {
    const existing = yield* backupSlice.getTierState(tier);

    if (existing) {
      yield* update(backupTierStateTable, [{ ...existing, ...updates }]);
    } else {
      // Create new tier state
      const tierState: BackupTierState = {
        id: uuidv7(),
        tier,
        lastBackupAt: updates.lastBackupAt || null,
        nextBackupAt: updates.nextBackupAt || null,
        consecutiveFailures: updates.consecutiveFailures || 0,
      };
      yield* insert(backupTierStateTable, [tierState]);
    }
  }),

  deleteBackup: action(function* (id: string): GenReturn<void> {
    yield* deleteRows(backupStateTable, [id]);
  }),
};
