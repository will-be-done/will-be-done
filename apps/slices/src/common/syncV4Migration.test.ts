import { describe, expect, it } from "vitest";
import {
  DB,
  execSync,
  selectFrom,
  syncDispatch,
  upsert,
} from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
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

    expect(syncDispatch(db, migrateSyncV4Clocks({}))).toBeNull();
  });
});
