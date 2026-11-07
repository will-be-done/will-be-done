import {
  asyncDispatch,
  createAction,
  createSelector,
  DB,
  defineTable,
  execAsync,
  HybridDB,
  type Op,
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
import { Effect, Exit, Layer, Scope } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PageEvents, TabChannels } from "@/services/browser";
import { makeTestLogger, makeTestPage, makeTestTabs } from "@/services/testing";
import { makeCrossTabChanges } from "./crossTabChanges";
import { Database } from "./database";
import { makeLocalPersistQueue } from "./localPersistQueue";
import { registerSyncChangeHooks } from "./syncChangeHooks";
import type { SyncConfig } from "./syncTypes";
import { waitForPromise } from "./hyperdbTesting";

const scopes: Scope.Closeable[] = [];
const inScope = <A>(
  db: SubscribableDB,
  effect: Effect.Effect<
    A,
    never,
    TabChannels | PageEvents | Database | Scope.Scope
  >,
) => {
  const scope = Scope.makeUnsafe();
  scopes.push(scope);
  return Effect.runSync(
    effect.pipe(
      Scope.provide(scope),
      Effect.provide(
        Layer.mergeAll(
          makeTestTabs().layer,
          makeTestPage().layer,
          makeTestLogger().layer,
          Database.layer(db),
        ),
      ),
    ),
  );
};

const crossTabItemsTable = defineTable("cross_tab_test_items", {
  id: v.string(),
  title: v.string(),
}).index("byIds", ["id"]);
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

afterEach(async () => {
  for (const scope of scopes.splice(0)) {
    await Effect.runPromise(Scope.close(scope, Exit.void));
  }
});

describe("cross-tab changes", () => {
  it("broadcasts and wakes sync only after local changes are durable", async () => {
    const primaryDriver = new BptreeInmemDriver();
    const runtime = new HybridDB(
      new DB(primaryDriver),
      new DB(new BptreeInmemDriver()),
    );
    const db = new SubscribableDB(runtime);
    await execAsync(db.loadTables([crossTabItemsTable, changesTable]));
    await execAsync(
      db.preloadTables([
        { table: crossTabItemsTable, scanIndex: "byIds" },
        { table: changesTable, scanIndex: "byUpdatedAtId" },
      ]),
    );
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const begin = primaryDriver.beginTx.bind(primaryDriver);
    vi.spyOn(primaryDriver, "beginTx").mockImplementation(function* () {
      const tx = yield* begin();
      const commit = tx.commit.bind(tx);
      tx.commit = function* () {
        yield* waitForPromise(gate);
        yield* commit();
      };
      return tx;
    });
    const postChanges = vi.fn();
    const onPersisted = vi.fn();
    const queue = inScope(
      db,
      makeLocalPersistQueue({ postChanges, onPersisted }),
    );
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
    await Effect.runPromise(queue.drain);
    expect(postChanges).toHaveBeenCalledExactlyOnceWith({
      changeset: [
        { tableName: crossTabItemsTable.tableName, data: [{ row, change }] },
      ],
    });
    expect(onPersisted).toHaveBeenCalledOnce();
  });

  // The web runtime keeps changes resident and loads mindmap tables on demand.
  it.each([{ itemsResidency: "preloaded" }, { itemsResidency: "on demand" }])(
    "publishes an externally persisted $itemsResidency row without creating a local echo",
    async ({ itemsResidency }) => {
      const driver = new BptreeInmemDriver();
      const senderDB = new DB(driver);
      const receiverPersistentDB = new DB(driver);
      await execAsync(senderDB.loadTables([crossTabItemsTable, changesTable]));
      await execAsync(
        receiverPersistentDB.loadTables([crossTabItemsTable, changesTable]),
      );

      const receiverDB = new SubscribableDB(
        new HybridDB(receiverPersistentDB, new DB(new BptreeInmemDriver())),
      );
      await execAsync(
        receiverDB.loadTables([crossTabItemsTable, changesTable]),
      );
      await execAsync(
        receiverDB.preloadTables([
          { table: changesTable, scanIndex: "byUpdatedAtId" },
          ...(itemsResidency === "preloaded"
            ? [{ table: crossTabItemsTable, scanIndex: "byIds" } as const]
            : []),
        ]),
      );

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
        afterInit: Effect.void,
      } satisfies SyncConfig;
      const publications: (readonly Op[])[] = [];
      const onApplied = vi.fn(() => {
        expect(publications).not.toHaveLength(0);
      });
      const crossTabChanges = inScope(
        receiverDB,
        makeCrossTabChanges({
          clientId: "receiver",
          syncConfig,
          nextClock,
          onApplied,
        }),
      );
      const postChanges = vi.spyOn(crossTabChanges, "postChanges");
      inScope(
        receiverDB,
        makeLocalPersistQueue({
          postChanges: crossTabChanges.postChanges,
          onPersisted: vi.fn(),
        }),
      );

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

      await Effect.runPromise(crossTabChanges.applyChanges({ changeset }));

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
    },
  );
});
