import { Data, Effect, Queue, type Scope } from "effect";
import { BackupDatabase, PageEvents } from "@/services/browser";

const RETENTION_DAYS = 7;

class BackupStoreError extends Data.TaggedError("BackupStoreError")<{
  readonly cause: unknown;
}> {}

const openBackupDB = (indexedDB: IDBFactory, dbName: string) =>
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

export const backUpToday = (
  dbName: string,
  readBackup: Effect.Effect<unknown>,
) =>
  Effect.gen(function* () {
    const db = yield* openBackupDB(yield* BackupDatabase, dbName);
    const keys = (yield* requestResult(
      db.transaction("backups", "readonly").objectStore("backups").getAllKeys(),
    )) as string[];
    const today = todayKey();
    if (keys.includes(today)) return;

    const backup = yield* readBackup;
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

    yield* Effect.logInfo("Auto-backup saved for", today);
  }).pipe(
    Effect.scoped,
    Effect.catchCause((cause) => Effect.logError("Auto-backup failed", cause)),
  );

const IDLE_TIMEOUT = 5 * 60 * 1000;
const USER_EVENTS = [
  "mousemove",
  "keydown",
  "scroll",
  "touchstart",
  "pointerdown",
] as const;

// Backs up once the user has been idle for IDLE_TIMEOUT, then waits for the
// next activity before arming again. Closing the scope stops watching.
export const makeAutoBackup = (
  dbName: string,
  readBackup: Effect.Effect<unknown>,
): Effect.Effect<void, never, PageEvents | BackupDatabase | Scope.Scope> =>
  Effect.gen(function* () {
    const page = yield* PageEvents;
    const activity = yield* Queue.sliding<void>(1);
    for (const event of USER_EVENTS) {
      yield* page.listen(
        "document",
        event,
        () => Queue.offerUnsafe(activity, undefined),
        {
          passive: true,
        },
      );
    }
    yield* Effect.gen(function* () {
      while (true) {
        const idle = yield* Effect.raceFirst(
          Effect.as(Effect.sleep(IDLE_TIMEOUT), true),
          Effect.as(Queue.take(activity), false),
        );
        if (!idle) continue;
        yield* backUpToday(dbName, readBackup);
        yield* Queue.take(activity);
      }
    }).pipe(Effect.forkScoped({ startImmediately: true }));
  });
