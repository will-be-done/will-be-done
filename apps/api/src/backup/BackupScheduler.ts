import { DB } from "@will-be-done/hyperdb";
import { selectSync } from "@will-be-done/hyperdb";
import type { BackupManager } from "./BackupManager";
import type { BackupTier, BackupConfig } from "./types";
import { ScheduledTimeCalculator } from "./ScheduledTimeCalculator";
import { getTierState } from "../slices/backupSlice";
import { State } from "../utils/State";

export class BackupScheduler {
  private intervalId: Timer | null = null;
  private readonly activeCheck = new State<Promise<void> | null>(null);
  private scheduledTimeCalculator: ScheduledTimeCalculator;

  constructor(
    private mainDB: DB,
    private backupManager: BackupManager,
    private config: BackupConfig,
  ) {
    this.scheduledTimeCalculator = new ScheduledTimeCalculator(config);
  }

  start(): void {
    if (this.intervalId) return;
    console.log("[BackupScheduler] Starting backup scheduler");

    // Run initial check on startup (to catch any missed backups)
    void this.runCheck();

    // Check every 15 minutes
    this.intervalId = setInterval(
      () => {
        void this.runCheck();
      },
      15 * 60 * 1000,
    );

    console.log(
      "[BackupScheduler] Backup scheduler started (checking every 15 minutes)",
    );
  }

  private runCheck(): Promise<void> {
    const activeCheck = this.activeCheck.get();
    if (activeCheck) return activeCheck;

    const check = this.checkAndRunBackups();
    this.activeCheck.set(check);
    const clearActiveCheck = () => {
      if (this.activeCheck.get() === check) this.activeCheck.set(null);
    };
    void check.then(clearActiveCheck, clearActiveCheck);
    return check;
  }

  private async checkAndRunBackups(): Promise<void> {
    try {
      const now = new Date();

      // Load all tier states
      const allTiers: BackupTier[] = ["hourly", "daily", "weekly", "monthly"];
      const tierStates = new Map();

      for (const tier of allTiers) {
        const state = selectSync(this.mainDB, {
          selector: getTierState,
          args: { tier },
        });
        tierStates.set(tier, state);
      }

      // Determine which tiers are due
      const dueTiers = this.scheduledTimeCalculator.getDueTiers(
        tierStates,
        now,
      );

      if (dueTiers.length === 0) {
        console.log("[BackupScheduler] No backups due");
        return;
      }

      console.log(
        `[BackupScheduler] Tiers due for backup: ${dueTiers.join(", ")}`,
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

    await this.activeCheck.get();

    console.log("[BackupScheduler] Backup scheduler stopped");
  }
}
