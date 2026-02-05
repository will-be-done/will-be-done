import { addHours, addDays, addWeeks, addMonths } from "date-fns";
import type { BackupConfig, BackupTier } from "./types";

export class RetentionPolicy {
  constructor(private config: BackupConfig) {}

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
