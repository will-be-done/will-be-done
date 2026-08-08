import { describe, expect, it } from "vitest";
import {
  createAction,
  createSelector,
  DB,
  execSync,
  insert,
  selectFrom,
  selectSync,
  SubscribableDB,
  syncDispatch,
  upsert,
} from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import { changesTable, type Change, type ChangesetArrayType } from "../common";
import { updateDailyEntry } from "./dailyEntries";
import { mergeSpaceChanges } from "./entryMerge";
import { registeredSpaceSyncableTableNameMap } from "./syncMap";
import {
  dailyEntriesTable,
  dailyEntryType,
  stashEntriesTable,
  stashEntryType,
  type DailyEntry,
} from "./tables";

const action = createAction();
const selector = createSelector();

const makeChange = (
  tableName: string,
  entityId: string,
  createdAt: string,
): Change => {
  const changes = {
    type: createdAt,
    id: createdAt,
    taskId: createdAt,
    orderToken: createdAt,
    createdAt,
    ...(tableName === dailyEntriesTable.tableName
      ? { dailyListId: createdAt }
      : {}),
  };

  return {
    id: `${tableName}:${entityId}`,
    entityId,
    tableName,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
    clientId: createdAt.split("-").at(-1) ?? "client",
    changes,
  };
};

const createDB = () => {
  const db = new DB(new BptreeInmemDriver());
  execSync(db.loadTables([dailyEntriesTable, stashEntriesTable, changesTable]));
  return db;
};

const createSubscribableDB = () => new SubscribableDB(createDB());

const observeWrites = (db: SubscribableDB) => {
  let committedOperations = 0;
  let mutationHookCalls = 0;
  const unsubscribe = db.subscribe((operations) => {
    committedOperations += operations.length;
  });
  const removeMutationHook = db.afterChange(function* () {
    mutationHookCalls += 1;
  });

  return {
    stop: () => {
      unsubscribe();
      removeMutationHook();
    },
    result: () => ({ committedOperations, mutationHookCalls }),
  };
};

const seedEntry = action({
  name: "seedEntryMergeEntry",
  args: {},
  handler: function* () {
    const entry: DailyEntry = {
      type: dailyEntryType,
      id: "entry-old",
      taskId: "task-1",
      dailyListId: "list-old",
      orderToken: "a",
      createdAt: 1,
    };
    yield* insert(dailyEntriesTable, [entry]);
    yield* insert(changesTable, [
      makeChange(
        dailyEntriesTable.tableName,
        entry.id,
        "0000000010-0001-client-a",
      ),
    ]);
  },
});

const rowsAndChanges = selector({
  name: "entryMergeRowsAndChanges",
  args: {},
  handler: function* () {
    return {
      daily: yield* selectFrom(dailyEntriesTable, "byIds"),
      stash: yield* selectFrom(stashEntriesTable, "byIds"),
      changes: yield* selectFrom(changesTable, "byUpdatedAt"),
    };
  },
});

const incomingDailyEntry = (
  id: string,
  listId: string,
  createdAt: string,
  taskId = "task-1",
): ChangesetArrayType => [
  {
    tableName: dailyEntriesTable.tableName,
    data: [
      {
        row: {
          type: dailyEntryType,
          id,
          taskId,
          dailyListId: listId,
          orderToken: "b",
          createdAt: 2,
        },
        change: makeChange(dailyEntriesTable.tableName, id, createdAt),
      },
    ],
  },
];

const incomingStashEntry = (
  id: string,
  createdAt: string,
  taskId = "task-1",
): ChangesetArrayType => [
  {
    tableName: stashEntriesTable.tableName,
    data: [
      {
        row: {
          type: stashEntryType,
          id,
          taskId,
          orderToken: "b",
          createdAt: 2,
        },
        change: makeChange(stashEntriesTable.tableName, id, createdAt),
      },
    ],
  },
];

describe("entry conflict merge", () => {
  it("replaces an older task entry before the uniqhash insert", () => {
    const db = createDB();
    syncDispatch(db, seedEntry({}));

    const resolutions = syncDispatch(
      db,
      mergeSpaceChanges({
        input: incomingDailyEntry(
          "entry-new",
          "list-new",
          "0000000020-0001-client-b",
        ),
        nextClock: "0000000030-0001-server",
        clientId: "server",
        registeredSyncableTableNameMap: registeredSpaceSyncableTableNameMap,
      }),
    );
    const result = selectSync(db, { selector: rowsAndChanges, args: {} });

    expect(resolutions).toEqual([
      {
        tableName: dailyEntriesTable.tableName,
        taskId: "task-1",
        winnerId: "entry-new",
        loserIds: ["entry-old"],
      },
    ]);
    expect(result.daily).toEqual([
      expect.objectContaining({ id: "entry-new", taskId: "task-1" }),
    ]);
    expect(
      result.changes.find((change) => change.entityId === "entry-old")
        ?.deletedAt,
    ).toBe("0000000030-0001-server");
  });

  it("tombstones an older incoming duplicate and keeps the current entry", () => {
    const db = createDB();
    syncDispatch(db, seedEntry({}));
    const oldChange = selectSync(db, {
      selector: rowsAndChanges,
      args: {},
    }).changes[0]!;
    syncDispatch(
      db,
      action({
        name: "makeExistingEntryNewer",
        args: {},
        handler: function* () {
          yield* upsert(changesTable, [
            { ...oldChange, createdAt: "0000000040-0001-client-a" },
          ]);
        },
      })({}),
    );

    syncDispatch(
      db,
      mergeSpaceChanges({
        input: incomingDailyEntry(
          "entry-stale",
          "list-stale",
          "0000000020-0001-client-b",
        ),
        nextClock: "0000000050-0001-server",
        clientId: "server",
        registeredSyncableTableNameMap: registeredSpaceSyncableTableNameMap,
      }),
    );
    const result = selectSync(db, { selector: rowsAndChanges, args: {} });

    expect(result.daily.map((entry) => entry.id)).toEqual(["entry-old"]);
    expect(
      result.changes.find((change) => change.entityId === "entry-stale")
        ?.deletedAt,
    ).toBe("0000000050-0001-server");
  });

  it("allows a fresh entry id after the previous id was tombstoned", () => {
    const db = createDB();
    const deleted = makeChange(
      dailyEntriesTable.tableName,
      "entry-deleted",
      "0000000010-0001-client-a",
    );
    syncDispatch(
      db,
      action({
        name: "seedEntryTombstone",
        args: {},
        handler: function* () {
          yield* insert(changesTable, [
            {
              ...deleted,
              deletedAt: "0000000020-0001-client-a",
              updatedAt: "0000000020-0001-client-a",
            },
          ]);
        },
      })({}),
    );

    syncDispatch(
      db,
      mergeSpaceChanges({
        input: incomingDailyEntry(
          "entry-recreated",
          "list-new",
          "0000000030-0001-client-a",
        ),
        nextClock: "0000000040-0001-server",
        clientId: "server",
        registeredSyncableTableNameMap: registeredSpaceSyncableTableNameMap,
      }),
    );

    expect(
      selectSync(db, { selector: rowsAndChanges, args: {} }).daily,
    ).toEqual([
      expect.objectContaining({ id: "entry-recreated", taskId: "task-1" }),
    ]);
  });

  it("resolves duplicates split across changesets before inserting", () => {
    const db = createDB();

    const resolutions = syncDispatch(
      db,
      mergeSpaceChanges({
        input: [
          ...incomingDailyEntry(
            "entry-first",
            "list-first",
            "0000000010-0001-client-a",
          ),
          ...incomingDailyEntry(
            "entry-second",
            "list-second",
            "0000000020-0001-client-b",
          ),
        ],
        nextClock: "0000000030-0001-server",
        clientId: "server",
        registeredSyncableTableNameMap: registeredSpaceSyncableTableNameMap,
      }),
    );
    const result = selectSync(db, { selector: rowsAndChanges, args: {} });

    expect(resolutions).toEqual([
      {
        tableName: dailyEntriesTable.tableName,
        taskId: "task-1",
        winnerId: "entry-second",
        loserIds: ["entry-first"],
      },
    ]);
    expect(result.daily).toEqual([
      expect.objectContaining({ id: "entry-second", taskId: "task-1" }),
    ]);
    expect(
      result.changes.find((change) => change.entityId === "entry-first")
        ?.deletedAt,
    ).toBe("0000000030-0001-server");
  });

  it("uses entry id as a deterministic creation-time tie-breaker", () => {
    const db = createDB();
    const createdAt = "0000000010-0001-client-a";

    syncDispatch(
      db,
      mergeSpaceChanges({
        input: [
          ...incomingDailyEntry("entry-a", "list-a", createdAt),
          ...incomingDailyEntry("entry-b", "list-b", createdAt),
        ],
        nextClock: "0000000020-0001-server",
        clientId: "server",
        registeredSyncableTableNameMap: registeredSpaceSyncableTableNameMap,
      }),
    );
    const result = selectSync(db, { selector: rowsAndChanges, args: {} });

    expect(result.daily).toEqual([
      expect.objectContaining({ id: "entry-b", taskId: "task-1" }),
    ]);
    expect(
      result.changes.find((change) => change.entityId === "entry-a")?.deletedAt,
    ).toBe("0000000020-0001-server");
  });

  it("keeps taskId immutable when merging an update to an existing id", () => {
    const db = createDB();
    syncDispatch(db, seedEntry({}));
    const incoming = incomingDailyEntry(
      "entry-old",
      "list-new",
      "0000000010-0001-client-a",
      "task-other",
    );
    incoming[0]!.data[0]!.change.updatedAt = "0000000020-0001-client-b";
    incoming[0]!.data[0]!.change.changes.taskId = "0000000020-0001-client-b";
    const originalIncoming = structuredClone(incoming);

    syncDispatch(
      db,
      mergeSpaceChanges({
        input: incoming,
        nextClock: "0000000030-0001-server",
        clientId: "server",
        registeredSyncableTableNameMap: registeredSpaceSyncableTableNameMap,
      }),
    );

    expect(
      selectSync(db, { selector: rowsAndChanges, args: {} }).daily,
    ).toEqual([expect.objectContaining({ id: "entry-old", taskId: "task-1" })]);
    expect(incoming).toEqual(originalIncoming);
  });

  it("rejects changing taskId through the update action", () => {
    const db = createDB();
    syncDispatch(db, seedEntry({}));

    expect(() =>
      syncDispatch(
        db,
        updateDailyEntry({
          id: "entry-old",
          entry: { taskId: "task-other" },
        }),
      ),
    ).toThrow("Cannot change a daily entry taskId");
  });

  it("allows one daily and one stash entry for the same task", () => {
    const db = createDB();
    const stashChange = makeChange(
      stashEntriesTable.tableName,
      "stash-entry",
      "0000000020-0001-client-a",
    );

    const resolutions = syncDispatch(
      db,
      mergeSpaceChanges({
        input: [
          ...incomingDailyEntry(
            "daily-entry",
            "list",
            "0000000010-0001-client-a",
          ),
          {
            tableName: stashEntriesTable.tableName,
            data: [
              {
                row: {
                  type: stashEntryType,
                  id: "stash-entry",
                  taskId: "task-1",
                  orderToken: "a",
                  createdAt: 2,
                },
                change: stashChange,
              },
            ],
          },
        ],
        nextClock: "0000000030-0001-server",
        clientId: "server",
        registeredSyncableTableNameMap: registeredSpaceSyncableTableNameMap,
      }),
    );
    const result = selectSync(db, { selector: rowsAndChanges, args: {} });

    expect(resolutions).toEqual([]);
    expect(result.daily).toEqual([
      expect.objectContaining({ id: "daily-entry", taskId: "task-1" }),
    ]);
    expect(result.stash).toEqual([
      expect.objectContaining({ id: "stash-entry", taskId: "task-1" }),
    ]);
  });

  it("does not write when a winning replacement is delivered again", () => {
    const db = createSubscribableDB();
    syncDispatch(db, seedEntry({}));
    const input = incomingDailyEntry(
      "entry-new",
      "list-new",
      "0000000020-0001-client-b",
    );

    syncDispatch(
      db,
      mergeSpaceChanges({
        input,
        nextClock: "0000000030-0001-server",
        clientId: "server",
        registeredSyncableTableNameMap: registeredSpaceSyncableTableNameMap,
      }),
    );
    const afterFirstMerge = selectSync(db, {
      selector: rowsAndChanges,
      args: {},
    });
    const writes = observeWrites(db);

    syncDispatch(
      db,
      mergeSpaceChanges({
        input,
        nextClock: "0000000040-0001-server",
        clientId: "server",
        registeredSyncableTableNameMap: registeredSpaceSyncableTableNameMap,
      }),
    );
    writes.stop();

    expect(selectSync(db, { selector: rowsAndChanges, args: {} })).toEqual(
      afterFirstMerge,
    );
    expect(writes.result()).toEqual({
      committedOperations: 0,
      mutationHookCalls: 0,
    });
  });

  it("reuses a losing tombstone without writing on redelivery", () => {
    const db = createSubscribableDB();
    syncDispatch(db, seedEntry({}));
    const currentChange = selectSync(db, {
      selector: rowsAndChanges,
      args: {},
    }).changes[0]!;
    syncDispatch(
      db,
      action({
        name: "makeExistingEntryNewerForReplay",
        args: {},
        handler: function* () {
          yield* upsert(changesTable, [
            {
              ...currentChange,
              createdAt: "0000000040-0001-client-a",
            },
          ]);
        },
      })({}),
    );
    const input = incomingDailyEntry(
      "entry-stale",
      "list-stale",
      "0000000020-0001-client-b",
    );

    syncDispatch(
      db,
      mergeSpaceChanges({
        input,
        nextClock: "0000000050-0001-server",
        clientId: "server",
        registeredSyncableTableNameMap: registeredSpaceSyncableTableNameMap,
      }),
    );
    const afterFirstMerge = selectSync(db, {
      selector: rowsAndChanges,
      args: {},
    });
    const writes = observeWrites(db);

    syncDispatch(
      db,
      mergeSpaceChanges({
        input,
        nextClock: "0000000060-0001-server",
        clientId: "server",
        registeredSyncableTableNameMap: registeredSpaceSyncableTableNameMap,
      }),
    );
    writes.stop();
    const afterReplay = selectSync(db, {
      selector: rowsAndChanges,
      args: {},
    });

    expect(afterReplay).toEqual(afterFirstMerge);
    expect(
      afterReplay.changes.find((change) => change.entityId === "entry-stale")
        ?.deletedAt,
    ).toBe("0000000050-0001-server");
    expect(writes.result()).toEqual({
      committedOperations: 0,
      mutationHookCalls: 0,
    });
  });

  it("satisfies the replay fixed-point property across generated conflicts", () => {
    const earlier = "0000000010-0001-client-a";
    const later = "0000000020-0001-client-b";
    const creationPairs = [
      [earlier, later],
      [later, earlier],
      [earlier, earlier],
    ] as const;

    for (const tableKind of ["daily", "stash"] as const) {
      for (const inputOrder of ["forward", "reverse"] as const) {
        for (const [leftCreatedAt, rightCreatedAt] of creationPairs) {
          const db = createSubscribableDB();
          const left =
            tableKind === "daily"
              ? incomingDailyEntry("entry-a", "list-a", leftCreatedAt)
              : incomingStashEntry("entry-a", leftCreatedAt);
          const right =
            tableKind === "daily"
              ? incomingDailyEntry("entry-b", "list-b", rightCreatedAt)
              : incomingStashEntry("entry-b", rightCreatedAt);
          const input: ChangesetArrayType =
            inputOrder === "forward"
              ? [...left, ...right]
              : [...right, ...left];

          const firstResolutions = syncDispatch(
            db,
            mergeSpaceChanges({
              input,
              nextClock: "0000000030-0001-server",
              clientId: "server",
              registeredSyncableTableNameMap:
                registeredSpaceSyncableTableNameMap,
            }),
          );
          const afterFirstMerge = selectSync(db, {
            selector: rowsAndChanges,
            args: {},
          });
          const writes = observeWrites(db);

          const replayResolutions = syncDispatch(
            db,
            mergeSpaceChanges({
              input,
              nextClock: "0000000040-0001-server",
              clientId: "server",
              registeredSyncableTableNameMap:
                registeredSpaceSyncableTableNameMap,
            }),
          );
          writes.stop();
          const caseName = `${tableKind}/${inputOrder}/${leftCreatedAt}/${rightCreatedAt}`;

          expect(firstResolutions, caseName).toHaveLength(1);
          expect(replayResolutions, caseName).toEqual([]);
          expect(
            selectSync(db, { selector: rowsAndChanges, args: {} }),
            caseName,
          ).toEqual(afterFirstMerge);
          expect(writes.result(), caseName).toEqual({
            committedOperations: 0,
            mutationHookCalls: 0,
          });
        }
      }
    }
  });
});
