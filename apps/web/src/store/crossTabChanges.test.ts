import {
  asyncDispatch,
  createAction,
  createSelector,
  DB,
  defineTable,
  execAsync,
  type Op,
  PreloadedHybridDB,
  selectAsync,
  selectFrom,
  SubscribableDB,
  upsert,
  v,
} from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import {
  changesTable,
  createHlcClock,
  formatHlc,
  type Change,
  type ChangesetArrayType,
} from "@will-be-done/slices/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCrossTabChanges } from "./crossTabChanges";
import { createLocalPersistQueue } from "./localPersistQueue";
import { registerSyncChangeHooks } from "./syncChangeHooks";
import type { SyncConfig } from "./syncTypes";

vi.mock("broadcast-channel", () => ({
  BroadcastChannel: class {
    onmessage: ((data: unknown) => void) | null = null;

    postMessage() {
      return Promise.resolve();
    }
  },
}));

const crossTabItemsTable = defineTable("cross_tab_test_items", {
  id: v.string(),
  title: v.string(),
});
const action = createAction();
const selector = createSelector();
const crossTabState = selector({
  name: "crossTabTestState",
  args: { id: v.string() },
  handler: function* ({ id }) {
    const row = yield* selectFrom(crossTabItemsTable, "byId")
      .where((q) => q.eq("id", id))
      .first();
    const changes = yield* selectFrom(changesTable, "byUpdatedAtId");
    return { row, changes };
  },
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("cross-tab changes", () => {
  it("publishes an externally persisted row without creating a local echo", async () => {
    vi.stubGlobal("window", { addEventListener: vi.fn() });
    vi.stubGlobal("document", {
      addEventListener: vi.fn(),
      visibilityState: "visible",
    });

    const driver = new BptreeInmemDriver();
    const senderDB = new DB(driver);
    const receiverPersistentDB = new DB(driver);
    await execAsync(senderDB.loadTables([crossTabItemsTable, changesTable]));
    await execAsync(
      receiverPersistentDB.loadTables([crossTabItemsTable, changesTable]),
    );

    const receiverDB = new SubscribableDB(
      new PreloadedHybridDB(receiverPersistentDB),
    );
    await execAsync(receiverDB.loadTables([crossTabItemsTable, changesTable]));

    const nextClock = createHlcClock("receiver", undefined, {
      wallTime: () => 1_700_000_000_100,
      monotonicTime: () => 0,
    });
    registerSyncChangeHooks({
      syncSubDb: receiverDB,
      syncableDBTables: [crossTabItemsTable],
      clientId: "receiver",
      nextClock,
    });

    const syncConfig = {
      dbId: "cross-tab-test",
      dbType: "user",
      persistDBTables: [crossTabItemsTable, changesTable],
      syncableDBTables: [crossTabItemsTable],
      tableNameMap: { [crossTabItemsTable.tableName]: crossTabItemsTable },
      afterInit: () => {},
    } satisfies SyncConfig;
    const crossTabChanges = createCrossTabChanges({
      clientId: "receiver",
      syncSubDb: receiverDB,
      syncConfig,
      nextClock,
    });
    const postChanges = vi.spyOn(crossTabChanges, "postChanges");
    createLocalPersistQueue({
      syncSubDb: receiverDB,
      postChanges: crossTabChanges.postChanges,
      onPersisted: vi.fn(),
    }).start();

    const publications: Op[][] = [];
    receiverDB.subscribe((ops) => publications.push(ops));

    const incomingClock = formatHlc({
      physical: 1_700_000_000_000,
      logical: 1,
      actorId: "sender",
    });
    const row = { id: "shared", title: "From sender" };
    const change: Change = {
      id: `${crossTabItemsTable.tableName}:${row.id}`,
      entityId: row.id,
      tableName: crossTabItemsTable.tableName,
      createdAt: incomingClock,
      updatedAt: incomingClock,
      deletedAt: null,
      clientId: "sender",
      changes: { id: incomingClock, title: incomingClock },
    };
    const changeset = [
      {
        tableName: crossTabItemsTable.tableName,
        data: [{ row, change }],
      },
    ] satisfies ChangesetArrayType;

    await asyncDispatch(
      senderDB,
      action({
        name: "persistCrossTabTestChange",
        args: {},
        handler: function* () {
          yield* upsert(crossTabItemsTable, [row]);
          yield* upsert(changesTable, [change]);
        },
      })({}),
    );

    await crossTabChanges.applyChanges({ changeset });

    const state = await selectAsync(receiverDB, {
      selector: crossTabState,
      args: { id: row.id },
    });
    expect(state.row).toEqual(row);
    expect(state.changes).toEqual([
      expect.objectContaining({
        ...change,
        updatedAt: expect.any(String),
      }),
    ]);
    expect(
      publications
        .flat()
        .some(
          (op) =>
            op.table === crossTabItemsTable &&
            "newValue" in op &&
            op.newValue.id === row.id,
        ),
    ).toBe(true);
    expect(postChanges).not.toHaveBeenCalled();
  });
});
