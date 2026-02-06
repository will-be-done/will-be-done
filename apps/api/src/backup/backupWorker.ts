import { Database } from "bun:sqlite";
import { DB, execSync, SqlDriver } from "@will-be-done/hyperdb";
import path from "path";
import fs from "fs";
import {
  backupStateTable,
  backupTierStateTable,
  backupFileTable,
} from "../slices/backupSlice";
import { usersTable, tokensTable } from "../slices/authSlice";
import { dbsTable } from "../slices/dbSlice";
import { BackupManager } from "./BackupManager";
import { BackupScheduler } from "./BackupScheduler";
import type { BackupConfig } from "./types";

// Message types for worker communication
export type WorkerMessage =
  | { type: "init"; config: BackupConfig; dbsPath: string }
  | { type: "shutdown" };

export type WorkerResponse =
  | { type: "initialized" }
  | { type: "shutdown-complete" }
  | { type: "error"; message: string };

// Create a standalone main database connection for the worker
function createMainDB(dbsPath: string): DB {
  const dbPath = path.join(dbsPath, "main-main.sqlite");
  console.log("[BackupWorker] Loading database...", dbPath);
  const sqliteDB = new Database(dbPath, { strict: true });

  sqliteDB.run("PRAGMA journal_mode=WAL;");
  sqliteDB.run("PRAGMA synchronous=NORMAL;");
  sqliteDB.run("PRAGMA journal_size_limit=6144000;");
  sqliteDB.run("PRAGMA foreign_keys = ON;");
  sqliteDB.run("PRAGMA busy_timeout=5000;");

  type SqlValue = number | string | Uint8Array | null;
  const sqliteDriver = new SqlDriver({
    exec(sql: string, params?: SqlValue[]): void {
      if (!params) {
        sqliteDB.run(sql);
      } else {
        sqliteDB.run(sql, params);
      }
    },
    prepare(sql: string) {
      const stmt = sqliteDB.prepare(sql);

      return {
        values(values: SqlValue[]): SqlValue[][] {
          return stmt.values(...values) as SqlValue[][];
        },
        finalize(): void {
          stmt.finalize();
        },
      };
    },
  });

  const db = new DB(sqliteDriver);

  // Load required tables
  execSync(
    db.loadTables([
      usersTable,
      tokensTable,
      dbsTable,
      backupStateTable,
      backupTierStateTable,
      backupFileTable,
    ])
  );

  return db;
}

// Worker state
let backupScheduler: BackupScheduler | null = null;

// Handle messages from main thread
declare const self: Worker;

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;

  switch (message.type) {
    case "init": {
      try {
        console.log("[BackupWorker] Initializing backup worker...");

        const { config, dbsPath } = message;

        // Ensure temp backup directory exists
        const tempBackupPath = path.join(dbsPath, "backups-temp");
        if (!fs.existsSync(tempBackupPath)) {
          fs.mkdirSync(tempBackupPath, { recursive: true });
        }

        // Create our own database connection
        const mainDB = createMainDB(dbsPath);

        // Initialize backup manager and scheduler
        const backupManager = new BackupManager(mainDB, config, dbsPath);

        console.log(
          "[BackupWorker] Skipping bucket verification (will verify on first upload)"
        );

        backupScheduler = new BackupScheduler(mainDB, backupManager, config);
        backupScheduler.start();

        console.log("[BackupWorker] Backup worker initialized successfully");

        self.postMessage({ type: "initialized" } satisfies WorkerResponse);
      } catch (error) {
        console.error("[BackupWorker] Failed to initialize:", error);
        self.postMessage({
          type: "error",
          message: error instanceof Error ? error.message : String(error),
        } satisfies WorkerResponse);
      }
      break;
    }

    case "shutdown": {
      try {
        console.log("[BackupWorker] Shutting down...");

        if (backupScheduler) {
          await backupScheduler.stop();
          backupScheduler = null;
        }

        console.log("[BackupWorker] Shutdown complete");

        self.postMessage({ type: "shutdown-complete" } satisfies WorkerResponse);
      } catch (error) {
        console.error("[BackupWorker] Shutdown error:", error);
        self.postMessage({
          type: "error",
          message: error instanceof Error ? error.message : String(error),
        } satisfies WorkerResponse);
      }
      break;
    }
  }
};

console.log("[BackupWorker] Worker started, waiting for init message...");
