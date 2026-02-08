import { syncDispatch, SubscribableDB } from "@will-be-done/hyperdb";
import { backupSlice } from "@will-be-done/slices/space";

// --- IndexedDB helpers ---

function openBackupDB(dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(`auto-backups-${dbName}`, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("backups")) {
        db.createObjectStore("backups");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function saveBackup(dbName: string, backup: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    openBackupDB(dbName).then((db) => {
      const key = todayKey();
      const tx = db.transaction("backups", "readwrite");
      const store = tx.objectStore("backups");
      store.put({ backedAt: Date.now(), data: JSON.stringify(backup) }, key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    }, reject);
  });
}

function getAllBackupKeys(dbName: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    openBackupDB(dbName).then((db) => {
      const tx = db.transaction("backups", "readonly");
      const store = tx.objectStore("backups");
      const request = store.getAllKeys();
      request.onsuccess = () => {
        db.close();
        resolve(request.result as string[]);
      };
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
    }, reject);
  });
}

function deleteBackup(dbName: string, dateKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    openBackupDB(dbName).then((db) => {
      const tx = db.transaction("backups", "readwrite");
      const store = tx.objectStore("backups");
      store.delete(dateKey);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    }, reject);
  });
}

async function cleanOldBackups(
  dbName: string,
  retentionDays: number,
): Promise<void> {
  const keys = await getAllBackupKeys(dbName);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  const cutoffKey = todayKeyFrom(cutoff);

  for (const key of keys) {
    if (key < cutoffKey) {
      await deleteBackup(dbName, key);
    }
  }
}

function todayKey(): string {
  return todayKeyFrom(new Date());
}

function todayKeyFrom(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function hasBackupForToday(dbName: string): Promise<boolean> {
  const keys = await getAllBackupKeys(dbName);
  return keys.includes(todayKey());
}

// --- AutoBackuper ---

const IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const USER_EVENTS = [
  "mousemove",
  "keydown",
  "scroll",
  "touchstart",
  "pointerdown",
] as const;

export class AutoBackuper {
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private boundResetIdle: () => void;

  constructor(
    private dbName: string,
    private syncSubDb: SubscribableDB,
  ) {
    this.boundResetIdle = this.resetIdle.bind(this);
  }

  start(): void {
    for (const event of USER_EVENTS) {
      document.addEventListener(event, this.boundResetIdle, { passive: true });
    }
    this.resetIdle();
  }

  stop(): void {
    for (const event of USER_EVENTS) {
      document.removeEventListener(event, this.boundResetIdle);
    }
    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private resetIdle(): void {
    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer);
    }
    this.idleTimer = setTimeout(() => void this.onIdle(), IDLE_TIMEOUT);
  }

  private async onIdle(): Promise<void> {
    try {
      if (await hasBackupForToday(this.dbName)) {
        return;
      }

      const backup = syncDispatch(this.syncSubDb, backupSlice.getBackup());
      await saveBackup(this.dbName, backup);
      await cleanOldBackups(this.dbName, 7);

      console.log("Auto-backup saved for", todayKey());
    } catch (e) {
      console.error("Auto-backup failed:", e);
    }
  }
}
