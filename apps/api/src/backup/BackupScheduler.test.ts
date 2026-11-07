import { describe, test, expect, beforeEach, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { SqlDriver } from "@will-be-done/hyperdb/drivers/sqlite";
import { DB, syncDispatch, execSync } from "@will-be-done/hyperdb";
import { Effect, Fiber } from "effect";
import { TestClock } from "effect/testing";
import { checkAndRunBackups, runBackupScheduler } from "./BackupScheduler";
import type { BackupConfig } from "./types";
import {
  backupStateTable,
  backupTierStateTable,
  backupFileTable,
  updateTierState,
} from "../slices/backupSlice";

const mockConfig: BackupConfig = {
  WBD_BACKUP_S3_ENABLED: true,
  WBD_BACKUP_S3_ACCESS_KEY_ID: "test-key",
  WBD_BACKUP_S3_SECRET_ACCESS_KEY: "test-secret",
  WBD_BACKUP_S3_ENDPOINT: "http://localhost:9000",
  WBD_BACKUP_S3_BUCKET_NAME: "test-bucket",
  WBD_BACKUP_S3_REGION: "us-east-1",
  WBD_BACKUP_ENABLED_TIERS: ["hourly", "daily", "weekly", "monthly"],
  WBD_BACKUP_HOURLY_INTERVAL_HOURS: 12,
  WBD_BACKUP_HOURLY_KEEP_COUNT: 4,
  WBD_BACKUP_DAILY_KEEP_DAYS: 5,
  WBD_BACKUP_WEEKLY_KEEP_WEEKS: 2,
  WBD_BACKUP_MONTHLY_KEEP_MONTHS: 2,
};

type MockFn = ReturnType<typeof mock>;

describe("BackupScheduler", () => {
  let db: DB;
  let performBackupMock: MockFn;
  const backupManager = {
    performBackup: (tiers: string[]) =>
      performBackupMock(tiers) as Promise<void>,
  };
  const check = () =>
    Effect.runPromise(checkAndRunBackups(db, backupManager, mockConfig));

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
            return (
              params ? stmt.values(...params) : stmt.values()
            ) as SqlValue[][];
          },
          finalize(): void {
            stmt.finalize();
          },
        };
      },
    });

    db = new DB(sqliteDriver);
    execSync(
      db.loadTables([backupStateTable, backupTierStateTable, backupFileTable]),
    );

    performBackupMock = mock(async () => {});
  });

  describe("getDueTiers logic", () => {
    test("triggers backup when no tier states exist", async () => {
      await check();

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
        updateTierState({
          tier: "hourly",
          updates: {
            lastScheduledTime: "2026-02-03T08:00:00.000Z", // 4 hours ago
            nextScheduledTime: "2026-02-03T12:00:00.000Z",
            consecutiveFailures: 0,
            isBackupInProgress: false,
          },
        }),
      );

      // Set up other tiers as current
      syncDispatch(
        db,
        updateTierState({
          tier: "daily",
          updates: {
            lastScheduledTime:
              new Date().toISOString().split("T")[0] + "T00:00:00.000Z",
            consecutiveFailures: 0,
            isBackupInProgress: false,
          },
        }),
      );

      syncDispatch(
        db,
        updateTierState({
          tier: "weekly",
          updates: {
            lastScheduledTime:
              new Date().toISOString().split("T")[0] + "T00:00:00.000Z",
            consecutiveFailures: 0,
            isBackupInProgress: false,
          },
        }),
      );

      syncDispatch(
        db,
        updateTierState({
          tier: "monthly",
          updates: {
            lastScheduledTime:
              new Date().toISOString().split("T")[0] + "T00:00:00.000Z",
            consecutiveFailures: 0,
            isBackupInProgress: false,
          },
        }),
      );

      await check();

      // Should have been called (at least hourly should be due)
      expect(performBackupMock).toHaveBeenCalled();
    });

    test("does not trigger backup when all tiers are current", async () => {
      const now = new Date();
      const intervalMs =
        mockConfig.WBD_BACKUP_HOURLY_INTERVAL_HOURS * 60 * 60 * 1000;
      const scheduledTime = new Date(
        Math.floor(now.getTime() / intervalMs) * intervalMs,
      );
      const scheduledTimeStr = scheduledTime.toISOString();

      // Set all tiers to current scheduled time
      syncDispatch(
        db,
        updateTierState({
          tier: "hourly",
          updates: {
            lastScheduledTime: scheduledTimeStr,
            consecutiveFailures: 0,
            isBackupInProgress: false,
          },
        }),
      );

      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      syncDispatch(
        db,
        updateTierState({
          tier: "daily",
          updates: {
            lastScheduledTime: today.toISOString(),
            consecutiveFailures: 0,
            isBackupInProgress: false,
          },
        }),
      );

      // Get current week start (Monday)
      const currentWeekStart = new Date(today);
      const day = currentWeekStart.getUTCDay();
      const diff = (day === 0 ? -6 : 1) - day; // Adjust to Monday
      currentWeekStart.setUTCDate(currentWeekStart.getUTCDate() + diff);
      syncDispatch(
        db,
        updateTierState({
          tier: "weekly",
          updates: {
            lastScheduledTime: currentWeekStart.toISOString(),
            consecutiveFailures: 0,
            isBackupInProgress: false,
          },
        }),
      );

      // Get current month start
      const monthStart = new Date(today);
      monthStart.setUTCDate(1);
      syncDispatch(
        db,
        updateTierState({
          tier: "monthly",
          updates: {
            lastScheduledTime: monthStart.toISOString(),
            consecutiveFailures: 0,
            isBackupInProgress: false,
          },
        }),
      );

      await check();

      // Should NOT have been called
      expect(performBackupMock).not.toHaveBeenCalled();
    });

    test("skips tier with backup in progress", async () => {
      // Set hourly as in progress
      syncDispatch(
        db,
        updateTierState({
          tier: "hourly",
          updates: {
            lastScheduledTime: "2026-02-03T08:00:00.000Z",
            isBackupInProgress: true, // In progress!
          },
        }),
      );

      await check();

      // Should be called, but hourly should not be in the list
      if (performBackupMock.mock.calls.length > 0) {
        const callArgs = performBackupMock.mock.calls[0]?.[0];
        expect(callArgs).not.toContain("hourly");
      }
    });
  });

  describe("scheduling", () => {
    test("checks on start and again every 15 minutes", async () => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const fiber = yield* Effect.forkChild(
            runBackupScheduler(db, backupManager, mockConfig),
          );
          yield* TestClock.adjust("1 millis");
          expect(performBackupMock).toHaveBeenCalledTimes(1);
          yield* TestClock.adjust("15 minutes");
          expect(performBackupMock).toHaveBeenCalledTimes(2);
          yield* Fiber.interrupt(fiber);
        }).pipe(Effect.provide(TestClock.layer())),
      );
    });

    test("does not start a check while one is running", async () => {
      let releaseBackup = () => {};
      performBackupMock.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            releaseBackup = resolve;
          }),
      );
      await Effect.runPromise(
        Effect.gen(function* () {
          const fiber = yield* Effect.forkChild(
            runBackupScheduler(db, backupManager, mockConfig),
          );
          yield* TestClock.adjust("1 hour");
          expect(performBackupMock).toHaveBeenCalledTimes(1);
          releaseBackup();
          yield* TestClock.adjust("15 minutes");
          expect(performBackupMock).toHaveBeenCalledTimes(2);
          releaseBackup();
          yield* Fiber.interrupt(fiber);
        }).pipe(Effect.provide(TestClock.layer())),
      );
    });

    test("waits for an active backup check before stopping", async () => {
      let started = () => {};
      const backupStarted = new Promise<void>((resolve) => {
        started = resolve;
      });
      let releaseBackup = () => {};
      performBackupMock.mockImplementation(() => {
        started();
        return new Promise<void>((resolve) => {
          releaseBackup = resolve;
        });
      });
      const fiber = Effect.runFork(
        runBackupScheduler(db, backupManager, mockConfig),
      );
      await backupStarted;

      let stopped = false;
      const stopPromise = Effect.runPromise(Fiber.interrupt(fiber)).then(() => {
        stopped = true;
      });
      await Promise.resolve();
      expect(stopped).toBe(false);

      releaseBackup();
      await stopPromise;
      expect(stopped).toBe(true);
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

        expect(await check()).toBeUndefined();

        // Verify error was logged
        expect(consoleErrorMock).toHaveBeenCalledWith(
          "[BackupScheduler] Backup check failed:",
          expect.any(Error),
        );
      } finally {
        // Restore console.error
        console.error = originalConsoleError;
      }
    });
  });
});
