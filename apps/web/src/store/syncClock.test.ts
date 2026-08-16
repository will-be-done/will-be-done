import { describe, expect, it } from "vitest";
import {
  createAction,
  createSelector,
  DB,
  defineTable,
  execSync,
  selectFrom,
  selectSync,
  SubscribableDB,
  syncDispatch,
  upsert,
  v,
} from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import {
  changesTable,
  compareHlc,
  createHlcClock,
  formatHlc,
  syncStateId,
  syncStateTable,
} from "@will-be-done/slices/common";
import { observePersistedClock } from "./syncClock";
import { registerSyncChangeHooks } from "./syncChangeHooks";

const itemsTable = defineTable("persisted_clock_test_items", {
  id: v.string(),
  title: v.string(),
});
const action = createAction();
const selector = createSelector();
const olderChangeClock = formatHlc({
  physical: 1_700_000_000_000,
  logical: 1,
  actorId: "older",
});
const newerStateClock = formatHlc({
  physical: 9_000_000_000_000,
  logical: 7,
  actorId: "server",
});

const seedPersistedClocks = action({
  name: "seedPersistedClocks",
  args: {},
  handler: function* () {
    yield* upsert(changesTable, [
      {
        id: `${itemsTable.tableName}:older`,
        entityId: "older",
        tableName: itemsTable.tableName,
        createdAt: olderChangeClock,
        updatedAt: olderChangeClock,
        deletedAt: null,
        clientId: "older",
        changes: { id: olderChangeClock, title: olderChangeClock },
      },
    ]);
    yield* upsert(syncStateTable, [
      {
        id: syncStateId,
        lastSentClock: "",
        lastServerAppliedClock: newerStateClock,
        syncV4ClocksMigrated: true,
      },
    ]);
  },
});

const changeById = selector({
  name: "persistedClockTestChangeById",
  args: { id: v.string() },
  handler: function* ({ id }) {
    return yield* selectFrom(changesTable, "byId")
      .where((q) => q.eq("id", id))
      .first();
  },
});

describe("persisted startup clock", () => {
  it("makes the first local write observe a newer sync-state clock", async () => {
    const db = new SubscribableDB(new DB(new BptreeInmemDriver()));
    execSync(db.loadTables([itemsTable, changesTable, syncStateTable]));
    syncDispatch(db, seedPersistedClocks({}));

    const clock = createHlcClock("writer");
    await observePersistedClock(db, clock);
    registerSyncChangeHooks({
      syncSubDb: db,
      syncableDBTables: [itemsTable],
      clientId: "client",
      nextClock: clock,
    });

    syncDispatch(
      db,
      action({
        name: "writeFirstPersistedClockTestItem",
        args: {},
        handler: function* () {
          yield* upsert(itemsTable, [{ id: "first", title: "First" }]);
        },
      })({}),
    );

    const change = selectSync(db, {
      selector: changeById,
      args: { id: `${itemsTable.tableName}:first` },
    });
    expect(change).toBeDefined();
    expect(compareHlc(change!.createdAt, newerStateClock)).toBeGreaterThan(0);
  });
});
