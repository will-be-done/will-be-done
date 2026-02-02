import { describe, test, expect, beforeEach, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { DB, SqlDriver, syncDispatch, execSync } from "@will-be-done/hyperdb";
import { BackupScheduler } from "./BackupScheduler";
import type { BackupManager } from "./BackupManager";
import type { BackupConfig } from "./types";
import {
  backupSlice,
  backupStateTable,
  backupTierStateTable,
  backupFileTable,
} from "../slices/backupSlice";

const mockConfig: BackupConfig = {
  IS_S3_SQLITE_BACKUP_ENABLED: true,
  S3_ACCESS_KEY_ID: "test-key",
  S3_SECRET_ACCESS_KEY: "test-secret",
  S3_ENDPOINT: "http://localhost:9000",
  S3_BUCKET_NAME: "test-bucket",
  S3_REGION: "us-east-1",
  BACKUP_HOURLY_INTERVAL_HOURS: 4,
  BACKUP_HOURLY_KEEP_COUNT: 4,
  BACKUP_DAILY_KEEP_DAYS: 5,
  BACKUP_WEEKLY_KEEP_WEEKS: 2,
  BACKUP_MONTHLY_KEEP_MONTHS: 2,
};

type MockFn = ReturnType<typeof mock>;

describe("BackupScheduler", () => {
  let db: DB;
  let mockBackupManager: BackupManager;
  let performBackupMock: MockFn;

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

    // Create a mock backup manager
    performBackupMock = mock(async () => {});
    mockBackupManager = {
      performBackup: performBackupMock,
    } as unknown as BackupManager;
  });

  describe("getDueTiers logic", () => {
    test("triggers backup when no tier states exist", async () => {
      const scheduler = new BackupScheduler(db, mockBackupManager, mockConfig);

      // Manually trigger check (we can't easily test setInterval)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (scheduler as any).checkAndRunBackups();

      // Should have been called with all tiers
      expect(performBackupMock).toHaveBeenCalledTimes(1);
      expect(performBackupMock.mock.calls[0]?.[0]).toEqual([
        "hourly",
        "daily",
        "weekly",
        "monthly",
      ]);
    });

    test("triggers backup when scheduled time has changed", async () => {
      // Set up tier state with old scheduled time
      syncDispatch(
        db,
        backupSlice.updateTierState("hourly", {
          lastScheduledTime: "2026-02-03T08:00:00.000Z", // 4 hours ago
          nextScheduledTime: "2026-02-03T12:00:00.000Z",
          consecutiveFailures: 0,
          isBackupInProgress: false,
        })
      );

      // Set up other tiers as current
      syncDispatch(
        db,
        backupSlice.updateTierState("daily", {
          lastScheduledTime: new Date().toISOString().split("T")[0] + "T00:00:00.000Z",
          consecutiveFailures: 0,
          isBackupInProgress: false,
        })
      );

      syncDispatch(
        db,
        backupSlice.updateTierState("weekly", {
          lastScheduledTime: new Date().toISOString().split("T")[0] + "T00:00:00.000Z",
          consecutiveFailures: 0,
          isBackupInProgress: false,
        })
      );

      syncDispatch(
        db,
        backupSlice.updateTierState("monthly", {
          lastScheduledTime: new Date().toISOString().split("T")[0] + "T00:00:00.000Z",
          consecutiveFailures: 0,
          isBackupInProgress: false,
        })
      );

      const scheduler = new BackupScheduler(db, mockBackupManager, mockConfig);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (scheduler as any).checkAndRunBackups();

      // Should have been called (at least hourly should be due)
      expect(performBackupMock).toHaveBeenCalled();
    });

    test("does not trigger backup when all tiers are current", async () => {
      const now = new Date();
      const scheduledTime = new Date(
        Math.floor(now.getTime() / (4 * 60 * 60 * 1000)) * (4 * 60 * 60 * 1000)
      );
      const scheduledTimeStr = scheduledTime.toISOString();

      // Set all tiers to current scheduled time
      syncDispatch(
        db,
        backupSlice.updateTierState("hourly", {
          lastScheduledTime: scheduledTimeStr,
          consecutiveFailures: 0,
          isBackupInProgress: false,
        })
      );

      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      syncDispatch(
        db,
        backupSlice.updateTierState("daily", {
          lastScheduledTime: today.toISOString(),
          consecutiveFailures: 0,
          isBackupInProgress: false,
        })
      );

      // Get current week start (Monday)
      const currentWeekStart = new Date(today);
      const day = currentWeekStart.getUTCDay();
      const diff = (day === 0 ? -6 : 1) - day; // Adjust to Monday
      currentWeekStart.setUTCDate(currentWeekStart.getUTCDate() + diff);
      syncDispatch(
        db,
        backupSlice.updateTierState("weekly", {
          lastScheduledTime: currentWeekStart.toISOString(),
          consecutiveFailures: 0,
          isBackupInProgress: false,
        })
      );

      // Get current month start
      const monthStart = new Date(today);
      monthStart.setUTCDate(1);
      syncDispatch(
        db,
        backupSlice.updateTierState("monthly", {
          lastScheduledTime: monthStart.toISOString(),
          consecutiveFailures: 0,
          isBackupInProgress: false,
        })
      );

      const scheduler = new BackupScheduler(db, mockBackupManager, mockConfig);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (scheduler as any).checkAndRunBackups();

      // Should NOT have been called
      expect(performBackupMock).not.toHaveBeenCalled();
    });

    test("skips tier with backup in progress", async () => {
      // Set hourly as in progress
      syncDispatch(
        db,
        backupSlice.updateTierState("hourly", {
          lastScheduledTime: "2026-02-03T08:00:00.000Z",
          isBackupInProgress: true, // In progress!
        })
      );

      const scheduler = new BackupScheduler(db, mockBackupManager, mockConfig);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (scheduler as any).checkAndRunBackups();

      // Should be called, but hourly should not be in the list
      if (performBackupMock.mock.calls.length > 0) {
        const callArgs = performBackupMock.mock.calls[0]?.[0];
        expect(callArgs).not.toContain("hourly");
      }
    });
  });

  describe("start and stop", () => {
    test("start sets up interval", () => {
      const scheduler = new BackupScheduler(db, mockBackupManager, mockConfig);

      void scheduler.start();

      // Verify interval is set (private property)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((scheduler as any).intervalId).not.toBeNull();

      void scheduler.stop();
    });

    test("stop clears interval", () => {
      const scheduler = new BackupScheduler(db, mockBackupManager, mockConfig);

      void scheduler.start();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((scheduler as any).intervalId).not.toBeNull();

      void scheduler.stop();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((scheduler as any).intervalId).toBeNull();
    });

    test("calls checkAndRunBackups on start", async () => {
      // This test verifies that start() calls checkAndRunBackups initially
      // We can't easily verify the setInterval callback without waiting
      const scheduler = new BackupScheduler(db, mockBackupManager, mockConfig);

      void scheduler.start();

      // Give it a moment to execute the initial check
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should have been called at least once (the initial check on startup)
      expect(performBackupMock).toHaveBeenCalled();

      void scheduler.stop();
    });
  });

  describe("error handling", () => {
    test("continues after backup failure", async () => {
      // Mock console.error to suppress error logs during test
      const consoleErrorMock = mock(() => {});
      const originalConsoleError = console.error;
      console.error = consoleErrorMock;

      try {
        // Make performBackup throw an error
        performBackupMock.mockImplementation(async () => {
          throw new Error("Backup failed");
        });

        const scheduler = new BackupScheduler(
          db,
          mockBackupManager,
          mockConfig
        );

        // Should not throw - error should be caught and logged
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = (scheduler as any).checkAndRunBackups() as Promise<void>;
        // eslint-disable-next-line @typescript-eslint/await-thenable
        await expect(result).resolves.toBeUndefined();

        // Verify error was logged
        expect(consoleErrorMock).toHaveBeenCalledWith(
          "[BackupScheduler] Backup check failed:",
          expect.any(Error)
        );
      } finally {
        // Restore console.error
        console.error = originalConsoleError;
      }
    });
  });
});
