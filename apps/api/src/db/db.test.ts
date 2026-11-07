import { describe, expect, spyOn, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as env from "../env";
import {
  createAction,
  createSelector,
  DB,
  execSync,
  selectFrom,
  SubscribableDB,
  syncDispatch,
  upsert,
} from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import {
  changesTable,
  formatHlc,
  migrateSyncV4Clocks,
  syncStateTable,
} from "@will-be-done/slices/common";
import { initializeServerSyncFeed } from "../sync/actions";
import {
  SERVER_SYNC_STATE_ID,
  serverSyncStateTable,
  serverSyncTables,
} from "../sync/tables";
import { createDatabaseRegistry, installServerChangeFeedHook } from "./db";
import { spaceDBConfig, userDBConfig } from "./configs";

const action = createAction();
const selector = createSelector();
const legacyClock = "1700000000000-2-client";

const registryFixture = () => {
  const directory = mkdtempSync(join(tmpdir(), "wbd-registry-"));
  const config = spyOn(env, "getEnvConfig").mockReturnValue({
    ...env.getEnvConfig(),
    WBD_DB_ENGINE: "sqlite",
    WBD_DB_PATH: directory,
  });
  const registry = createDatabaseRegistry(async () => {});
  return {
    registry,
    async cleanup() {
      await registry.close();
      config.mockRestore();
      rmSync(directory, { recursive: true, force: true });
    },
  };
};

describe("database registry lifecycle", () => {
  test.each(["main", "user"] as const)(
    "closes a failed %s open before retrying",
    async (kind) => {
      const { registry, cleanup } = registryFixture();
      const close = spyOn(Database.prototype, "close");
      const failure = new Error("table loading failed");
      const load = spyOn(DB.prototype, "loadTables").mockImplementation(() => {
        throw failure;
      });
      const open = () =>
        kind === "main"
          ? registry.main()
          : registry.open(userDBConfig("user-id"));
      try {
        expect(open()).rejects.toBe(failure);
        expect(close).toHaveBeenCalledTimes(1);
        load.mockRestore();
        await open();
        await registry.close();
        expect(close).toHaveBeenCalledTimes(2);
      } finally {
        load.mockRestore();
        await cleanup();
        close.mockRestore();
      }
    },
  );

  test.each(["main", "user"] as const)(
    "closes an in-flight %s open without repopulating a closed registry",
    async (kind) => {
      const { registry, cleanup } = registryFixture();
      const close = spyOn(Database.prototype, "close");
      const started = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const loadTables = DB.prototype.loadTables;
      const load = spyOn(DB.prototype, "loadTables").mockImplementation(
        function* (this: DB, tables) {
          started.resolve();
          yield { type: "unwrap", data: release.promise };
          yield* loadTables.call(this, tables);
        },
      );
      const opening =
        kind === "main"
          ? registry.main()
          : registry.open(userDBConfig("user-id"));
      const result = opening.then(
        () => undefined,
        (error: unknown) => error,
      );
      await started.promise;
      const stopping = registry.close();
      try {
        release.resolve();
        expect(await result).toMatchObject({ message: "Databases are closed" });
        await stopping;
        expect(close).toHaveBeenCalledTimes(1);
        expect(registry.loaded()).toEqual([]);
        expect(registry.main()).rejects.toThrow("Databases are closed");
        expect(registry.open(userDBConfig("other"))).rejects.toThrow(
          "Databases are closed",
        );
      } finally {
        release.resolve();
        await Promise.allSettled([opening, stopping]);
        load.mockRestore();
        await cleanup();
        close.mockRestore();
      }
    },
  );

  test("logs close failures and still closes the remaining connections", async () => {
    const { registry, cleanup } = registryFixture();
    const failure = new Error("close failed");
    const closeDatabase = Database.prototype.close;
    const close = spyOn(Database.prototype, "close");
    const log = spyOn(console, "error").mockImplementation(() => {});
    try {
      await registry.main();
      await registry.open(userDBConfig("user-id"));
      close.mockImplementationOnce(function (this: Database) {
        closeDatabase.call(this);
        throw failure;
      });
      await registry.close();
      expect(close).toHaveBeenCalledTimes(2);
      expect(log).toHaveBeenCalledWith("Failed to close database", failure);
    } finally {
      await cleanup();
      close.mockRestore();
      log.mockRestore();
    }
  });
});

const seedLegacyChange = action({
  name: "seedLegacyServerStartupChange",
  args: {},
  handler: function* () {
    yield* upsert(changesTable, [
      {
        id: "items:item-1",
        entityId: "item-1",
        tableName: "items",
        createdAt: legacyClock,
        updatedAt: legacyClock,
        deletedAt: null,
        clientId: "client",
        changes: { id: legacyClock, title: legacyClock },
      },
    ]);
  },
});

const readServerRevision = selector({
  name: "readServerStartupRevision",
  args: {},
  handler: function* () {
    return (
      yield* selectFrom(serverSyncStateTable, "byId")
        .where((q) => q.eq("id", SERVER_SYNC_STATE_ID))
        .first()
    )?.currentRevision;
  },
});

describe("server database startup", () => {
  test("does not record skip-sync clock migration writes in the server feed", () => {
    const db = new SubscribableDB(new DB(new BptreeInmemDriver()));
    execSync(
      db.loadTables([changesTable, syncStateTable, ...serverSyncTables]),
    );
    syncDispatch(db, seedLegacyChange({}));
    expect(syncDispatch(db, initializeServerSyncFeed({}))).toBe(1);
    syncDispatch(
      db.withTraits({ type: "skip-sync" }),
      migrateSyncV4Clocks({}),
    );
    expect(syncDispatch(db, readServerRevision({}))).toBe(1);

    installServerChangeFeedHook(db);

    const normalClock = formatHlc({
      physical: 1_700_000_000_000,
      logical: 3,
      actorId: "client",
    });
    syncDispatch(
      db,
      action({
        name: "updateNormalServerStartupChange",
        args: {},
        handler: function* () {
          yield* upsert(changesTable, [
            {
              id: "items:item-1",
              entityId: "item-1",
              tableName: "items",
              createdAt: normalClock,
              updatedAt: normalClock,
              deletedAt: null,
              clientId: "client",
              changes: { id: normalClock, title: normalClock },
            },
          ]);
        },
      })({}),
    );
    expect(syncDispatch(db, readServerRevision({}))).toBe(2);
  });
});

describe("server sync table order", () => {
  test.each([
    ["space", spaceDBConfig("space-id")],
    ["user", userDBConfig("user-id")],
  ])("lists every %s syncable table so uploads are committed", (_, config) => {
    expect([...config.syncTableNamesInDependencyOrder].sort()).toEqual(
      Object.keys(config.tableNameMap).sort(),
    );
  });
});
