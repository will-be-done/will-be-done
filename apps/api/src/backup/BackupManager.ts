import { Database } from "bun:sqlite";
import { readdirSync, unlinkSync, existsSync, mkdirSync } from "fs";
import { stat, readFile, writeFile } from "fs/promises";
import path from "path";
import type { DB } from "@will-be-done/hyperdb";
import { syncDispatch, select } from "@will-be-done/hyperdb";
import { S3Client } from "./S3Client";
import { RetentionPolicy } from "./RetentionPolicy";
import { ScheduledTimeCalculator } from "./ScheduledTimeCalculator";
import { backupSlice } from "../slices/backupSlice";
import type { BackupConfig, BackupTier } from "./types";

export class BackupManager {
  private s3Client: S3Client;
  private retentionPolicy: RetentionPolicy;
  private scheduledTimeCalculator: ScheduledTimeCalculator;
  private tempBackupDir: string;

  constructor(
    private mainDB: DB,
    private config: BackupConfig,
    private dbsPath: string,
  ) {
    console.log("[BackupManager] Initializing backup manager");
    this.s3Client = new S3Client(config);
    this.retentionPolicy = new RetentionPolicy(config);
    this.scheduledTimeCalculator = new ScheduledTimeCalculator(config);
    this.tempBackupDir = path.join(dbsPath, "backups-temp");

    // Ensure temp backup directory exists
    if (!existsSync(this.tempBackupDir)) {
      mkdirSync(this.tempBackupDir, { recursive: true });
    }
  }

  async verifyBucketAccess(): Promise<void> {
    return this.s3Client.verifyBucketAccess();
  }

  async performBackup(dueTiers: BackupTier[]): Promise<void> {
    if (dueTiers.length === 0) {
      return;
    }

    const now = new Date();
    const startTime = Date.now();

    // Calculate scheduled times for each tier
    const tierScheduledTimes = new Map<BackupTier, string>();
    const backupIds = new Map<BackupTier, string>();

    // Mark all tiers as in progress
    for (const tier of dueTiers) {
      syncDispatch(
        this.mainDB,
        backupSlice.updateTierState(tier, {
          isBackupInProgress: true,
        }),
      );
    }

    try {
      console.log(`[Backup] Starting backup for tiers: ${dueTiers.join(", ")}`);

      // Create backup records for each tier

      for (const tier of dueTiers) {
        const scheduledTime = this.scheduledTimeCalculator.getScheduledTime(
          tier,
          now,
        );
        const scheduledTimeStr = scheduledTime.toISOString();
        tierScheduledTimes.set(tier, scheduledTimeStr);

        // Create backup record
        const backupId = syncDispatch(
          this.mainDB,
          backupSlice.createBackup(tier, scheduledTimeStr),
        );
        backupIds.set(tier, backupId);

        // Mark as running
        syncDispatch(this.mainDB, backupSlice.startBackup(backupId));

        console.log(
          `[Backup] Created ${tier} backup (scheduled: ${scheduledTimeStr}, id: ${backupId})`,
        );
      }

      // Get all database files
      const dbFiles = this.getAllDatabaseFiles();
      console.log(`[Backup] Found ${dbFiles.length} database files to backup`);

      let totalSize = 0;

      // Process each database file (VACUUM once, upload to all tiers)
      for (let i = 0; i < dbFiles.length; i++) {
        const dbFile = dbFiles[i];
        const dbPath = path.join(this.dbsPath, dbFile);
        const tempBackupPath = path.join(
          this.tempBackupDir,
          `${dbFile}.backup`,
        );

        try {
          console.log(
            `[Backup] Processing ${i + 1}/${dbFiles.length}: ${dbFile}`,
          );

          // VACUUM once per database
          const vacuumStart = Date.now();
          this.vacuumDatabase(dbPath, tempBackupPath);
          const vacuumDurationMs = Date.now() - vacuumStart;

          // Get file size AFTER first VACUUM (before dropping indexes)
          const sizeAfterVacuum = (await stat(tempBackupPath)).size;

          // Drop all indexes and VACUUM again to reclaim space
          const dropIndexStart = Date.now();
          this.dropAllIndexesAndVacuum(tempBackupPath);
          const dropIndexDurationMs = Date.now() - dropIndexStart;

          // Get file size AFTER dropping indexes and second VACUUM
          const fileStats = await stat(tempBackupPath);
          totalSize += fileStats.size;

          const indexReduction = sizeAfterVacuum - fileStats.size;
          const indexReductionPct =
            sizeAfterVacuum > 0
              ? ((indexReduction / sizeAfterVacuum) * 100).toFixed(1)
              : "0.0";

          console.log(
            `[Backup] Processed ${dbFile}: vacuum=${vacuumDurationMs}ms (${(sizeAfterVacuum / 1024 / 1024).toFixed(2)} MB), drop-indexes+vacuum=${dropIndexDurationMs}ms (${(indexReduction / 1024 / 1024).toFixed(2)} MB / ${indexReductionPct}% reduction), final=${(fileStats.size / 1024 / 1024).toFixed(2)} MB`,
          );

          // Compress file
          const compressedPath = tempBackupPath + ".zst";
          const { compressedSize, durationMs: compressionDurationMs } =
            await this.compressFile(tempBackupPath, compressedPath);

          console.log(
            `[Backup] Compressed ${dbFile}: ${(fileStats.size / 1024 / 1024).toFixed(2)} MB → ${(compressedSize / 1024 / 1024).toFixed(2)} MB (${((1 - compressedSize / fileStats.size) * 100).toFixed(1)}% reduction) in ${compressionDurationMs}ms`,
          );

          // Upload to S3 for each tier
          for (const tier of dueTiers) {
            const scheduledTimeStr = tierScheduledTimes.get(tier)!;
            const timestamp = scheduledTimeStr.replace(/[:.]/g, "-");
            const s3Key = `backups/${tier}/${timestamp}/${dbFile}.zst`; // Add .zst extension

            const uploadStart = Date.now();
            await this.s3Client.uploadFile(compressedPath, s3Key); // Upload compressed file
            const uploadDurationMs = Date.now() - uploadStart;

            console.log(
              `[Backup] Uploaded ${dbFile}.zst to ${tier} in ${uploadDurationMs}ms`,
            );

            // Create BackupFile record with both sizes
            const backupId = backupIds.get(tier)!;
            syncDispatch(
              this.mainDB,
              backupSlice.createBackupFile(
                backupId,
                tier,
                scheduledTimeStr,
                dbFile,
                s3Key,
                fileStats.size, // Original size (after vacuum + drop indexes)
                compressedSize, // Compressed size
                vacuumDurationMs,
                uploadDurationMs,
                compressionDurationMs, // Compression duration
              ),
            );
          }

          // Clean up temp files
          unlinkSync(tempBackupPath);
          unlinkSync(compressedPath);
        } catch (error) {
          console.error(`[Backup] Failed to backup ${dbFile}:`, error);
          // Clean up temp files if they exist
          if (existsSync(tempBackupPath)) {
            unlinkSync(tempBackupPath);
          }
          const compressedPath = tempBackupPath + ".zst";
          if (existsSync(compressedPath)) {
            unlinkSync(compressedPath);
          }
          throw error;
        }
      }

      const totalDurationMs = Date.now() - startTime;

      // Mark all backups as completed
      for (const tier of dueTiers) {
        const backupId = backupIds.get(tier)!;
        const scheduledTimeStr = tierScheduledTimes.get(tier)!;
        const scheduledTime = new Date(scheduledTimeStr);
        const nextScheduledTime =
          this.scheduledTimeCalculator.getNextScheduledTime(
            tier,
            scheduledTime,
          );

        syncDispatch(
          this.mainDB,
          backupSlice.completeBackup(backupId, totalSize, totalDurationMs),
        );

        syncDispatch(
          this.mainDB,
          backupSlice.updateTierState(tier, {
            lastScheduledTime: scheduledTimeStr,
            nextScheduledTime: nextScheduledTime.toISOString(),
            lastCompletedAt: new Date().toISOString(),
            consecutiveFailures: 0,
            isBackupInProgress: false,
          }),
        );

        console.log(
          `[Backup] Completed ${tier} backup (next scheduled: ${nextScheduledTime.toISOString()})`,
        );

        // Run cleanup for this tier
        await this.cleanupOldBackups(tier);
      }

      console.log(
        `[Backup] All backups completed in ${(totalDurationMs / 1000).toFixed(2)}s (${(totalSize / 1024 / 1024).toFixed(2)} MB)`,
      );
    } catch (error) {
      console.error(`[Backup] Backup failed:`, error);

      // Mark all tiers as failed
      for (const tier of dueTiers) {
        const backupId = backupIds.get(tier);
        if (backupId) {
          syncDispatch(
            this.mainDB,
            backupSlice.failBackup(
              backupId,
              error instanceof Error ? error.message : String(error),
            ),
          );
        }

        const tierState = select(this.mainDB, backupSlice.getTierState(tier));
        const consecutiveFailures = (tierState?.consecutiveFailures || 0) + 1;

        syncDispatch(
          this.mainDB,
          backupSlice.updateTierState(tier, {
            consecutiveFailures,
            isBackupInProgress: false,
          }),
        );
      }

      throw error;
    }
  }

  async cleanupOldBackups(tier: BackupTier): Promise<void> {
    try {
      console.log(`[Backup] Running cleanup for ${tier} backups`);

      // Get all completed backups for this tier
      const backups = select(
        this.mainDB,
        backupSlice.getCompletedBackupsByTier(tier),
      );

      const retentionCount = this.retentionPolicy.getRetentionCount(tier);

      // If we have more backups than retention count, delete oldest
      if (backups.length > retentionCount) {
        const backupsToDelete = backups.slice(retentionCount);

        console.log(
          `[Backup] Deleting ${backupsToDelete.length} old ${tier} backups (keeping ${retentionCount})`,
        );

        for (const backup of backupsToDelete) {
          try {
            // Get all files for this backup
            const files = select(
              this.mainDB,
              backupSlice.getBackupFiles(backup.id),
            );

            if (files.length > 0) {
              // Delete all files from S3
              const s3Keys = files.map((f) => f.s3Key);
              await this.s3Client.deleteFiles(s3Keys);
              console.log(
                `[Backup] Deleted ${s3Keys.length} files from S3 for backup ${backup.id}`,
              );
            }

            // Delete backup record and all associated files from database
            syncDispatch(
              this.mainDB,
              backupSlice.deleteBackupWithFiles(backup.id),
            );
          } catch (error) {
            console.error(
              `[Backup] Failed to delete backup ${backup.id}:`,
              error,
            );
          }
        }
      } else {
        console.log(
          `[Backup] No cleanup needed for ${tier} (${backups.length}/${retentionCount} backups)`,
        );
      }
    } catch (error) {
      console.error(`[Backup] Cleanup failed for ${tier}:`, error);
    }
  }

  private getAllDatabaseFiles(): string[] {
    const files = readdirSync(this.dbsPath);

    // Filter for .sqlite files only (not .wal or .shm)
    return files.filter(
      (file) => file.endsWith(".sqlite") && !file.includes(".sqlite-"),
    );
  }

  private vacuumDatabase(dbPath: string, outputPath: string): void {
    try {
      const db = new Database(dbPath);
      db.run(`VACUUM main INTO ?`, [outputPath]);
      db.close();
    } catch (error) {
      throw new Error(
        `VACUUM failed for ${dbPath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private dropAllIndexesAndVacuum(dbPath: string): void {
    const db = new Database(dbPath);

    try {
      // Query all user-created indexes (exclude sqlite_autoindex_*)
      const indexes = db
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE type='index'
           AND name NOT LIKE 'sqlite_autoindex_%'
           AND sql IS NOT NULL`,
        )
        .all() as Array<{ name: string }>;

      console.log(
        `[Backup] Dropping ${indexes.length} indexes from ${path.basename(dbPath)}`,
      );

      // Drop each index
      for (const { name } of indexes) {
        try {
          db.run(`DROP INDEX IF EXISTS ${name}`);
        } catch (error) {
          console.warn(`[Backup] Failed to drop index ${name}:`, error);
          // Continue dropping other indexes
        }
      }

      console.log(`[Backup] Dropped all indexes from ${path.basename(dbPath)}`);

      // VACUUM again to reclaim space from dropped indexes
      console.log(`[Backup] Running VACUUM to reclaim index space`);
      db.run(`VACUUM`);
      console.log(`[Backup] VACUUM completed`);
    } finally {
      db.close();
    }
  }

  private async compressFile(
    inputPath: string,
    outputPath: string,
  ): Promise<{ compressedSize: number; durationMs: number }> {
    const startTime = Date.now();

    try {
      // Read file
      const fileBuffer = await readFile(inputPath);

      // Use zstd level 3 for good balance of speed and compression
      // zstd level 3 is faster than gzip level 3 with similar compression ratios
      const compressed = await Bun.zstdCompress(fileBuffer, { level: 3 });

      // Write compressed file
      await writeFile(outputPath, compressed);

      const durationMs = Date.now() - startTime;
      const compressedSize = compressed.length;

      return { compressedSize, durationMs };
    } catch (error) {
      throw new Error(
        `Compression failed for ${inputPath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
