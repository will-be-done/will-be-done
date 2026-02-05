import {
  startOfDay,
  startOfWeek,
  startOfMonth,
  addHours,
  addDays,
  addWeeks,
  addMonths,
} from "date-fns";
import type { BackupConfig, BackupTier } from "./types";
import type { BackupTierState } from "../slices/backupSlice";

export class ScheduledTimeCalculator {
  constructor(private config: BackupConfig) {}

  /**
   * Calculate the scheduled time for the current backup window.
   * This is deterministic - same input time always produces same scheduled time.
   *
   * Examples (with 4-hour interval for hourly):
   * - 12:30 → 12:00
   * - 14:15 → 12:00
   * - 16:00 → 16:00
   */
  getScheduledTime(tier: BackupTier, now: Date): Date {
    switch (tier) {
      case "hourly": {
        // Round down to nearest interval boundary
        const intervalMs =
          this.config.BACKUP_HOURLY_INTERVAL_HOURS * 60 * 60 * 1000;
        const timestamp = now.getTime();
        const roundedTimestamp = Math.floor(timestamp / intervalMs) * intervalMs;
        return new Date(roundedTimestamp);
      }

      case "daily": {
        // Start of current day (midnight)
        return startOfDay(now);
      }

      case "weekly": {
        // Start of current week (Monday midnight)
        return startOfWeek(now, { weekStartsOn: 1 });
      }

      case "monthly": {
        // Start of current month (1st midnight)
        return startOfMonth(now);
      }

      default:
        throw new Error(`Unknown backup tier: ${tier}`);
    }
  }

  /**
   * Calculate the next scheduled time after the given scheduled time.
   */
  getNextScheduledTime(tier: BackupTier, currentScheduledTime: Date): Date {
    switch (tier) {
      case "hourly":
        return addHours(
          currentScheduledTime,
          this.config.BACKUP_HOURLY_INTERVAL_HOURS
        );

      case "daily":
        return addDays(currentScheduledTime, 1);

      case "weekly":
        return addWeeks(currentScheduledTime, 1);

      case "monthly":
        return addMonths(currentScheduledTime, 1);

      default:
        throw new Error(`Unknown backup tier: ${tier}`);
    }
  }

  /**
   * Determine which tiers are due for backup.
   * A tier is due if:
   * 1. It is enabled in the configuration
   * 2. It has never run (lastScheduledTime is null)
   * 3. The current scheduled time is different from the last scheduled time
   * 4. No backup is currently in progress for this tier
   */
  getDueTiers(
    tierStates: Map<BackupTier, BackupTierState | undefined>,
    now: Date
  ): BackupTier[] {
    const enabledTiers = this.config.BACKUP_ENABLED_TIERS;
    const dueTiers: BackupTier[] = [];

    for (const tier of enabledTiers) {
      const tierState = tierStates.get(tier);
      const currentScheduledTime = this.getScheduledTime(tier, now);
      const currentScheduledTimeStr = currentScheduledTime.toISOString();

      // Skip if backup is in progress
      if (tierState?.isBackupInProgress) {
        continue;
      }

      // Tier is due if:
      // 1. Never run before (no lastScheduledTime)
      // 2. Current scheduled time differs from last scheduled time
      if (
        !tierState?.lastScheduledTime ||
        tierState.lastScheduledTime !== currentScheduledTimeStr
      ) {
        dueTiers.push(tier);
      }
    }

    return dueTiers;
  }
}
