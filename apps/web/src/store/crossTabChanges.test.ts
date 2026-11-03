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
  it("broadcasts and wakes sync only after local changes are durable", async () => {
    vi.stubGlobal("window", { addEventListener: vi.fn() });
    vi.stubGlobal("document", {
      addEventListener: vi.fn(),
      visibilityState: "visible",
    });
    const primary = new DB(new BptreeInmemDriver());
    const runtime = new PreloadedHybridDB(primary);
    const db = new SubscribableDB(runtime);
    await execAsync(db.loadTables([crossTabItemsTable, changesTable]));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const begin = primary.beginTx.bind(primary);
    vi.spyOn(primary, "beginTx").mockImplementation(function* (mode) {
      const tx = yield* begin(mode);
      const commit = tx.commit.bind(tx);
      tx.commit = function* () {
        yield { type: "unwrap", data: gate };
        yield* commit();
      };
      return tx;
    });
    const postChanges = vi.fn();
    const onPersisted = vi.fn();
    const queue = createLocalPersistQueue({
      syncSubDb: db,
      postChanges,
      onPersisted,
    });
    queue.start();
    const clock = createHlcClock("sender")();
    const row = { id: "local", title: "Visible before persistence" };
    const change: Change = {
      id: `${crossTabItemsTable.tableName}:${row.id}`,
      entityId: row.id,
      tableName: crossTabItemsTable.tableName,
      createdAt: clock,
      updatedAt: clock,
      deletedAt: null,
      clientId: "sender",
      changes: { id: clock, title: clock },
    };
    await asyncDispatch(
      db,
      action({
        name: "writePendingCrossTabChange",
        args: {},
        handler: function* () {
          yield* upsert(crossTabItemsTable, [row]);
          yield* upsert(changesTable, [change]);
        },
      })({}),
    );
    try {
      expect(
        (
          await selectAsync(db, {
            selector: crossTabState,
            args: { id: row.id },
          })
        ).row,
      ).toEqual(row);
      expect(postChanges).not.toHaveBeenCalled();
      expect(onPersisted).not.toHaveBeenCalled();
    } finally {
      release();
      await execAsync(runtime.waitForPersistence());
    }
    await queue.drain();
    expect(postChanges).toHaveBeenCalledExactlyOnceWith({
      changeset: [
        { tableName: crossTabItemsTable.tableName, data: [{ row, change }] },
      ],
    });
    expect(onPersisted).toHaveBeenCalledOnce();
  });

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
    const publications: Op[][] = [];
    const onApplied = vi.fn(() => {
      expect(publications).not.toHaveLength(0);
    });
    const crossTabChanges = createCrossTabChanges({
      clientId: "receiver",
      syncSubDb: receiverDB,
      syncConfig,
      nextClock,
      onApplied,
    });
    const postChanges = vi.spyOn(crossTabChanges, "postChanges");
    createLocalPersistQueue({
      syncSubDb: receiverDB,
      postChanges: crossTabChanges.postChanges,
      onPersisted: vi.fn(),
    }).start();

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
    expect(onApplied).toHaveBeenCalledOnce();
  });
});
