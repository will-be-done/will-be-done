import { DB, execSync, SubscribableDB } from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import { createInboxIfNotExists } from "@will-be-done/slices/space";
import { dbIdTrait } from "@will-be-done/slices/traits";
import { Effect, Exit, Layer, Scope } from "effect";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackupDatabase } from "@/services/browser";
import { makeTestLogger, makeTestPage } from "@/services/testing";
import { backUpToday, makeAutoBackup, readSpaceBackup } from "./autoBackup";
import { spaceDBConfig } from "./configs";
import { Database } from "./database";

const backupDBName = "auto-backups-space-1";
const now = new Date(2026, 10, 7, 12);

let indexedDB = new IDBFactory();
let logger = makeTestLogger();
const readSpace = vi.fn<() => Promise<unknown>>();
const readBackup = Effect.promise(() => readSpace());
const layer = () =>
  Layer.mergeAll(Layer.succeed(BackupDatabase, indexedDB), logger.layer);
const backUp = () =>
  Effect.runPromise(
    backUpToday("space-1", readBackup).pipe(Effect.provide(layer())),
  );

const requestResult = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const openBackups = ({ withStore = true } = {}) => {
  const request = indexedDB.open(backupDBName, 1);
  request.onupgradeneeded = () => {
    if (withStore) request.result.createObjectStore("backups");
  };
  return requestResult(request);
};

const seed = async (entries: Record<string, unknown>) => {
  const db = await openBackups();
  const tx = db.transaction("backups", "readwrite");
  for (const [key, value] of Object.entries(entries)) {
    tx.objectStore("backups").put(value, key);
  }
  await new Promise((resolve) => (tx.oncomplete = resolve));
  db.close();
};

const readBackups = async () => {
  const db = await openBackups();
  const store = db.transaction("backups").objectStore("backups");
  const [keys, values] = await Promise.all([
    requestResult(store.getAllKeys()),
    requestResult(store.getAll()),
  ]);
  db.close();
  return Object.fromEntries(keys.map((key, i) => [String(key), values[i]]));
};

// Deletion waits on any connection backUpToday left open.
const expectConnectionClosed = () =>
  new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(backupDBName);
    request.onsuccess = () => resolve();
    request.onblocked = () =>
      reject(new Error("an open backup connection blocked deletion"));
    request.onerror = () => reject(request.error);
  });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now });
  indexedDB = new IDBFactory();
  logger = makeTestLogger();
  readSpace.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("auto-backup", () => {
  it("saves today's backup and prunes backups past the retention window", async () => {
    readSpace.mockResolvedValue({ tasks: [{ id: "task-1" }] });
    await seed({
      "2026-10-30": { backedAt: 1, data: "expired" },
      "2026-10-31": { backedAt: 2, data: "oldest kept" },
      "2026-11-06": { backedAt: 3, data: "yesterday" },
    });

    await backUp();

    expect(readSpace).toHaveBeenCalledOnce();
    expect(await readBackups()).toEqual({
      "2026-10-31": { backedAt: 2, data: "oldest kept" },
      "2026-11-06": { backedAt: 3, data: "yesterday" },
      "2026-11-07": {
        backedAt: now.getTime(),
        data: JSON.stringify({ tasks: [{ id: "task-1" }] }),
      },
    });
    await expectConnectionClosed();
  });

  it("does not read the space again once today's backup exists", async () => {
    await seed({ "2026-11-07": { backedAt: 1, data: "morning" } });

    await backUp();

    expect(readSpace).not.toHaveBeenCalled();
    expect(await readBackups()).toEqual({
      "2026-11-07": { backedAt: 1, data: "morning" },
    });
    await expectConnectionClosed();
  });

  it.each([
    {
      failure: "the backup store is missing",
      prepare: async () => (await openBackups({ withStore: false })).close(),
    },
    {
      failure: "reading the space fails",
      prepare: async () => {
        readSpace.mockRejectedValue(new Error("space unavailable"));
      },
    },
  ])("logs and closes the connection when $failure", async ({ prepare }) => {
    await prepare();

    await backUp();

    expect(logger.errors()).toEqual([
      {
        level: "Error",
        message: ["Auto-backup failed"],
        failure: expect.any(Error),
      },
    ]);
    await expectConnectionClosed();
  });

  it("backs up after five idle minutes, then waits for activity to arm again", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"], now });
    const page = makeTestPage();
    let backups = 0;
    let markBackedUp = () => {};
    readSpace.mockImplementation(async () => {
      backups += 1;
      markBackedUp();
      return { tasks: [] };
    });
    const scope = Scope.makeUnsafe();
    Effect.runSync(
      makeAutoBackup("space-1", readBackup).pipe(
        Scope.provide(scope),
        Effect.provide(Layer.mergeAll(layer(), page.layer)),
      ),
    );

    await vi.advanceTimersByTimeAsync(4 * 60_000);
    page.dispatch("document", "keydown");
    await vi.advanceTimersByTimeAsync(4 * 60_000);
    expect(backups).toBe(0);

    const backedUp = new Promise<void>((resolve) => (markBackedUp = resolve));
    await vi.advanceTimersByTimeAsync(60_000);
    await backedUp;
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(backups).toBe(1);

    await Effect.runPromise(Scope.close(scope, Exit.void));
    expect(page.listeners()).toBe(0);
  });

  it("reads the space afresh for every backup", async () => {
    const db = new SubscribableDB(
      new DB(new BptreeInmemDriver(), {
        traits: [dbIdTrait("space", "a0000000-0000-4000-8000-000000000001")],
      }),
    );
    execSync(db.loadTables(spaceDBConfig("space-1").persistDBTables));
    const database = Database.make(db);
    await Effect.runPromise(database.dispatch(createInboxIfNotExists({})));
    const read = readSpaceBackup.pipe(
      Effect.provideService(Database, database),
    );

    const first = await Effect.runPromise(read);
    const second = await Effect.runPromise(read);

    expect(first.projects).toHaveLength(1);
    expect(second).toEqual(first);
  });
});
