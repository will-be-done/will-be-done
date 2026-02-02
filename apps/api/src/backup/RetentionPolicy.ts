import {
  addHours,
  addDays,
  addWeeks,
  addMonths,
  startOfDay,
  startOfWeek,
  startOfMonth,
} from "date-fns";
import type { BackupConfig, BackupTier } from "./types";

export class RetentionPolicy {
  constructor(private config: BackupConfig) {}

  getNextBackupTime(tier: BackupTier, lastBackupAt: Date | null): Date {
    const now = new Date();
    const referenceTime = lastBackupAt || now;

    switch (tier) {
      case "hourly": {
        // Add interval hours from last backup
        return addHours(referenceTime, this.config.BACKUP_HOURLY_INTERVAL_HOURS);
      }

      case "daily": {
        // Next day at midnight
        const nextDay = addDays(startOfDay(referenceTime), 1);
        return nextDay;
      }

      case "weekly": {
        // Next Monday at midnight
        const nextMonday = addWeeks(
          startOfWeek(referenceTime, { weekStartsOn: 1 }),
          1
        );
        return nextMonday;
      }

      case "monthly": {
        // First of next month at midnight
        const nextMonth = addMonths(startOfMonth(referenceTime), 1);
        return nextMonth;
      }

      default:
        throw new Error(`Unknown backup tier: ${tier}`);
    }
  }

  shouldBackupNow(tier: BackupTier, nextBackupAt: Date | null): boolean {
    if (!nextBackupAt) {
      // No backup scheduled yet, should run now
      return true;
    }

    const now = new Date();
    return now >= nextBackupAt;
  }

  getRetentionCount(tier: BackupTier): number {
    switch (tier) {
      case "hourly":
        return this.config.BACKUP_HOURLY_KEEP_COUNT;
      case "daily":
        return this.config.BACKUP_DAILY_KEEP_DAYS;
      case "weekly":
        return this.config.BACKUP_WEEKLY_KEEP_WEEKS;
      case "monthly":
        return this.config.BACKUP_MONTHLY_KEEP_MONTHS;
      default:
        throw new Error(`Unknown backup tier: ${tier}`);
    }
  }

  getCutoffDate(tier: BackupTier): Date {
    const now = new Date();
    const retentionCount = this.getRetentionCount(tier);

    switch (tier) {
      case "hourly":
        return addHours(
          now,
          -retentionCount * this.config.BACKUP_HOURLY_INTERVAL_HOURS
        );
      case "daily":
        return addDays(now, -retentionCount);
      case "weekly":
        return addWeeks(now, -retentionCount);
      case "monthly":
        return addMonths(now, -retentionCount);
      default:
        throw new Error(`Unknown backup tier: ${tier}`);
    }
  }
}
