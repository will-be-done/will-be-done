import { describe, expect, it, vi } from "vitest";
import {
  createAction,
  asyncDispatch,
  createSelector,
  DB,
  defineTable,
  execSync,
  execAsync,
  PreloadedHybridDB,
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
import {
  dailyEntriesTable,
  dailyListsTable,
  installProjectTaskStatsHooks,
  projectSectionTaskStatsTable,
  scheduledTodoTasksTable,
  tasksTable,
  toggleTaskState,
  type Task,
} from "@will-be-done/slices/space";
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
  it("completes and reopens cached tasks with their stats and sync changes before returning", async () => {
    const runtime = new PreloadedHybridDB(new DB(new BptreeInmemDriver()));
    const db = new SubscribableDB(runtime);
    await execAsync(
      db.loadTables([
        tasksTable,
        projectSectionTaskStatsTable,
        scheduledTodoTasksTable,
        dailyEntriesTable,
        dailyListsTable,
        changesTable,
        syncStateTable,
      ]),
    );
    installProjectTaskStatsHooks(db);
    registerSyncChangeHooks({
      syncSubDb: db,
      syncableDBTables: [tasksTable],
      clientId: "writer",
      nextClock: createHlcClock("writer"),
    });
    const task: Task = {
      id: "cached-task",
      type: "task",
      title: "Complete immediately",
      state: "todo",
      projectSectionId: "section",
      orderToken: "a",
      lastToggledAt: 0,
      createdAt: 0,
      templateId: null,
      templateDate: null,
    };
    await asyncDispatch(
      db,
      action({
        name: "seedCachedTask",
        args: {},
        handler: function* () {
          yield* upsert(tasksTable, [task]);
        },
      })({}),
    );
    await execAsync(db.waitForPersistence());
    const begin = runtime.primary.beginTx.bind(runtime.primary);
    const reads = vi.spyOn(runtime.primary, "beginTx").mockImplementation(function* (mode) {
      yield { type: "unwrap", data: Promise.resolve() };
      return yield* begin(mode);
    });
    const operations: string[][] = [];
    db.subscribe((ops) => operations.push(ops.map((op) => op.table.tableName)));
    for (const state of ["done", "todo"]) {
      reads.mockClear();
      const pending = asyncDispatch(db, toggleTaskState({ taskId: task.id }));
      expect(reads.mock.calls.filter(([mode]) => mode === "readonly")).toEqual([]);
      expect(
        execSync(
          db.intervalScan(tasksTable, "byId", [
            { eq: [{ col: "id", val: task.id }] },
          ]),
        )[0]?.state,
      ).toBe(state);
      expect(
        execSync(
          db.intervalScan(projectSectionTaskStatsTable, "byId", [
            { eq: [{ col: "id", val: task.projectSectionId }] },
          ]),
        )[0],
      ).toMatchObject({
        total: 1,
        todo: state === "todo" ? 1 : 0,
        done: state === "done" ? 1 : 0,
      });
      expect(operations.at(-1)).toEqual(
        expect.arrayContaining([
          tasksTable.tableName,
          projectSectionTaskStatsTable.tableName,
          changesTable.tableName,
        ]),
      );
      await pending;
    }
    await execAsync(db.waitForPersistence());
  });

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
