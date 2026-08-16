import { describe, expect, test } from "bun:test";
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
import { installServerChangeFeedHook } from "./db";

const action = createAction();
const selector = createSelector();
const legacyClock = "1700000000000-2-client";

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
