import { selectSync, type DB } from "@will-be-done/hyperdb";
import { Cause, Clock, Effect, Schedule } from "effect";
import type { BackupManager } from "./BackupManager";
import type { BackupConfig, BackupTier } from "./types";
import { ScheduledTimeCalculator } from "./ScheduledTimeCalculator";
import { getTierState } from "../slices/backupSlice";

type BackupRunner = Pick<BackupManager, "performBackup">;

const allTiers: BackupTier[] = ["hourly", "daily", "weekly", "monthly"];

export const checkAndRunBackups = Effect.fn("checkAndRunBackups")(
  function* (mainDB: DB, backupManager: BackupRunner, config: BackupConfig) {
    const now = new Date(yield* Clock.currentTimeMillis);
    const tierStates = new Map(
      allTiers.map((tier) => [
        tier,
        selectSync(mainDB, { selector: getTierState, args: { tier } }),
      ]),
    );
    const dueTiers = new ScheduledTimeCalculator(config).getDueTiers(
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
    yield* Effect.promise(() => backupManager.performBackup(dueTiers));
  },
  Effect.catchCause((cause) =>
    Effect.sync(() =>
      console.error(
        "[BackupScheduler] Backup check failed:",
        Cause.squash(cause),
      ),
    ),
  ),
);

// A started backup cannot be cancelled, so interrupting the scheduler waits
// for the active check to finish.
export const runBackupScheduler = (
  mainDB: DB,
  backupManager: BackupRunner,
  config: BackupConfig,
) =>
  checkAndRunBackups(mainDB, backupManager, config).pipe(
    Effect.uninterruptible,
    Effect.repeat(Schedule.spaced("15 minutes")),
  );
