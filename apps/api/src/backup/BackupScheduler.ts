import type { DB } from "@will-be-done/hyperdb";
import { select } from "@will-be-done/hyperdb";
import type { BackupManager } from "./BackupManager";
import type { BackupTier, BackupConfig } from "./types";
import { ScheduledTimeCalculator } from "./ScheduledTimeCalculator";
import { backupSlice } from "../slices/backupSlice";

export class BackupScheduler {
  private intervalId: Timer | null = null;
  private scheduledTimeCalculator: ScheduledTimeCalculator;

  constructor(
    private mainDB: DB,
    private backupManager: BackupManager,
    private config: BackupConfig
  ) {
    this.scheduledTimeCalculator = new ScheduledTimeCalculator(config);
  }

  start(): void {
    console.log("[BackupScheduler] Starting backup scheduler");

    // Run initial check on startup (to catch any missed backups)
    void this.checkAndRunBackups();

    // Check every 15 minutes
    this.intervalId = setInterval(() => {
      void this.checkAndRunBackups();
    }, 15 * 60 * 1000);

    console.log("[BackupScheduler] Backup scheduler started (checking every 15 minutes)");
  }

  private async checkAndRunBackups(): Promise<void> {
    try {
      const now = new Date();

      // Load all tier states
      const allTiers: BackupTier[] = ["hourly", "daily", "weekly", "monthly"];
      const tierStates = new Map();

      for (const tier of allTiers) {
        const state = select(this.mainDB, backupSlice.getTierState(tier));
        tierStates.set(tier, state);
      }

      // Determine which tiers are due
      const dueTiers = this.scheduledTimeCalculator.getDueTiers(
        tierStates,
        now
      );

      if (dueTiers.length === 0) {
        console.log("[BackupScheduler] No backups due");
        return;
      }

      console.log(
        `[BackupScheduler] Tiers due for backup: ${dueTiers.join(", ")}`
      );

      // Run backups for all due tiers
      await this.backupManager.performBackup(dueTiers);
    } catch (error) {
      console.error("[BackupScheduler] Backup check failed:", error);
    }
  }

  async stop(): Promise<void> {
    console.log("[BackupScheduler] Stopping backup scheduler");

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    console.log("[BackupScheduler] Backup scheduler stopped");
  }
}
