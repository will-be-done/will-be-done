import cron from "node-cron";
import type { BackupManager } from "./BackupManager";
import type { BackupTier } from "./types";

export class BackupScheduler {
  private jobs: Map<BackupTier, cron.ScheduledTask> = new Map();

  constructor(private backupManager: BackupManager) {}

  start(): void {
    console.log("[BackupScheduler] Starting backup schedulers");

    // Hourly: Check every 15 minutes
    this.scheduleJob("hourly", "*/15 * * * *");

    // Daily: Check every hour at :05
    this.scheduleJob("daily", "5 * * * *");

    // Weekly: Check daily at 00:10
    this.scheduleJob("weekly", "10 0 * * *");

    // Monthly: Check daily at 00:15
    this.scheduleJob("monthly", "15 0 * * *");

    console.log("[BackupScheduler] All backup schedulers started");
  }

  private scheduleJob(tier: BackupTier, cronExpression: string): void {
    const job = cron.schedule(
      cronExpression,
      () => {
        void (async () => {
          try {
            if (this.backupManager.shouldBackupNow(tier)) {
              console.log(`[BackupScheduler] Triggering ${tier} backup`);
              await this.backupManager.performBackup(tier);
            } else {
              console.log(
                `[BackupScheduler] ${tier} backup not due yet, skipping`
              );
            }
          } catch (error) {
            console.error(`[BackupScheduler] ${tier} backup failed:`, error);
          }
        })();
      },
      {
        scheduled: false, // Don't start immediately, we'll start manually
      }
    );

    this.jobs.set(tier, job);
    job.start();

    console.log(
      `[BackupScheduler] Scheduled ${tier} backup with cron: ${cronExpression}`
    );
  }

  async stop(): Promise<void> {
    console.log("[BackupScheduler] Stopping backup schedulers");

    for (const [tier, job] of this.jobs.entries()) {
      job.stop();
      console.log(`[BackupScheduler] Stopped ${tier} backup scheduler`);
    }

    this.jobs.clear();
  }
}
