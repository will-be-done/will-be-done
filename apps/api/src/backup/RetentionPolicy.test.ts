import { describe, test, expect } from "bun:test";
import { RetentionPolicy } from "./RetentionPolicy";
import type { BackupConfig } from "./types";
import {
  addHours,
  addDays,
  addWeeks,
  addMonths,
  startOfDay,
  startOfWeek,
  startOfMonth,
} from "date-fns";

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

describe("RetentionPolicy", () => {
  describe("getNextBackupTime", () => {
    test("hourly: adds interval hours from last backup", () => {
      const policy = new RetentionPolicy(mockConfig);
      const lastBackup = new Date("2026-02-02T10:00:00Z");

      const nextTime = policy.getNextBackupTime("hourly", lastBackup);

      const expected = addHours(lastBackup, 4);
      expect(nextTime).toEqual(expected);
    });

    test("hourly: uses current time if no last backup", () => {
      const policy = new RetentionPolicy(mockConfig);
      const before = new Date();

      const nextTime = policy.getNextBackupTime("hourly", null);

      const after = new Date();
      // Should be approximately 4 hours from now
      expect(nextTime.getTime()).toBeGreaterThanOrEqual(
        addHours(before, 4).getTime() - 1000
      );
      expect(nextTime.getTime()).toBeLessThanOrEqual(
        addHours(after, 4).getTime() + 1000
      );
    });

    test("daily: returns next day at midnight", () => {
      const policy = new RetentionPolicy(mockConfig);
      const lastBackup = new Date("2026-02-02T10:30:00Z");

      const nextTime = policy.getNextBackupTime("daily", lastBackup);

      const expected = addDays(startOfDay(lastBackup), 1);
      expect(nextTime).toEqual(expected);
      expect(nextTime.getHours()).toBe(0);
      expect(nextTime.getMinutes()).toBe(0);
      expect(nextTime.getSeconds()).toBe(0);
    });

    test("weekly: returns next Monday at midnight", () => {
      const policy = new RetentionPolicy(mockConfig);
      // Sunday Feb 2, 2026
      const lastBackup = new Date("2026-02-02T10:30:00Z");

      const nextTime = policy.getNextBackupTime("weekly", lastBackup);

      // Should be Monday Feb 9, 2026
      const expected = addWeeks(
        startOfWeek(lastBackup, { weekStartsOn: 1 }),
        1
      );
      expect(nextTime).toEqual(expected);
      expect(nextTime.getDay()).toBe(1); // Monday
      expect(nextTime.getHours()).toBe(0);
      expect(nextTime.getMinutes()).toBe(0);
    });

    test("monthly: returns first of next month at midnight", () => {
      const policy = new RetentionPolicy(mockConfig);
      const lastBackup = new Date("2026-02-15T10:30:00Z");

      const nextTime = policy.getNextBackupTime("monthly", lastBackup);

      const expected = addMonths(startOfMonth(lastBackup), 1);
      expect(nextTime).toEqual(expected);
      expect(nextTime.getDate()).toBe(1);
      expect(nextTime.getHours()).toBe(0);
      expect(nextTime.getMinutes()).toBe(0);
    });
  });

  describe("shouldBackupNow", () => {
    test("returns true when no next backup time set", () => {
      const policy = new RetentionPolicy(mockConfig);

      const result = policy.shouldBackupNow("hourly", null);

      expect(result).toBe(true);
    });

    test("returns true when current time is past next backup time", () => {
      const policy = new RetentionPolicy(mockConfig);
      const pastTime = new Date(Date.now() - 1000 * 60 * 60); // 1 hour ago

      const result = policy.shouldBackupNow("hourly", pastTime);

      expect(result).toBe(true);
    });

    test("returns false when current time is before next backup time", () => {
      const policy = new RetentionPolicy(mockConfig);
      const futureTime = new Date(Date.now() + 1000 * 60 * 60); // 1 hour from now

      const result = policy.shouldBackupNow("hourly", futureTime);

      expect(result).toBe(false);
    });
  });

  describe("getRetentionCount", () => {
    test("returns correct counts for each tier", () => {
      const policy = new RetentionPolicy(mockConfig);

      expect(policy.getRetentionCount("hourly")).toBe(4);
      expect(policy.getRetentionCount("daily")).toBe(5);
      expect(policy.getRetentionCount("weekly")).toBe(2);
      expect(policy.getRetentionCount("monthly")).toBe(2);
    });
  });

  describe("getCutoffDate", () => {
    test("hourly: calculates cutoff based on interval * count", () => {
      const policy = new RetentionPolicy(mockConfig);
      const before = new Date();

      const cutoff = policy.getCutoffDate("hourly");

      const after = new Date();
      // 4 backups * 4 hour interval = 16 hours ago
      const expectedBefore = addHours(before, -16);
      const expectedAfter = addHours(after, -16);

      expect(cutoff.getTime()).toBeGreaterThanOrEqual(
        expectedBefore.getTime() - 1000
      );
      expect(cutoff.getTime()).toBeLessThanOrEqual(
        expectedAfter.getTime() + 1000
      );
    });

    test("daily: calculates cutoff for configured days", () => {
      const policy = new RetentionPolicy(mockConfig);
      const before = new Date();

      const cutoff = policy.getCutoffDate("daily");

      const after = new Date();
      const expectedBefore = addDays(before, -5);
      const expectedAfter = addDays(after, -5);

      expect(cutoff.getTime()).toBeGreaterThanOrEqual(
        expectedBefore.getTime() - 1000
      );
      expect(cutoff.getTime()).toBeLessThanOrEqual(
        expectedAfter.getTime() + 1000
      );
    });

    test("weekly: calculates cutoff for configured weeks", () => {
      const policy = new RetentionPolicy(mockConfig);
      const before = new Date();

      const cutoff = policy.getCutoffDate("weekly");

      const after = new Date();
      const expectedBefore = addWeeks(before, -2);
      const expectedAfter = addWeeks(after, -2);

      expect(cutoff.getTime()).toBeGreaterThanOrEqual(
        expectedBefore.getTime() - 1000
      );
      expect(cutoff.getTime()).toBeLessThanOrEqual(
        expectedAfter.getTime() + 1000
      );
    });

    test("monthly: calculates cutoff for configured months", () => {
      const policy = new RetentionPolicy(mockConfig);
      const before = new Date();

      const cutoff = policy.getCutoffDate("monthly");

      const after = new Date();
      const expectedBefore = addMonths(before, -2);
      const expectedAfter = addMonths(after, -2);

      expect(cutoff.getTime()).toBeGreaterThanOrEqual(
        expectedBefore.getTime() - 1000
      );
      expect(cutoff.getTime()).toBeLessThanOrEqual(
        expectedAfter.getTime() + 1000
      );
    });
  });
});
