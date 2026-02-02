import { Database } from "bun:sqlite";
import { readdirSync, unlinkSync, existsSync, mkdirSync } from "fs";
import { stat } from "fs/promises";
import path from "path";
import type { DB } from "@will-be-done/hyperdb";
import { syncDispatch, select } from "@will-be-done/hyperdb";
import { S3Client } from "./S3Client";
import { RetentionPolicy } from "./RetentionPolicy";
import {
  backupSlice,
  type BackupMetadata,
} from "../slices/backupSlice";
import type { BackupConfig, BackupTier } from "./types";

export class BackupManager {
  private s3Client: S3Client;
  private retentionPolicy: RetentionPolicy;
  private isBackupInProgress = false;
  private tempBackupDir: string;

  constructor(
    private mainDB: DB,
    private config: BackupConfig,
    private dbsPath: string
  ) {
    this.s3Client = new S3Client(config);
    this.retentionPolicy = new RetentionPolicy(config);
    this.tempBackupDir = path.join(dbsPath, "backups-temp");

    // Ensure temp backup directory exists
    if (!existsSync(this.tempBackupDir)) {
      mkdirSync(this.tempBackupDir, { recursive: true });
    }
  }

  async performBackup(tier: BackupTier): Promise<void> {
    if (this.isBackupInProgress) {
      console.log(`[Backup] Backup already in progress, skipping ${tier}`);
      return;
    }

    this.isBackupInProgress = true;
    const startTime = Date.now();

    try {
      console.log(`[Backup] Starting ${tier} backup`);

      // Create backup record
      const backupId = syncDispatch(
        this.mainDB,
        backupSlice.createBackup(tier)
      );

      // Update status to running
      syncDispatch(
        this.mainDB,
        backupSlice.updateBackupStatus(backupId, "running")
      );

      // Get all database files
      const dbFiles = this.getAllDatabaseFiles();
      console.log(`[Backup] Found ${dbFiles.length} database files to backup`);

      const s3Keys: string[] = [];
      let totalSize = 0;

      // Timestamp for this backup batch
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

      // Backup each database file
      for (const dbFile of dbFiles) {
        const dbPath = path.join(this.dbsPath, dbFile);
        const tempBackupPath = path.join(
          this.tempBackupDir,
          `${dbFile}.backup`
        );

        try {
          // Use VACUUM INTO to create clean backup
          await this.vacuumDatabase(dbPath, tempBackupPath);

          // Get file size
          const fileStats = await stat(tempBackupPath);
          totalSize += fileStats.size;

          // Upload to S3
          const s3Key = `backups/${tier}/${timestamp}/${dbFile}`;
          await this.s3Client.uploadFile(tempBackupPath, s3Key);
          s3Keys.push(s3Key);

          console.log(
            `[Backup] Backed up ${dbFile} (${(fileStats.size / 1024 / 1024).toFixed(2)} MB)`
          );

          // Clean up temp file
          unlinkSync(tempBackupPath);
        } catch (error) {
          console.error(`[Backup] Failed to backup ${dbFile}:`, error);
          // Clean up temp file if it exists
          if (existsSync(tempBackupPath)) {
            unlinkSync(tempBackupPath);
          }
          throw error;
        }
      }

      const durationMs = Date.now() - startTime;

      // Update backup status to completed
      const metadata: BackupMetadata = {
        files: dbFiles,
        s3Keys,
        totalSizeBytes: totalSize,
        durationMs,
      };

      syncDispatch(
        this.mainDB,
        backupSlice.updateBackupStatus(backupId, "completed", metadata)
      );

      // Update tier state
      const now = new Date();
      const nextBackupAt = this.retentionPolicy.getNextBackupTime(tier, now);

      syncDispatch(
        this.mainDB,
        backupSlice.updateTierState(tier, {
          lastBackupAt: now.toISOString(),
          nextBackupAt: nextBackupAt.toISOString(),
          consecutiveFailures: 0,
        })
      );

      console.log(
        `[Backup] Completed ${tier} backup in ${(durationMs / 1000).toFixed(2)}s (${(totalSize / 1024 / 1024).toFixed(2)} MB)`
      );
      console.log(
        `[Backup] Next ${tier} backup scheduled for ${nextBackupAt.toISOString()}`
      );

      // Run cleanup
      await this.cleanupOldBackups(tier);
    } catch (error) {
      console.error(`[Backup] ${tier} backup failed:`, error);

      // Update tier state to track failure
      const tierState = select(this.mainDB, backupSlice.getTierState(tier));
      const consecutiveFailures = (tierState?.consecutiveFailures || 0) + 1;

      syncDispatch(
        this.mainDB,
        backupSlice.updateTierState(tier, {
          consecutiveFailures,
        })
      );

      throw error;
    } finally {
      this.isBackupInProgress = false;
    }
  }

  async cleanupOldBackups(tier: BackupTier): Promise<void> {
    try {
      console.log(`[Backup] Running cleanup for ${tier} backups`);

      // Get all completed backups for this tier
      const backups = select(
        this.mainDB,
        backupSlice.getCompletedBackupsByTier(tier)
      );

      const retentionCount = this.retentionPolicy.getRetentionCount(tier);

      // If we have more backups than retention count, delete oldest
      if (backups.length > retentionCount) {
        const backupsToDelete = backups.slice(retentionCount);

        console.log(
          `[Backup] Deleting ${backupsToDelete.length} old ${tier} backups (keeping ${retentionCount})`
        );

        for (const backup of backupsToDelete) {
          try {
            // Parse metadata to get S3 keys
            const metadata = backup.metadata
              ? (JSON.parse(backup.metadata) as BackupMetadata)
              : null;

            if (metadata?.s3Keys && metadata.s3Keys.length > 0) {
              // Delete from S3
              await this.s3Client.deleteFiles(metadata.s3Keys);
              console.log(
                `[Backup] Deleted ${metadata.s3Keys.length} files from S3 for backup ${backup.id}`
              );
            }

            // Delete backup record from database
            syncDispatch(this.mainDB, backupSlice.deleteBackup(backup.id));
          } catch (error) {
            console.error(
              `[Backup] Failed to delete backup ${backup.id}:`,
              error
            );
          }
        }
      } else {
        console.log(
          `[Backup] No cleanup needed for ${tier} (${backups.length}/${retentionCount} backups)`
        );
      }
    } catch (error) {
      console.error(`[Backup] Cleanup failed for ${tier}:`, error);
    }
  }

  shouldBackupNow(tier: BackupTier): boolean {
    const tierState = select(this.mainDB, backupSlice.getTierState(tier));

    if (!tierState) {
      // No tier state yet, should run first backup
      return true;
    }

    const nextBackupAt = tierState.nextBackupAt
      ? new Date(tierState.nextBackupAt)
      : null;

    return this.retentionPolicy.shouldBackupNow(tier, nextBackupAt);
  }

  private getAllDatabaseFiles(): string[] {
    const files = readdirSync(this.dbsPath);

    // Filter for .sqlite files only (not .wal or .shm)
    return files.filter(
      (file) => file.endsWith(".sqlite") && !file.includes(".sqlite-")
    );
  }

  private async vacuumDatabase(
    dbPath: string,
    outputPath: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const db = new Database(dbPath, { readonly: true });

        // Execute VACUUM INTO to create clean backup
        db.run(`VACUUM main INTO '${outputPath}'`);

        db.close();
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }
}
