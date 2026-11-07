import { Effect } from "effect";
import { IDBFactory } from "fake-indexeddb";
import type { SubscribableDB } from "@will-be-done/hyperdb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backUpToday } from "./autoBackup";

const space = vi.hoisted(() => ({ dispatch: vi.fn() }));

vi.mock("@will-be-done/hyperdb", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@will-be-done/hyperdb")>()),
  asyncDispatch: space.dispatch,
}));
vi.mock("@will-be-done/slices/space", () => ({
  getSpaceBackup: () => "getSpaceBackup",
}));

const backupDBName = "auto-backups-space-1";
const now = new Date(2026, 10, 7, 12);
const spaceDB = {} as SubscribableDB;

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
  vi.stubGlobal("indexedDB", new IDBFactory());
  space.dispatch.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("auto-backup", () => {
  it("saves today's backup and prunes backups past the retention window", async () => {
    space.dispatch.mockResolvedValue({ tasks: [{ id: "task-1" }] });
    await seed({
      "2026-10-30": { backedAt: 1, data: "expired" },
      "2026-10-31": { backedAt: 2, data: "oldest kept" },
      "2026-11-06": { backedAt: 3, data: "yesterday" },
    });
    vi.spyOn(console, "log").mockImplementation(() => {});

    await Effect.runPromise(backUpToday("space-1", spaceDB));

    expect(space.dispatch).toHaveBeenCalledWith(spaceDB, "getSpaceBackup");
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

    await Effect.runPromise(backUpToday("space-1", spaceDB));

    expect(space.dispatch).not.toHaveBeenCalled();
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
        space.dispatch.mockRejectedValue(new Error("space unavailable"));
      },
    },
  ])("logs and closes the connection when $failure", async ({ prepare }) => {
    await prepare();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await Effect.runPromise(backUpToday("space-1", spaceDB));

    expect(logged).toHaveBeenCalledWith(
      "Auto-backup failed:",
      expect.any(Error),
    );
    await expectConnectionClosed();
  });
});
