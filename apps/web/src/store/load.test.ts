import { DB, SubscribableDB } from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import { createHlcClock } from "@will-be-done/slices/common";
import { describe, expect, it, vi } from "vitest";
import { State } from "@/utils/State";
import { initDbStore } from "./load";
import type { SyncConfig } from "./syncTypes";

const started = vi.hoisted(() => ({
  syncers: [] as { close: () => Promise<void> }[],
  closers: [] as { name: string; close: () => void }[],
}));

vi.mock("./configs.ts", () => ({ spaceDbType: "space" }));
vi.mock("./persistentDriver", () => ({
  getPersistentDriverKind: () => "indexeddb",
  resolvePersistentDriverKind: async () => "indexeddb",
}));
vi.mock("./syncClock", () => ({
  getDbName: ({ dbType, dbId }: SyncConfig) => `${dbType}-${dbId}`,
  getClientId: () => "client-1",
  initClock: () => createHlcClock("client-1"),
  observePersistedClock: async () => {},
}));
vi.mock("./storeDbs", () => ({
  createStoreDbs: async () => ({
    syncSubDb: new SubscribableDB(new DB(new BptreeInmemDriver())),
  }),
}));
vi.mock("./syncChangeHooks", () => ({ registerSyncChangeHooks: () => {} }));
vi.mock("./syncer", () => ({
  Syncer: class {
    status = new State({});
    close = vi.fn(async () => {});
    startLoop = vi.fn();
    forceSync = vi.fn();
    constructor() {
      started.syncers.push(this);
    }
  },
}));
vi.mock("./crossTabChanges", () => ({
  createCrossTabChanges: () => {
    const crossTab = { name: "crossTab", postChanges: vi.fn(), close: vi.fn() };
    started.closers.push(crossTab);
    return crossTab;
  },
}));
vi.mock("./localPersistQueue", () => ({
  createLocalPersistQueue: () => {
    const queue = { name: "queue", start: vi.fn(), stop: vi.fn() };
    started.closers.push({ name: queue.name, close: queue.stop });
    return queue;
  },
}));
vi.mock("./autoBackup.ts", () => ({
  AutoBackuper: class {
    start = vi.fn();
    stop = vi.fn();
    constructor() {
      started.closers.push({ name: "backup", close: this.stop });
    }
  },
}));

describe("store startup", () => {
  it("tears down a failed startup so a retry runs a single sync loop", async () => {
    const afterInit = vi
      .fn<SyncConfig["afterInit"]>()
      .mockRejectedValueOnce(new Error("preload failed"))
      .mockResolvedValue(undefined);
    const config: SyncConfig = {
      dbId: "user-1",
      dbType: "user",
      persistDBTables: [],
      syncableDBTables: [],
      tableNameMap: {},
      afterInit,
    };

    await expect(initDbStore(config)).rejects.toThrow("preload failed");
    expect(started.syncers).toHaveLength(1);
    expect(started.syncers[0].close).toHaveBeenCalledOnce();
    expect(started.closers.map(({ name }) => name)).toEqual([
      "crossTab",
      "queue",
      "backup",
    ]);
    for (const { close } of started.closers) {
      expect(close).toHaveBeenCalledOnce();
    }

    const db = await initDbStore(config);
    expect(started.syncers).toHaveLength(2);
    expect(started.syncers[1].close).not.toHaveBeenCalled();
    expect(await initDbStore(config)).toBe(db);
    expect(started.syncers).toHaveLength(2);
  });
});
