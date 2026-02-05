import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  DB,
  SqlDriver,
  syncDispatch,
  execSync,
  select,
} from "@will-be-done/hyperdb";
import {
  backupSlice,
  backupStateTable,
  backupTierStateTable,
  backupFileTable,
} from "./backupSlice";

describe("backupSlice", () => {
  let db: DB;

  beforeEach(() => {
    // Create a fresh in-memory database for each test
    const sqliteDB = new Database(":memory:");

    type SqlValue = number | string | Uint8Array | null;
    const sqliteDriver = new SqlDriver({
      exec(sql: string, params?: SqlValue[]): void {
        if (!params) {
          sqliteDB.run(sql);
        } else {
          sqliteDB.run(sql, params);
        }
      },
      prepare(sql: string) {
        const stmt = sqliteDB.prepare(sql);
        return {
          query(params?: SqlValue[]): unknown[] {
            return params ? stmt.all(...params) : stmt.all();
          },
          exec(params?: SqlValue[]): void {
            if (params) {
              stmt.run(...params);
            } else {
              stmt.run();
            }
          },
          values(params?: SqlValue[]): SqlValue[][] {
            return (params ? stmt.values(...params) : stmt.values()) as SqlValue[][];
          },
          finalize(): void {
            stmt.finalize();
          },
        };
      },
    });

    db = new DB(sqliteDriver);
    execSync(
      db.loadTables([backupStateTable, backupTierStateTable, backupFileTable])
    );
  });

  describe("createBackup", () => {
    test("creates a pending backup with scheduled time", () => {
      const scheduledAt = "2026-02-03T12:00:00.000Z";

      const backupId = syncDispatch(
        db,
        backupSlice.createBackup("hourly", scheduledAt)
      );

      const backup = select(db, backupSlice.getBackupById(backupId));

      expect(backup).toBeDefined();
      expect(backup?.id).toBe(backupId);
      expect(backup?.tier).toBe("hourly");
      expect(backup?.status).toBe("pending");
      expect(backup?.scheduledAt).toBe(scheduledAt);
      expect(backup?.startedAt).toBeNull();
      expect(backup?.completedAt).toBeNull();
      expect(backup?.totalSizeBytes).toBe(0);
      expect(backup?.durationMs).toBeNull();
      expect(backup?.error).toBeNull();
    });
  });

  describe("startBackup", () => {
    test("marks backup as running and sets startedAt", () => {
      const scheduledAt = "2026-02-03T12:00:00.000Z";
      const backupId = syncDispatch(
        db,
        backupSlice.createBackup("hourly", scheduledAt)
      );

      syncDispatch(db, backupSlice.startBackup(backupId));

      const backup = select(db, backupSlice.getBackupById(backupId));
      expect(backup?.status).toBe("running");
      expect(backup?.startedAt).toBeDefined();
      expect(backup?.startedAt).not.toBeNull();
    });

    test("throws error if backup not found", () => {
      expect(() => {
        syncDispatch(db, backupSlice.startBackup("nonexistent-id"));
      }).toThrow("Backup nonexistent-id not found");
    });
  });

  describe("completeBackup", () => {
    test("marks backup as completed with size and duration", () => {
      const scheduledAt = "2026-02-03T12:00:00.000Z";
      const backupId = syncDispatch(
        db,
        backupSlice.createBackup("hourly", scheduledAt)
      );
      syncDispatch(db, backupSlice.startBackup(backupId));

      syncDispatch(db, backupSlice.completeBackup(backupId, 1024000, 5000));

      const backup = select(db, backupSlice.getBackupById(backupId));
      expect(backup?.status).toBe("completed");
      expect(backup?.completedAt).toBeDefined();
      expect(backup?.totalSizeBytes).toBe(1024000);
      expect(backup?.durationMs).toBe(5000);
    });

    test("throws error if backup not found", () => {
      expect(() => {
        syncDispatch(db, backupSlice.completeBackup("nonexistent-id", 0, 0));
      }).toThrow("Backup nonexistent-id not found");
    });
  });

  describe("failBackup", () => {
    test("marks backup as failed with error message", () => {
      const scheduledAt = "2026-02-03T12:00:00.000Z";
      const backupId = syncDispatch(
        db,
        backupSlice.createBackup("hourly", scheduledAt)
      );
      syncDispatch(db, backupSlice.startBackup(backupId));

      syncDispatch(
        db,
        backupSlice.failBackup(backupId, "Connection timeout")
      );

      const backup = select(db, backupSlice.getBackupById(backupId));
      expect(backup?.status).toBe("failed");
      expect(backup?.completedAt).toBeDefined();
      expect(backup?.error).toBe("Connection timeout");
    });

    test("throws error if backup not found", () => {
      expect(() => {
        syncDispatch(db, backupSlice.failBackup("nonexistent-id", "error"));
      }).toThrow("Backup nonexistent-id not found");
    });
  });

  describe("getBackupsByTier", () => {
    test("returns backups for specified tier in descending order", () => {
      syncDispatch(
        db,
        backupSlice.createBackup("hourly", "2026-02-03T08:00:00.000Z")
      );
      syncDispatch(
        db,
        backupSlice.createBackup("hourly", "2026-02-03T12:00:00.000Z")
      );
      syncDispatch(
        db,
        backupSlice.createBackup("daily", "2026-02-03T00:00:00.000Z")
      );

      const hourlyBackups = select(db, backupSlice.getBackupsByTier("hourly"));

      expect(hourlyBackups).toHaveLength(2);
      // Should be in descending order (newest first)
      expect(hourlyBackups[0].scheduledAt).toBe("2026-02-03T12:00:00.000Z");
      expect(hourlyBackups[1].scheduledAt).toBe("2026-02-03T08:00:00.000Z");
    });

    test("returns empty array when no backups exist for tier", () => {
      const backups = select(db, backupSlice.getBackupsByTier("weekly"));
      expect(backups).toEqual([]);
    });
  });

  describe("getCompletedBackupsByTier", () => {
    test("returns only completed backups for specified tier", () => {
      const id1 = syncDispatch(
        db,
        backupSlice.createBackup("hourly", "2026-02-03T08:00:00.000Z")
      );
      syncDispatch(db, backupSlice.startBackup(id1));
      syncDispatch(db, backupSlice.completeBackup(id1, 1000, 100));

      const id2 = syncDispatch(
        db,
        backupSlice.createBackup("hourly", "2026-02-03T12:00:00.000Z")
      );
      syncDispatch(db, backupSlice.startBackup(id2));
      syncDispatch(db, backupSlice.failBackup(id2, "error"));

      syncDispatch(
        db,
        backupSlice.createBackup("hourly", "2026-02-03T16:00:00.000Z")
      ); // Still pending

      const completedBackups = select(
        db,
        backupSlice.getCompletedBackupsByTier("hourly")
      );

      expect(completedBackups).toHaveLength(1);
      expect(completedBackups[0].id).toBe(id1);
      expect(completedBackups[0].status).toBe("completed");
    });
  });

  describe("createBackupFile", () => {
    test("creates a backup file record", () => {
      const backupId = syncDispatch(
        db,
        backupSlice.createBackup("hourly", "2026-02-03T12:00:00.000Z")
      );

      const fileId = syncDispatch(
        db,
        backupSlice.createBackupFile(
          backupId,
          "hourly",
          "2026-02-03T12:00:00.000Z",
          "main.sqlite",
          "backups/hourly/2026-02-03T12-00-00Z/main.sqlite",
          1024000,
          153600, // ~15% compressed size
          5000,
          2000,
          300
        )
      );

      const files = select(db, backupSlice.getBackupFiles(backupId));

      expect(files).toHaveLength(1);
      expect(files[0].id).toBe(fileId);
      expect(files[0].backupId).toBe(backupId);
      expect(files[0].tier).toBe("hourly");
      expect(files[0].scheduledAt).toBe("2026-02-03T12:00:00.000Z");
      expect(files[0].fileName).toBe("main.sqlite");
      expect(files[0].s3Key).toBe(
        "backups/hourly/2026-02-03T12-00-00Z/main.sqlite"
      );
      expect(files[0].sizeBytes).toBe(1024000);
      expect(files[0].vacuumDurationMs).toBe(5000);
      expect(files[0].uploadDurationMs).toBe(2000);
      expect(files[0].createdAt).toBeDefined();
    });
  });

  describe("getBackupFiles", () => {
    test("returns all files for a backup", () => {
      const backupId = syncDispatch(
        db,
        backupSlice.createBackup("hourly", "2026-02-03T12:00:00.000Z")
      );

      syncDispatch(
        db,
        backupSlice.createBackupFile(
          backupId,
          "hourly",
          "2026-02-03T12:00:00.000Z",
          "main.sqlite",
          "backups/hourly/2026-02-03T12-00-00Z/main.sqlite",
          1024000,
          153600,
          5000,
          2000,
          300
        )
      );

      syncDispatch(
        db,
        backupSlice.createBackupFile(
          backupId,
          "hourly",
          "2026-02-03T12:00:00.000Z",
          "space1.sqlite",
          "backups/hourly/2026-02-03T12-00-00Z/space1.sqlite",
          2048000,
          307200,
          6000,
          3000,
          400
        )
      );

      const files = select(db, backupSlice.getBackupFiles(backupId));

      expect(files).toHaveLength(2);
      expect(files.map((f) => f.fileName).sort()).toEqual([
        "main.sqlite",
        "space1.sqlite",
      ]);
    });

    test("returns empty array when no files exist", () => {
      const files = select(db, backupSlice.getBackupFiles("nonexistent-id"));
      expect(files).toEqual([]);
    });
  });

  describe("getBackupFilesByTierAndTime", () => {
    test("returns files for specified tier and scheduled time", () => {
      const backupId1 = syncDispatch(
        db,
        backupSlice.createBackup("hourly", "2026-02-03T12:00:00.000Z")
      );
      syncDispatch(
        db,
        backupSlice.createBackupFile(
          backupId1,
          "hourly",
          "2026-02-03T12:00:00.000Z",
          "main.sqlite",
          "backups/hourly/2026-02-03T12-00-00Z/main.sqlite",
          1024000,
          153600,
          5000,
          2000,
          300
        )
      );

      const backupId2 = syncDispatch(
        db,
        backupSlice.createBackup("hourly", "2026-02-03T16:00:00.000Z")
      );
      syncDispatch(
        db,
        backupSlice.createBackupFile(
          backupId2,
          "hourly",
          "2026-02-03T16:00:00.000Z",
          "main.sqlite",
          "backups/hourly/2026-02-03T16-00-00Z/main.sqlite",
          1024000,
          153600,
          5000,
          2000,
          300
        )
      );

      const files = select(
        db,
        backupSlice.getBackupFilesByTierAndTime(
          "hourly",
          "2026-02-03T12:00:00.000Z"
        )
      );

      expect(files).toHaveLength(1);
      expect(files[0].backupId).toBe(backupId1);
      expect(files[0].scheduledAt).toBe("2026-02-03T12:00:00.000Z");
    });
  });

  describe("deleteBackupWithFiles", () => {
    test("deletes backup and all associated files", () => {
      const backupId = syncDispatch(
        db,
        backupSlice.createBackup("hourly", "2026-02-03T12:00:00.000Z")
      );

      syncDispatch(
        db,
        backupSlice.createBackupFile(
          backupId,
          "hourly",
          "2026-02-03T12:00:00.000Z",
          "main.sqlite",
          "backups/hourly/2026-02-03T12-00-00Z/main.sqlite",
          1024000,
          153600,
          5000,
          2000,
          300
        )
      );

      syncDispatch(
        db,
        backupSlice.createBackupFile(
          backupId,
          "hourly",
          "2026-02-03T12:00:00.000Z",
          "space1.sqlite",
          "backups/hourly/2026-02-03T12-00-00Z/space1.sqlite",
          2048000,
          307200,
          6000,
          3000,
          400
        )
      );

      // Verify files exist
      expect(select(db, backupSlice.getBackupFiles(backupId))).toHaveLength(2);

      // Delete backup with files
      syncDispatch(db, backupSlice.deleteBackupWithFiles(backupId));

      // Verify both backup and files are deleted
      expect(select(db, backupSlice.getBackupById(backupId))).toBeUndefined();
      expect(select(db, backupSlice.getBackupFiles(backupId))).toHaveLength(0);
    });
  });

  describe("updateTierState", () => {
    test("creates new tier state if it doesn't exist", () => {
      syncDispatch(
        db,
        backupSlice.updateTierState("hourly", {
          lastScheduledTime: "2026-02-03T12:00:00.000Z",
          nextScheduledTime: "2026-02-03T16:00:00.000Z",
          lastCompletedAt: "2026-02-03T12:05:00.000Z",
          consecutiveFailures: 0,
          isBackupInProgress: false,
        })
      );

      const tierState = select(db, backupSlice.getTierState("hourly"));

      expect(tierState).toBeDefined();
      expect(tierState?.tier).toBe("hourly");
      expect(tierState?.lastScheduledTime).toBe("2026-02-03T12:00:00.000Z");
      expect(tierState?.nextScheduledTime).toBe("2026-02-03T16:00:00.000Z");
      expect(tierState?.lastCompletedAt).toBe("2026-02-03T12:05:00.000Z");
      expect(tierState?.consecutiveFailures).toBe(0);
      expect(tierState?.isBackupInProgress).toBe(false);
    });

    test("updates existing tier state", () => {
      syncDispatch(
        db,
        backupSlice.updateTierState("hourly", {
          lastScheduledTime: "2026-02-03T12:00:00.000Z",
          consecutiveFailures: 0,
        })
      );

      syncDispatch(
        db,
        backupSlice.updateTierState("hourly", {
          lastScheduledTime: "2026-02-03T16:00:00.000Z",
          nextScheduledTime: "2026-02-03T20:00:00.000Z",
          consecutiveFailures: 1,
        })
      );

      const tierState = select(db, backupSlice.getTierState("hourly"));

      expect(tierState?.lastScheduledTime).toBe("2026-02-03T16:00:00.000Z");
      expect(tierState?.nextScheduledTime).toBe("2026-02-03T20:00:00.000Z");
      expect(tierState?.consecutiveFailures).toBe(1);
    });

    test("tracks consecutive failures", () => {
      syncDispatch(
        db,
        backupSlice.updateTierState("hourly", {
          consecutiveFailures: 0,
        })
      );

      syncDispatch(
        db,
        backupSlice.updateTierState("hourly", {
          consecutiveFailures: 1,
        })
      );

      syncDispatch(
        db,
        backupSlice.updateTierState("hourly", {
          consecutiveFailures: 2,
        })
      );

      const tierState = select(db, backupSlice.getTierState("hourly"));
      expect(tierState?.consecutiveFailures).toBe(2);
    });

    test("manages backup in progress flag", () => {
      syncDispatch(
        db,
        backupSlice.updateTierState("hourly", {
          isBackupInProgress: true,
        })
      );

      let tierState = select(db, backupSlice.getTierState("hourly"));
      expect(tierState?.isBackupInProgress).toBe(true);

      syncDispatch(
        db,
        backupSlice.updateTierState("hourly", {
          isBackupInProgress: false,
        })
      );

      tierState = select(db, backupSlice.getTierState("hourly"));
      expect(tierState?.isBackupInProgress).toBe(false);
    });
  });

  describe("getTierState", () => {
    test("returns undefined when tier state doesn't exist", () => {
      const tierState = select(db, backupSlice.getTierState("hourly"));
      expect(tierState).toBeUndefined();
    });

    test("returns tier state when it exists", () => {
      syncDispatch(
        db,
        backupSlice.updateTierState("daily", {
          lastScheduledTime: "2026-02-03T00:00:00.000Z",
        })
      );

      const tierState = select(db, backupSlice.getTierState("daily"));
      expect(tierState).toBeDefined();
      expect(tierState?.tier).toBe("daily");
    });
  });
});
