import { describe, test, expect } from "bun:test";
import { ScheduledTimeCalculator } from "./ScheduledTimeCalculator";
import type { BackupConfig, BackupTier } from "./types";
import type { BackupTierState } from "../slices/backupSlice";

const mockConfig: BackupConfig = {
  IS_S3_SQLITE_BACKUP_ENABLED: true,
  S3_ACCESS_KEY_ID: "test-key",
  S3_SECRET_ACCESS_KEY: "test-secret",
  S3_ENDPOINT: "http://localhost:9000",
  S3_BUCKET_NAME: "test-bucket",
  S3_REGION: "us-east-1",
  BACKUP_ENABLED_TIERS: ["hourly", "daily", "weekly", "monthly"],
  BACKUP_HOURLY_INTERVAL_HOURS: 4,
  BACKUP_HOURLY_KEEP_COUNT: 4,
  BACKUP_DAILY_KEEP_DAYS: 5,
  BACKUP_WEEKLY_KEEP_WEEKS: 2,
  BACKUP_MONTHLY_KEEP_MONTHS: 2,
};

describe("ScheduledTimeCalculator", () => {
  describe("getScheduledTime", () => {
    test("hourly: rounds down to nearest 4-hour boundary", () => {
      const calculator = new ScheduledTimeCalculator(mockConfig);

      // 12:30 -> 12:00
      const time1 = new Date("2026-02-03T12:30:00Z");
      const scheduled1 = calculator.getScheduledTime("hourly", time1);
      expect(scheduled1.toISOString()).toBe("2026-02-03T12:00:00.000Z");

      // 14:15 -> 12:00
      const time2 = new Date("2026-02-03T14:15:00Z");
      const scheduled2 = calculator.getScheduledTime("hourly", time2);
      expect(scheduled2.toISOString()).toBe("2026-02-03T12:00:00.000Z");

      // 16:00 -> 16:00 (exact boundary)
      const time3 = new Date("2026-02-03T16:00:00Z");
      const scheduled3 = calculator.getScheduledTime("hourly", time3);
      expect(scheduled3.toISOString()).toBe("2026-02-03T16:00:00.000Z");

      // 15:59 -> 12:00
      const time4 = new Date("2026-02-03T15:59:00Z");
      const scheduled4 = calculator.getScheduledTime("hourly", time4);
      expect(scheduled4.toISOString()).toBe("2026-02-03T12:00:00.000Z");
    });

    test("daily: returns start of current day", () => {
      const calculator = new ScheduledTimeCalculator(mockConfig);

      const time = new Date("2026-02-03T14:30:45Z");
      const scheduled = calculator.getScheduledTime("daily", time);

      expect(scheduled.toISOString()).toBe("2026-02-03T00:00:00.000Z");
      expect(scheduled.getUTCHours()).toBe(0);
      expect(scheduled.getUTCMinutes()).toBe(0);
      expect(scheduled.getUTCSeconds()).toBe(0);
    });

    test("weekly: returns start of current week (Monday)", () => {
      const calculator = new ScheduledTimeCalculator(mockConfig);

      // Tuesday Feb 4, 2026 -> Monday Feb 3, 2026
      const time = new Date("2026-02-04T14:30:00Z");
      const scheduled = calculator.getScheduledTime("weekly", time);

      expect(scheduled.toISOString()).toBe("2026-02-02T00:00:00.000Z");
      expect(scheduled.getUTCDay()).toBe(1); // Monday
    });

    test("monthly: returns start of current month", () => {
      const calculator = new ScheduledTimeCalculator(mockConfig);

      const time = new Date("2026-02-15T14:30:00Z");
      const scheduled = calculator.getScheduledTime("monthly", time);

      expect(scheduled.toISOString()).toBe("2026-02-01T00:00:00.000Z");
      expect(scheduled.getUTCDate()).toBe(1);
      expect(scheduled.getUTCHours()).toBe(0);
    });

    test("throws error for unknown tier", () => {
      const calculator = new ScheduledTimeCalculator(mockConfig);

      expect(() => {
        calculator.getScheduledTime("unknown" as BackupTier, new Date());
      }).toThrow("Unknown backup tier: unknown");
    });
  });

  describe("getNextScheduledTime", () => {
    test("hourly: adds interval hours", () => {
      const calculator = new ScheduledTimeCalculator(mockConfig);
      const current = new Date("2026-02-03T12:00:00Z");

      const next = calculator.getNextScheduledTime("hourly", current);

      expect(next.toISOString()).toBe("2026-02-03T16:00:00.000Z");
    });

    test("daily: adds one day", () => {
      const calculator = new ScheduledTimeCalculator(mockConfig);
      const current = new Date("2026-02-03T00:00:00Z");

      const next = calculator.getNextScheduledTime("daily", current);

      expect(next.toISOString()).toBe("2026-02-04T00:00:00.000Z");
    });

    test("weekly: adds one week", () => {
      const calculator = new ScheduledTimeCalculator(mockConfig);
      const current = new Date("2026-02-02T00:00:00Z"); // Monday

      const next = calculator.getNextScheduledTime("weekly", current);

      expect(next.toISOString()).toBe("2026-02-09T00:00:00.000Z");
      expect(next.getUTCDay()).toBe(1); // Still Monday
    });

    test("monthly: adds one month", () => {
      const calculator = new ScheduledTimeCalculator(mockConfig);
      const current = new Date("2026-02-01T00:00:00Z");

      const next = calculator.getNextScheduledTime("monthly", current);

      expect(next.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    });
  });

  describe("getDueTiers", () => {
    test("returns all tiers when none have run before", () => {
      const calculator = new ScheduledTimeCalculator(mockConfig);
      const now = new Date("2026-02-03T12:30:00Z");

      const tierStates = new Map<BackupTier, BackupTierState | undefined>([
        ["hourly", undefined],
        ["daily", undefined],
        ["weekly", undefined],
        ["monthly", undefined],
      ]);

      const dueTiers = calculator.getDueTiers(tierStates, now);

      expect(dueTiers).toEqual(["hourly", "daily", "weekly", "monthly"]);
    });

    test("returns only hourly when last scheduled time is different", () => {
      const calculator = new ScheduledTimeCalculator(mockConfig);
      const now = new Date("2026-02-03T12:30:00Z");

      const tierStates = new Map<BackupTier, BackupTierState | undefined>([
        [
          "hourly",
          {
            id: "1",
            tier: "hourly",
            lastScheduledTime: "2026-02-03T08:00:00.000Z", // Last window was 8:00
            nextScheduledTime: "2026-02-03T12:00:00.000Z",
            lastCompletedAt: "2026-02-03T08:05:00.000Z",
            consecutiveFailures: 0,
            isBackupInProgress: false,
          },
        ],
        [
          "daily",
          {
            id: "2",
            tier: "daily",
            lastScheduledTime: "2026-02-03T00:00:00.000Z", // Same day
            nextScheduledTime: "2026-02-04T00:00:00.000Z",
            lastCompletedAt: "2026-02-03T00:05:00.000Z",
            consecutiveFailures: 0,
            isBackupInProgress: false,
          },
        ],
        [
          "weekly",
          {
            id: "3",
            tier: "weekly",
            lastScheduledTime: "2026-02-02T00:00:00.000Z", // Same week
            nextScheduledTime: "2026-02-09T00:00:00.000Z",
            lastCompletedAt: "2026-02-02T00:05:00.000Z",
            consecutiveFailures: 0,
            isBackupInProgress: false,
          },
        ],
        [
          "monthly",
          {
            id: "4",
            tier: "monthly",
            lastScheduledTime: "2026-02-01T00:00:00.000Z", // Same month
            nextScheduledTime: "2026-03-01T00:00:00.000Z",
            lastCompletedAt: "2026-02-01T00:05:00.000Z",
            consecutiveFailures: 0,
            isBackupInProgress: false,
          },
        ],
      ]);

      const dueTiers = calculator.getDueTiers(tierStates, now);

      // Only hourly should be due (current window is 12:00, last was 8:00)
      expect(dueTiers).toEqual(["hourly"]);
    });

    test("returns multiple tiers when multiple windows have changed", () => {
      const calculator = new ScheduledTimeCalculator(mockConfig);
      const now = new Date("2026-02-04T00:30:00Z"); // Next day

      const tierStates = new Map<BackupTier, BackupTierState | undefined>([
        [
          "hourly",
          {
            id: "1",
            tier: "hourly",
            lastScheduledTime: "2026-02-03T20:00:00.000Z", // Yesterday evening
            nextScheduledTime: "2026-02-04T00:00:00.000Z",
            lastCompletedAt: "2026-02-03T20:05:00.000Z",
            consecutiveFailures: 0,
            isBackupInProgress: false,
          },
        ],
        [
          "daily",
          {
            id: "2",
            tier: "daily",
            lastScheduledTime: "2026-02-03T00:00:00.000Z", // Yesterday
            nextScheduledTime: "2026-02-04T00:00:00.000Z",
            lastCompletedAt: "2026-02-03T00:05:00.000Z",
            consecutiveFailures: 0,
            isBackupInProgress: false,
          },
        ],
        [
          "weekly",
          {
            id: "3",
            tier: "weekly",
            lastScheduledTime: "2026-02-02T00:00:00.000Z", // Same week
            nextScheduledTime: "2026-02-09T00:00:00.000Z",
            lastCompletedAt: "2026-02-02T00:05:00.000Z",
            consecutiveFailures: 0,
            isBackupInProgress: false,
          },
        ],
        [
          "monthly",
          {
            id: "4",
            tier: "monthly",
            lastScheduledTime: "2026-02-01T00:00:00.000Z", // Same month
            nextScheduledTime: "2026-03-01T00:00:00.000Z",
            lastCompletedAt: "2026-02-01T00:05:00.000Z",
            consecutiveFailures: 0,
            isBackupInProgress: false,
          },
        ],
      ]);

      const dueTiers = calculator.getDueTiers(tierStates, now);

      // Both hourly (0:00 window) and daily (Feb 4) should be due
      expect(dueTiers).toEqual(["hourly", "daily"]);
    });

    test("skips tiers with backup in progress", () => {
      const calculator = new ScheduledTimeCalculator(mockConfig);
      const now = new Date("2026-02-03T12:30:00Z");

      const tierStates = new Map<BackupTier, BackupTierState | undefined>([
        [
          "hourly",
          {
            id: "1",
            tier: "hourly",
            lastScheduledTime: "2026-02-03T08:00:00.000Z",
            nextScheduledTime: "2026-02-03T12:00:00.000Z",
            lastCompletedAt: "2026-02-03T08:05:00.000Z",
            consecutiveFailures: 0,
            isBackupInProgress: true, // In progress!
          },
        ],
        ["daily", undefined],
        ["weekly", undefined],
        ["monthly", undefined],
      ]);

      const dueTiers = calculator.getDueTiers(tierStates, now);

      // Hourly should be skipped because backup is in progress
      expect(dueTiers).toEqual(["daily", "weekly", "monthly"]);
    });

    test("returns empty array when all tiers are up to date", () => {
      const calculator = new ScheduledTimeCalculator(mockConfig);
      const now = new Date("2026-02-03T12:30:00Z");

      const tierStates = new Map<BackupTier, BackupTierState | undefined>([
        [
          "hourly",
          {
            id: "1",
            tier: "hourly",
            lastScheduledTime: "2026-02-03T12:00:00.000Z", // Current window
            nextScheduledTime: "2026-02-03T16:00:00.000Z",
            lastCompletedAt: "2026-02-03T12:05:00.000Z",
            consecutiveFailures: 0,
            isBackupInProgress: false,
          },
        ],
        [
          "daily",
          {
            id: "2",
            tier: "daily",
            lastScheduledTime: "2026-02-03T00:00:00.000Z", // Current day
            nextScheduledTime: "2026-02-04T00:00:00.000Z",
            lastCompletedAt: "2026-02-03T00:05:00.000Z",
            consecutiveFailures: 0,
            isBackupInProgress: false,
          },
        ],
        [
          "weekly",
          {
            id: "3",
            tier: "weekly",
            lastScheduledTime: "2026-02-02T00:00:00.000Z", // Current week
            nextScheduledTime: "2026-02-09T00:00:00.000Z",
            lastCompletedAt: "2026-02-02T00:05:00.000Z",
            consecutiveFailures: 0,
            isBackupInProgress: false,
          },
        ],
        [
          "monthly",
          {
            id: "4",
            tier: "monthly",
            lastScheduledTime: "2026-02-01T00:00:00.000Z", // Current month
            nextScheduledTime: "2026-03-01T00:00:00.000Z",
            lastCompletedAt: "2026-02-01T00:05:00.000Z",
            consecutiveFailures: 0,
            isBackupInProgress: false,
          },
        ],
      ]);

      const dueTiers = calculator.getDueTiers(tierStates, now);

      expect(dueTiers).toEqual([]);
    });

    test("respects BACKUP_ENABLED_TIERS configuration", () => {
      // Config with only daily and weekly enabled
      const configWithLimitedTiers: BackupConfig = {
        ...mockConfig,
        BACKUP_ENABLED_TIERS: ["daily", "weekly"],
      };
      const calculator = new ScheduledTimeCalculator(configWithLimitedTiers);
      const now = new Date("2026-02-03T12:30:00Z");

      const tierStates = new Map<BackupTier, BackupTierState | undefined>([
        ["hourly", undefined],
        ["daily", undefined],
        ["weekly", undefined],
        ["monthly", undefined],
      ]);

      const dueTiers = calculator.getDueTiers(tierStates, now);

      // Only daily and weekly should be due, not hourly or monthly
      expect(dueTiers).toEqual(["daily", "weekly"]);
    });
  });
});
