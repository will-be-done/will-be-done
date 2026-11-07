import { DB, execSync, SubscribableDB } from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import { changesTable, syncStateTable } from "@will-be-done/slices/common";
import { Effect, Layer } from "effect";
import { Digest } from "effect/crypto";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { BackupDatabase } from "@/services/browser";
import {
  makeTestLogger,
  makeTestPage,
  makeTestServerChanges,
  makeTestTabs,
  testAuthSession,
  testHttpClient,
} from "@/services/testing";
import { makeStoreRegistry, StoreStorage } from "./storeRegistry";
import { clientSyncV4Tables } from "./syncV4Tables";
import type { SyncConfig } from "./syncTypes";

const setup = () => {
  const tabs = makeTestTabs();
  const page = makeTestPage();
  const opened: string[] = [];
  const storage = Layer.succeed(StoreStorage, {
    driverKind: () => Effect.succeed("indexeddb"),
    clientId: () => "client-1",
    open: (dbName, syncConfig) =>
      Effect.sync(() => {
        opened.push(dbName);
        const db = new SubscribableDB(new DB(new BptreeInmemDriver()));
        execSync(db.loadTables(syncConfig.persistDBTables));
        return db;
      }),
  });
  const registry = makeStoreRegistry(
    Layer.mergeAll(
      storage,
      tabs.layer,
      page.layer,
      makeTestServerChanges().layer,
      makeTestLogger().layer,
      testAuthSession(),
      // The sync loop may start; its requests never answer.
      testHttpClient(() => () => new Promise<Response>(() => {})),
      Layer.succeed(BackupDatabase, new IDBFactory()),
      Digest.layerWebCrypto,
    ),
  );
  return { registry, tabs, page, opened };
};

const userConfig = (
  dbId: string,
  afterInit: SyncConfig["afterInit"] = Effect.void,
): SyncConfig => ({
  dbId,
  dbType: "user",
  persistDBTables: [changesTable, syncStateTable, ...clientSyncV4Tables],
  syncableDBTables: [],
  tableNameMap: {},
  afterInit,
});

describe("store registry", () => {
  it("tears down a failed startup so a retry runs a single sync loop", async () => {
    const { registry, tabs, page } = setup();
    let attempts = 0;
    const config = userConfig(
      "user-1",
      Effect.suspend(() =>
        attempts++ === 0
          ? Effect.die(new Error("preload failed"))
          : Effect.void,
      ),
    );

    await expect(registry.init(config)).rejects.toThrow("preload failed");
    // The syncer, cross-tab channel, persist queue, and backup all released.
    expect(tabs.openChannels()).toBe(0);
    expect(page.listeners()).toBe(0);

    const db = await registry.init(config);
    const channels = tabs.openChannels();
    expect(channels).toBeGreaterThan(0);
    expect(await registry.init(config)).toBe(db);
    expect(tabs.openChannels()).toBe(channels);
  });

  it("starts one store for concurrent calls with the same config", async () => {
    const { registry, opened } = setup();
    const config = userConfig("user-2");

    const [first, second] = await Promise.all([
      registry.init(config),
      registry.init(config),
    ]);

    expect(second).toBe(first);
    expect(opened).toEqual(["user-user-2"]);
  });
});
