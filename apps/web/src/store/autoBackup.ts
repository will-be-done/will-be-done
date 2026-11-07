import { asyncDispatch, SubscribableDB } from "@will-be-done/hyperdb";
import { getSpaceBackup } from "@will-be-done/slices/space";
import { Cause, Data, Effect } from "effect";

const RETENTION_DAYS = 7;

class BackupStoreError extends Data.TaggedError("BackupStoreError")<{
  readonly cause: unknown;
}> {}

const openBackupDB = (dbName: string) =>
  Effect.acquireRelease(
    Effect.callback<IDBDatabase, BackupStoreError>((resume) => {
      const request = indexedDB.open(`auto-backups-${dbName}`, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("backups")) {
          db.createObjectStore("backups");
        }
      };
      request.onsuccess = () => resume(Effect.succeed(request.result));
      request.onerror = () =>
        resume(Effect.fail(new BackupStoreError({ cause: request.error })));
    }),
    (db) => Effect.sync(() => db.close()),
  );

const requestResult = <T>(request: IDBRequest<T>) =>
  Effect.callback<T, BackupStoreError>((resume) => {
    request.onsuccess = () => resume(Effect.succeed(request.result));
    request.onerror = () =>
      resume(Effect.fail(new BackupStoreError({ cause: request.error })));
  });

const transactionComplete = (tx: IDBTransaction) =>
  Effect.callback<void, BackupStoreError>((resume) => {
    tx.oncomplete = () => resume(Effect.void);
    tx.onerror = tx.onabort = () =>
      resume(Effect.fail(new BackupStoreError({ cause: tx.error })));
  });

function todayKey(): string {
  return todayKeyFrom(new Date());
}

function todayKeyFrom(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export const backUpToday = (dbName: string, syncSubDb: SubscribableDB) =>
  Effect.gen(function* () {
    const db = yield* openBackupDB(dbName);
    const keys = (yield* requestResult(
      db.transaction("backups", "readonly").objectStore("backups").getAllKeys(),
    )) as string[];
    const today = todayKey();
    if (keys.includes(today)) return;

    const backup = yield* Effect.promise(() =>
      asyncDispatch(syncSubDb, getSpaceBackup({})),
    );
    const saveTx = db.transaction("backups", "readwrite");
    saveTx
      .objectStore("backups")
      .put({ backedAt: Date.now(), data: JSON.stringify(backup) }, today);
    yield* transactionComplete(saveTx);

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
    const cutoffKey = todayKeyFrom(cutoff);
    const expired = keys.filter((key) => key < cutoffKey);
    if (expired.length > 0) {
      const cleanupTx = db.transaction("backups", "readwrite");
      const store = cleanupTx.objectStore("backups");
      for (const key of expired) store.delete(key);
      yield* transactionComplete(cleanupTx);
    }

    console.log("Auto-backup saved for", today);
  }).pipe(
    Effect.scoped,
    Effect.catchCause((cause) =>
      Effect.sync(() =>
        console.error("Auto-backup failed:", Cause.squash(cause)),
      ),
    ),
  );

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
    this.idleTimer = setTimeout(() => this.onIdle(), IDLE_TIMEOUT);
  }

  private onIdle(): void {
    void Effect.runPromise(backUpToday(this.dbName, this.syncSubDb));
  }
}
