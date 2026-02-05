import { describe, test, expect } from "bun:test";
import { RetentionPolicy } from "./RetentionPolicy";
import type { BackupConfig } from "./types";
import { addHours, addDays, addWeeks, addMonths } from "date-fns";

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

describe("RetentionPolicy", () => {

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
