import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  DB,
  defineTable,
  execSync,
  selectFrom,
  syncDispatch,
  upsert,
  v,
} from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import { SqlDriver } from "@will-be-done/hyperdb/drivers/sqlite";
import { action, selector } from "../builders";
import { migrateSyncV4Clocks } from "./syncV4Migration";
import { syncStateId, syncStateTable, changesTable } from "./tables";

const seedState = action({
  name: "seedSyncV4MigrationState",
  args: {},
  handler: function* () {
    yield* upsert(syncStateTable, [
      {
        id: syncStateId,
        lastSentClock: "1700000000000-2-client",
        lastServerAppliedClock: "1700000000000-9-server",
        serverConfirmedClientClock: "1700000000000-7-client",
        localCoveredClientClock: "1700000000000-8-client",
      },
    ]);
  },
});

const readState = selector({
  name: "readSyncV4MigrationState",
  args: {},
  handler: function* () {
    return yield* selectFrom(syncStateTable, "byId")
      .where((q) => q.eq("id", syncStateId))
      .first();
  },
});

const legacyChangesTable = defineTable("changes", {
  id: v.string(),
  entityId: v.string(),
  tableName: v.string(),
  createdAt: v.string(),
  updatedAt: v.string(),
  deletedAt: v.union(v.string(), v.null()),
  clientId: v.string(),
  changes: v.record(v.string(), v.string()),
}).index("byUpdatedAt", ["updatedAt"]);

const legacySyncStateTable = defineTable("syncState", {
  id: v.string(),
  lastSentClock: v.string(),
  lastServerAppliedClock: v.string(),
});

const seedLegacyPersistentState = action({
  name: "seedLegacyPersistentSyncV4MigrationState",
  args: {},
  handler: function* () {
    const sharedClock = "1700000000000-2-client";
    yield* upsert(
      legacyChangesTable,
      ["change-a", "change-b", "change-c"].map((id) => ({
        id,
        entityId: id,
        tableName: "items",
        createdAt: sharedClock,
        updatedAt: sharedClock,
        deletedAt: null,
        clientId: "client",
        changes: { id: sharedClock },
      })),
    );
    yield* upsert(legacySyncStateTable, [
      {
        id: syncStateId,
        lastSentClock: sharedClock,
        lastServerAppliedClock: "1700000000000-9-server",
      },
    ]);
  },
});

const readAllChanges = selector({
  name: "readAllSyncV4MigrationChanges",
  args: {},
  handler: function* () {
    return yield* selectFrom(changesTable, "byUpdatedAtId").order("asc");
  },
});

const openPersistentDb = (path: string) => {
  const sqlite = new DatabaseSync(path);
  type SqlValue = number | string | Uint8Array | null;
  const driver = new SqlDriver({
    exec(sql: string, params?: SqlValue[] | null) {
      if (params == null) {
        sqlite.exec(sql);
      } else {
        sqlite.prepare(sql).run(...params);
      }
    },
    prepare(sql: string) {
      const statement = sqlite.prepare(sql);
      statement.setReturnArrays(true);
      return {
        values(values: SqlValue[]) {
          return statement.all(...values) as unknown as SqlValue[][];
        },
        finalize() {},
      };
    },
  });
  return { db: new DB(driver), close: () => sqlite.close() };
};

describe("sync v4 clock migration", () => {
  it("seeds the clock from persisted sync state when no changes remain", () => {
    const db = new DB(new BptreeInmemDriver());
    execSync(db.loadTables([changesTable, syncStateTable]));
    syncDispatch(db, seedState({}));

    expect(syncDispatch(db, migrateSyncV4Clocks({}))).toBe(
      "0001700000000000-00000009-server",
    );
    expect(
      syncDispatch(
        db,
        (function* () {
          return yield* readState({});
        })(),
      ),
    ).toMatchObject({
      lastServerAppliedClock: "0001700000000000-00000009-server",
      syncV4ClocksMigrated: true,
    });

    expect(syncDispatch(db, migrateSyncV4Clocks({}))).toBe(
      "0001700000000000-00000009-server",
    );
  });

  it("upgrades the persistent pre-v4 indexes without hiding equal-clock rows", () => {
    const directory = mkdtempSync(join(tmpdir(), "sync-v4-migration-"));
    const path = join(directory, "legacy.sqlite");

    try {
      const legacy = openPersistentDb(path);
      execSync(
        legacy.db.loadTables([legacyChangesTable, legacySyncStateTable]),
      );
      syncDispatch(legacy.db, seedLegacyPersistentState({}));
      legacy.close();

      const current = openPersistentDb(path);
      try {
        execSync(current.db.loadTables([changesTable, syncStateTable]));
        expect(syncDispatch(current.db, readState({}))).toMatchObject({
          id: syncStateId,
          lastServerAppliedClock: "1700000000000-9-server",
        });

        syncDispatch(current.db, migrateSyncV4Clocks({}));

        const changes = syncDispatch(current.db, readAllChanges({}));
        expect(changes.map((change) => change.id)).toEqual([
          "change-a",
          "change-b",
          "change-c",
        ]);
        expect(new Set(changes.map((change) => change.updatedAt))).toEqual(
          new Set(["0001700000000000-00000002-client"]),
        );
        expect(syncDispatch(current.db, readState({}))).toMatchObject({
          id: syncStateId,
          lastServerAppliedClock: "0001700000000000-00000009-server",
          syncV4ClocksMigrated: true,
        });
      } finally {
        current.close();
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
