import { describe, expect, it } from "vitest";
import {
  DB,
  execSync,
  syncDispatch,
  deleteRows,
  insert,
  upsert,
  createAction,
  createSelector,
  selectSync,
  selectFrom,
  defineTable,
  Row,
  v,
} from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import {
  mergeChanges,
  getChangesetAfter,
  changesTable,
  changeId,
  type Change,
  type ChangesetArrayType,
} from "./changes";

const action = createAction();
const selector = createSelector();

function runSelector<T>(
  db: DB,
  handler: () => Generator<unknown, T, unknown>,
  _deps: unknown[],
): T {
  const testSelector = selector({
    name: "testSelector",
    args: {},
    handler,
  });
  return selectSync(db, { selector: testSelector, args: {} });
}

// A simple test table
const testTable = defineTable("testItems", {
  type: v.string(),
  id: v.string(),
  title: v.string(),
  orderToken: v.string(),
  createdAt: v.number(),
});

function createDB() {
  const driver = new BptreeInmemDriver();
  const db = new DB(driver);
  execSync(db.loadTables([testTable, changesTable]));
  return db;
}

let clockCounter = 0;
function makeClockFn(base: string) {
  return () => {
    clockCounter++;
    return `${base}-${String(clockCounter).padStart(4, "0")}-local`;
  };
}

function resetClock() {
  clockCounter = 0;
}

const registeredTables: Record<string, typeof testTable> = {
  testItems: testTable,
};

/** Insert a row + its change record into a DB (simulates a local create). */
function localCreate(
  db: DB,
  row: {
    type: string;
    id: string;
    title: string;
    orderToken: string;
    createdAt: number;
  },
  createdAtClock: string,
  clientId = "local",
) {
  syncDispatch(
    db,
    action({
      name: "anonymousAction",
      args: {},
      handler: function* anonymousAction() {
        yield* insert(testTable, [row]);
        yield* insert(changesTable, [
          {
            id: `testItems:${row.id}`,
            entityId: row.id,
            tableName: "testItems",
            createdAt: createdAtClock,
            updatedAt: createdAtClock,
            deletedAt: null,
            clientId,
            changes: {
              type: createdAtClock,
              id: createdAtClock,
              title: createdAtClock,
              orderToken: createdAtClock,
              createdAt: createdAtClock,
            },
          } satisfies Change,
        ]);
      },
    })({}),
  );
}

/** Delete a local row + keep its tombstone change record. */
function localDelete(
  db: DB,
  row: {
    type: string;
    id: string;
    title: string;
    orderToken: string;
    createdAt: number;
  },
  createdAtClock: string,
  deletedAtClock: string,
  clientId = "local",
) {
  syncDispatch(
    db,
    action({
      name: "anonymousDeleteAction",
      args: {},
      handler: function* anonymousDeleteAction() {
        yield* deleteRows(testTable, [row.id]);
        yield* upsert(changesTable, [
          {
            id: `testItems:${row.id}`,
            entityId: row.id,
            tableName: "testItems",
            createdAt: createdAtClock,
            updatedAt: deletedAtClock,
            deletedAt: deletedAtClock,
            clientId,
            changes: {
              type: createdAtClock,
              id: createdAtClock,
              title: createdAtClock,
              orderToken: createdAtClock,
              createdAt: createdAtClock,
            },
          } satisfies Change,
        ]);
      },
    })({}),
  );
}

/** Reinsert a row after deletion, replacing the tombstone change record. */
function localRecreate(
  db: DB,
  row: {
    type: string;
    id: string;
    title: string;
    orderToken: string;
    createdAt: number;
  },
  recreatedAtClock: string,
  clientId = "local",
) {
  syncDispatch(
    db,
    action({
      name: "anonymousRecreateAction",
      args: {},
      handler: function* anonymousRecreateAction() {
        yield* insert(testTable, [row]);
        yield* upsert(changesTable, [
          {
            id: `testItems:${row.id}`,
            entityId: row.id,
            tableName: "testItems",
            createdAt: recreatedAtClock,
            updatedAt: recreatedAtClock,
            deletedAt: null,
            clientId,
            changes: {
              type: recreatedAtClock,
              id: recreatedAtClock,
              title: recreatedAtClock,
              orderToken: recreatedAtClock,
              createdAt: recreatedAtClock,
            },
          } satisfies Change,
        ]);
      },
    })({}),
  );
}

/** Build an incoming changeset from a remote creation */
function makeIncomingCreate(
  entityId: string,
  title: string,
  createdAtClock: string,
  deletedAt: string | null = null,
): ChangesetArrayType {
  return [
    {
      tableName: "testItems",
      data: [
        {
          row: deletedAt
            ? undefined
            : {
                type: "task",
                id: entityId,
                title,
                orderToken: "a",
                createdAt: 100,
              },
          change: {
            id: `testItems:${entityId}`,
            entityId,
            tableName: "testItems",
            createdAt: createdAtClock,
            updatedAt: createdAtClock,
            deletedAt,
            clientId: "remote",
            changes: {
              type: createdAtClock,
              id: createdAtClock,
              title: createdAtClock,
              orderToken: createdAtClock,
              createdAt: createdAtClock,
            },
          },
        },
      ],
    },
  ];
}

const getRowSelector = selector({
  name: "getRowSelector",
  args: { id: v.string() },
  handler: function* getRowSelector({ id }: { id: string }) {
    const rows = yield* selectFrom(testTable, "byId")
      .where((q) => q.eq("id", id))
      .limit(1);
    return rows[0] as Row | undefined;
  },
});

const getChangeSelector = selector({
  name: "getChangeSelector",
  args: { entityId: v.string() },
  handler: function* getChangeSelector({ entityId }: { entityId: string }) {
    const changes = yield* selectFrom(changesTable, "byId")
      .where((q) => q.eq("id", changeId("testItems", entityId)))
      .limit(1);
    return changes[0] as Change | undefined;
  },
});

function getRow(db: DB, id: string) {
  return runSelector<Row | undefined>(
    db,
    function* () {
      return yield* getRowSelector({ id });
    },
    [],
  );
}

function getChange(db: DB, entityId: string) {
  return runSelector<Change | undefined>(
    db,
    function* () {
      return yield* getChangeSelector({ entityId });
    },
    [],
  );
}

describe("first-creator-wins merge", () => {
  it("basic: earlier creator's title preserved when later creator merges in", () => {
    resetClock();
    const db = createDB();
    const entityId = "entity-1";

    // Client1 creates at t=10 (earlier)
    localCreate(
      db,
      {
        type: "task",
        id: entityId,
        title: "client1-title",
        orderToken: "a",
        createdAt: 100,
      },
      "0000000010-0001-client1",
    );

    // Client2 created the same entity at t=20 (later) with different title
    const incoming = makeIncomingCreate(
      entityId,
      "client2-title",
      "0000000020-0001-client2",
    );

    // Merge client2's creation into client1's DB
    syncDispatch(
      db,
      mergeChanges({
        input: incoming,
        nextClock: makeClockFn("0000000030")(),
        clientId: "local",
        registeredSyncableTableNameMap: registeredTables,
      }),
    );

    const row = getRow(db, entityId);
    expect(row).toBeDefined();
    expect(row!.title).toBe("client1-title"); // first creator wins
  });

  it("symmetry: incoming earlier creator wins over local later creator", () => {
    resetClock();
    const db = createDB();
    const entityId = "entity-2";

    // Client2 creates locally at t=20 (later)
    localCreate(
      db,
      {
        type: "task",
        id: entityId,
        title: "client2-title",
        orderToken: "a",
        createdAt: 100,
      },
      "0000000020-0001-client2",
    );

    // Client1 created at t=10 (earlier) — incoming
    const incoming = makeIncomingCreate(
      entityId,
      "client1-title",
      "0000000010-0001-client1",
    );

    syncDispatch(
      db,
      mergeChanges({
        input: incoming,
        nextClock: makeClockFn("0000000030")(),
        clientId: "local",
        registeredSyncableTableNameMap: registeredTables,
      }),
    );

    const row = getRow(db, entityId);
    expect(row).toBeDefined();
    expect(row!.title).toBe("client1-title"); // first creator wins even when incoming
  });

  it("first creator wins against later updates from the other client", () => {
    resetClock();
    const db = createDB();
    const entityId = "entity-3";

    // Client1 creates at t=10 (earlier)
    localCreate(
      db,
      {
        type: "task",
        id: entityId,
        title: "client1-title",
        orderToken: "a",
        createdAt: 100,
      },
      "0000000010-0001-client1",
    );

    // Client2 created at t=20 AND updated title at t=30
    const incoming: ChangesetArrayType = [
      {
        tableName: "testItems",
        data: [
          {
            row: {
              type: "task",
              id: entityId,
              title: "client2-updated-title",
              orderToken: "a",
              createdAt: 100,
            },
            change: {
              id: `testItems:${entityId}`,
              entityId,
              tableName: "testItems",
              createdAt: "0000000020-0001-client2",
              updatedAt: "0000000030-0001-client2",
              deletedAt: null,
              clientId: "client2",
              changes: {
                type: "0000000020-0001-client2",
                id: "0000000020-0001-client2",
                title: "0000000030-0001-client2", // updated later
                orderToken: "0000000020-0001-client2",
                createdAt: "0000000020-0001-client2",
              },
            },
          },
        ],
      },
    ];

    syncDispatch(
      db,
      mergeChanges({
        input: incoming,
        nextClock: makeClockFn("0000000040")(),
        clientId: "local",
        registeredSyncableTableNameMap: registeredTables,
      }),
    );

    const row = getRow(db, entityId);
    expect(row).toBeDefined();
    expect(row!.title).toBe("client1-title"); // first creator still wins
  });

  it("delete still wins regardless of creation order", () => {
    resetClock();
    const db = createDB();
    const entityId = "entity-4";

    // Client1 creates at t=10 (earlier)
    localCreate(
      db,
      {
        type: "task",
        id: entityId,
        title: "client1-title",
        orderToken: "a",
        createdAt: 100,
      },
      "0000000010-0001-client1",
    );

    // Client2 deletes the entity
    const incoming: ChangesetArrayType = [
      {
        tableName: "testItems",
        data: [
          {
            // no row for deletion
            change: {
              id: `testItems:${entityId}`,
              entityId,
              tableName: "testItems",
              createdAt: "0000000020-0001-client2",
              updatedAt: "0000000025-0001-client2",
              deletedAt: "0000000025-0001-client2",
              clientId: "client2",
              changes: {
                type: "0000000020-0001-client2",
                id: "0000000020-0001-client2",
                title: "0000000020-0001-client2",
                orderToken: "0000000020-0001-client2",
                createdAt: "0000000020-0001-client2",
              },
            },
          },
        ],
      },
    ];

    syncDispatch(
      db,
      mergeChanges({
        input: incoming,
        nextClock: makeClockFn("0000000030")(),
        clientId: "local",
        registeredSyncableTableNameMap: registeredTables,
      }),
    );

    const row = getRow(db, entityId);
    expect(row).toBeUndefined(); // deleted

    const change = getChange(db, entityId);
    expect(change).toBeDefined();
    expect(change!.deletedAt).not.toBeNull();
  });

  it("local delete tombstone wins over incoming stale update", () => {
    resetClock();
    const db = createDB();
    const entityId = "entity-local-delete";
    const row = {
      type: "task",
      id: entityId,
      title: "deleted-title",
      orderToken: "a",
      createdAt: 100,
    };
    const createdAtClock = "0000000010-0001-client1";
    const deletedAtClock = "0000000025-0001-client1";

    localCreate(db, row, createdAtClock, "client1");
    localDelete(db, row, createdAtClock, deletedAtClock, "client1");

    const incoming: ChangesetArrayType = [
      {
        tableName: "testItems",
        data: [
          {
            row: {
              ...row,
              title: "stale-remote-update",
            },
            change: {
              id: `testItems:${entityId}`,
              entityId,
              tableName: "testItems",
              createdAt: createdAtClock,
              updatedAt: "0000000030-0001-client2",
              deletedAt: null,
              clientId: "client2",
              changes: {
                type: createdAtClock,
                id: createdAtClock,
                title: "0000000030-0001-client2",
                orderToken: createdAtClock,
                createdAt: createdAtClock,
              },
            },
          },
        ],
      },
    ];

    syncDispatch(
      db,
      mergeChanges({
        input: incoming,
        nextClock: makeClockFn("0000000040")(),
        clientId: "local",
        registeredSyncableTableNameMap: registeredTables,
      }),
    );

    const mergedRow = getRow(db, entityId);
    expect(mergedRow).toBeUndefined();

    const change = getChange(db, entityId);
    expect(change).toBeDefined();
    expect(change!.deletedAt).toBe(deletedAtClock);
    expect(change!.clientId).toBe("client1");
  });

  it("incoming recreate after local tombstone resurrects the row", () => {
    resetClock();
    const db = createDB();
    const entityId = "entity-rescheduled-remotely";
    const row = {
      type: "task",
      id: entityId,
      title: "scheduled",
      orderToken: "a",
      createdAt: 100,
    };
    const createdAtClock = "0000000010-0001-client1";
    const deletedAtClock = "0000000020-0001-client1";
    const recreatedAtClock = "0000000030-0001-client2";

    localCreate(db, row, createdAtClock, "client1");
    localDelete(db, row, createdAtClock, deletedAtClock, "client1");

    syncDispatch(
      db,
      mergeChanges({
        input: makeIncomingCreate(entityId, "rescheduled", recreatedAtClock),
        nextClock: makeClockFn("0000000040")(),
        clientId: "local",
        registeredSyncableTableNameMap: registeredTables,
      }),
    );

    const mergedRow = getRow(db, entityId);
    expect(mergedRow).toBeDefined();
    expect(mergedRow!.title).toBe("rescheduled");

    const change = getChange(db, entityId);
    expect(change).toBeDefined();
    expect(change!.createdAt).toBe(recreatedAtClock);
    expect(change!.deletedAt).toBeNull();
  });

  it("local recreate after incoming tombstone keeps the row", () => {
    resetClock();
    const db = createDB();
    const entityId = "entity-rescheduled-locally";
    const originalRow = {
      type: "task",
      id: entityId,
      title: "scheduled",
      orderToken: "a",
      createdAt: 100,
    };
    const recreatedRow = {
      ...originalRow,
      title: "rescheduled",
      orderToken: "b",
    };
    const createdAtClock = "0000000010-0001-client1";
    const deletedAtClock = "0000000020-0001-client2";
    const recreatedAtClock = "0000000030-0001-client1";

    localCreate(db, originalRow, createdAtClock, "client1");
    localDelete(db, originalRow, createdAtClock, deletedAtClock, "client1");
    localRecreate(db, recreatedRow, recreatedAtClock, "client1");

    const incoming: ChangesetArrayType = [
      {
        tableName: "testItems",
        data: [
          {
            change: {
              id: `testItems:${entityId}`,
              entityId,
              tableName: "testItems",
              createdAt: createdAtClock,
              updatedAt: deletedAtClock,
              deletedAt: deletedAtClock,
              clientId: "client2",
              changes: {
                type: createdAtClock,
                id: createdAtClock,
                title: createdAtClock,
                orderToken: createdAtClock,
                createdAt: createdAtClock,
              },
            },
          },
        ],
      },
    ];

    syncDispatch(
      db,
      mergeChanges({
        input: incoming,
        nextClock: makeClockFn("0000000040")(),
        clientId: "local",
        registeredSyncableTableNameMap: registeredTables,
      }),
    );

    const mergedRow = getRow(db, entityId);
    expect(mergedRow).toBeDefined();
    expect(mergedRow!.title).toBe("rescheduled");
    expect(mergedRow!.orderToken).toBe("b");

    const change = getChange(db, entityId);
    expect(change).toBeDefined();
    expect(change!.createdAt).toBe(recreatedAtClock);
    expect(change!.deletedAt).toBeNull();
  });

  it("new entity from remote inserts normally when no local record exists", () => {
    resetClock();
    const db = createDB();
    const entityId = "entity-5";

    // No local record — incoming creates a new entity
    const incoming = makeIncomingCreate(
      entityId,
      "remote-title",
      "0000000015-0001-remote",
    );

    syncDispatch(
      db,
      mergeChanges({
        input: incoming,
        nextClock: makeClockFn("0000000020")(),
        clientId: "local",
        registeredSyncableTableNameMap: registeredTables,
      }),
    );

    const row = getRow(db, entityId);
    expect(row).toBeDefined();
    expect(row!.title).toBe("remote-title"); // inserted as-is

    const change = getChange(db, entityId);
    expect(change).toBeDefined();
    expect(change!.clientId).toBe("remote");
  });

  it("normal update sync is not blocked by FCW guard (same createdAt)", () => {
    resetClock();
    const db = createDB();
    const entityId = "entity-6";
    const sharedCreatedAt = "0000000010-0001-client1";

    // Both sides share the same entity with the same createdAt (synced earlier)
    localCreate(
      db,
      {
        type: "task",
        id: entityId,
        title: "original",
        orderToken: "a",
        createdAt: 100,
      },
      sharedCreatedAt,
    );

    // Remote sends an update (same createdAt, newer field timestamp)
    const incoming: ChangesetArrayType = [
      {
        tableName: "testItems",
        data: [
          {
            row: {
              type: "task",
              id: entityId,
              title: "updated-by-remote",
              orderToken: "a",
              createdAt: 100,
            },
            change: {
              id: `testItems:${entityId}`,
              entityId,
              tableName: "testItems",
              createdAt: sharedCreatedAt, // same creation clock
              updatedAt: "0000000020-0001-client1",
              deletedAt: null,
              clientId: "client1",
              changes: {
                type: sharedCreatedAt,
                id: sharedCreatedAt,
                title: "0000000020-0001-client1", // title updated later
                orderToken: sharedCreatedAt,
                createdAt: sharedCreatedAt,
              },
            },
          },
        ],
      },
    ];

    syncDispatch(
      db,
      mergeChanges({
        input: incoming,
        nextClock: makeClockFn("0000000030")(),
        clientId: "local",
        registeredSyncableTableNameMap: registeredTables,
      }),
    );

    const row = getRow(db, entityId);
    expect(row).toBeDefined();
    expect(row!.title).toBe("updated-by-remote"); // update must not be dropped
  });

  it("merges and reads large changesets in select-sized chunks", () => {
    resetClock();
    const db = createDB();
    const incoming: ChangesetArrayType = [
      {
        tableName: "testItems",
        data: Array.from({ length: 1205 }, (_, index) => {
          const entityId = `large-${index}`;
          const createdAtClock = `0000000010-${String(index).padStart(
            4,
            "0",
          )}-remote`;

          return {
            row: {
              type: "task",
              id: entityId,
              title: `remote-title-${index}`,
              orderToken: "a",
              createdAt: 100 + index,
            },
            change: {
              id: `testItems:${entityId}`,
              entityId,
              tableName: "testItems",
              createdAt: createdAtClock,
              updatedAt: createdAtClock,
              deletedAt: null,
              clientId: "remote",
              changes: {
                type: createdAtClock,
                id: createdAtClock,
                title: createdAtClock,
                orderToken: createdAtClock,
                createdAt: createdAtClock,
              },
            },
          };
        }),
      },
    ];

    syncDispatch(
      db,
      mergeChanges({
        input: incoming,
        nextClock: makeClockFn("0000000020")(),
        clientId: "local",
        registeredSyncableTableNameMap: registeredTables,
      }),
    );

    const row = getRow(db, "large-1204");
    expect(row).toBeDefined();
    expect(row!.title).toBe("remote-title-1204");

    const { changesets } = runSelector(
      db,
      function* () {
        return yield* getChangesetAfter({
          after: "",
          registeredSyncableTableNameMap: registeredTables,
        });
      },
      [],
    );

    expect(changesets).toHaveLength(1);
    expect(changesets[0]!.data).toHaveLength(1205);
  });

  it("returns requester changes so server-merged state is not skipped", () => {
    resetClock();
    const db = createDB();

    localCreate(
      db,
      {
        type: "task",
        id: "remote-change",
        title: "remote",
        orderToken: "a",
        createdAt: 100,
      },
      "0000000020-0001-remote",
      "remote-client",
    );
    localCreate(
      db,
      {
        type: "task",
        id: "own-change",
        title: "own",
        orderToken: "b",
        createdAt: 200,
      },
      "0000000030-0001-local",
      "local-client",
    );

    const { changesets, maxClock } = runSelector(
      db,
      function* () {
        return yield* getChangesetAfter({
          after: "",
          registeredSyncableTableNameMap: registeredTables,
        });
      },
      [],
    );

    expect(maxClock).toBe("0000000030-0001-local");
    expect(changesets).toHaveLength(1);
    expect(changesets[0]!.data.map((d) => d.change.entityId).sort()).toEqual([
      "own-change",
      "remote-change",
    ]);
  });
});
