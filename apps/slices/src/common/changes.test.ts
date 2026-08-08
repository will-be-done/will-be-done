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

/** Simulate an invalid local ID reuse that replaced its tombstone. */
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

  it("rejects an incoming recreation after a local tombstone", () => {
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
    const attemptedRecreateClock = "0000000030-0001-client2";

    localCreate(db, row, createdAtClock, "client1");
    localDelete(db, row, createdAtClock, deletedAtClock, "client1");

    syncDispatch(
      db,
      mergeChanges({
        input: makeIncomingCreate(
          entityId,
          "rescheduled",
          attemptedRecreateClock,
        ),
        nextClock: makeClockFn("0000000040")(),
        clientId: "local",
        registeredSyncableTableNameMap: registeredTables,
      }),
    );

    const mergedRow = getRow(db, entityId);
    expect(mergedRow).toBeUndefined();

    const change = getChange(db, entityId);
    expect(change).toBeDefined();
    expect(change!.createdAt).toBe(createdAtClock);
    expect(change!.deletedAt).toBe(deletedAtClock);

    syncDispatch(
      db,
      mergeChanges({
        input: makeIncomingCreate(
          entityId,
          "rescheduled",
          attemptedRecreateClock,
        ),
        nextClock: makeClockFn("0000000050")(),
        clientId: "local",
        registeredSyncableTableNameMap: registeredTables,
      }),
    );
    expect(getChange(db, entityId)).toEqual(change);
  });

  it("an incoming tombstone deletes an invalid local recreation", () => {
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
    expect(mergedRow).toBeUndefined();

    const change = getChange(db, entityId);
    expect(change).toBeDefined();
    expect(change!.createdAt).toBe(createdAtClock);
    expect(change!.deletedAt).toBe(deletedAtClock);
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

describe("idempotent merge retries", () => {
  it("converges monotonically when changes arrive in different orders", () => {
    const createdAt = "0000000010-0001-client";
    const updatedAt = "0000000020-0001-client";
    const deletedAt = "0000000030-0001-client";
    const entityId = "ordered-changes";
    const created = makeIncomingCreate(entityId, "created", createdAt);
    const updated: ChangesetArrayType = [
      {
        tableName: "testItems",
        data: [
          {
            row: {
              type: "task",
              id: entityId,
              title: "updated",
              orderToken: "a",
              createdAt: 100,
            },
            change: {
              ...created[0]!.data[0]!.change,
              updatedAt,
              changes: {
                ...created[0]!.data[0]!.change.changes,
                title: updatedAt,
              },
            },
          },
        ],
      },
    ];
    const deleted: ChangesetArrayType = [
      {
        tableName: "testItems",
        data: [
          {
            change: {
              ...updated[0]!.data[0]!.change,
              updatedAt: deletedAt,
              deletedAt,
            },
          },
        ],
      },
    ];
    const inCausalOrder = createDB();
    const inReverseOrder = createDB();
    const applyChanges = (db: DB, inputs: ChangesetArrayType[]) => {
      inputs.forEach((input, index) => {
        syncDispatch(
          db,
          mergeChanges({
            input,
            nextClock: `0000000040-000${index}-server`,
            clientId: "server",
            registeredSyncableTableNameMap: registeredTables,
          }),
        );
      });
    };

    applyChanges(inCausalOrder, [created, updated, deleted]);
    applyChanges(inReverseOrder, [deleted, updated, created]);

    expect(getRow(inCausalOrder, entityId)).toBeUndefined();
    expect(getRow(inReverseOrder, entityId)).toBeUndefined();
    const causalChange = getChange(inCausalOrder, entityId)!;
    const reverseChange = getChange(inReverseOrder, entityId)!;
    expect({
      createdAt: reverseChange.createdAt,
      deletedAt: reverseChange.deletedAt,
      clientId: reverseChange.clientId,
      changes: reverseChange.changes,
    }).toEqual({
      createdAt: causalChange.createdAt,
      deletedAt: causalChange.deletedAt,
      clientId: causalChange.clientId,
      changes: causalChange.changes,
    });

    const causalBeforeRetry = getChange(inCausalOrder, entityId);
    const reverseBeforeRetry = getChange(inReverseOrder, entityId);
    applyChanges(inCausalOrder, [deleted, updated, created]);
    applyChanges(inReverseOrder, [created, updated, deleted]);
    expect(getChange(inCausalOrder, entityId)).toEqual(causalBeforeRetry);
    expect(getChange(inReverseOrder, entityId)).toEqual(reverseBeforeRetry);
  });

  it("chooses the same permanent tombstone for concurrent deletes", () => {
    const entityId = "concurrent-deletes";
    const createdAt = "0000000010-0001-client";
    const created = makeIncomingCreate(entityId, "delete me", createdAt);
    const makeDelete = (deletedAt: string, clientId: string) => {
      const change = created[0]!.data[0]!.change;
      return [
        {
          tableName: "testItems",
          data: [
            {
              change: {
                ...change,
                updatedAt: deletedAt,
                deletedAt,
                clientId,
              },
            },
          ],
        },
      ] satisfies ChangesetArrayType;
    };
    const earlierDelete = makeDelete("0000000020-0001-client-a", "client-a");
    const laterDelete = makeDelete("0000000030-0001-client-b", "client-b");
    const earlierFirst = createDB();
    const laterFirst = createDB();

    for (const [db, deletes] of [
      [earlierFirst, [earlierDelete, laterDelete]],
      [laterFirst, [laterDelete, earlierDelete]],
    ] as const) {
      for (const input of deletes) {
        syncDispatch(
          db,
          mergeChanges({
            input,
            nextClock: "0000000040-0001-server",
            clientId: "server",
            registeredSyncableTableNameMap: registeredTables,
          }),
        );
      }
    }

    expect(getRow(earlierFirst, entityId)).toBeUndefined();
    expect(getRow(laterFirst, entityId)).toBeUndefined();
    expect(getChange(earlierFirst, entityId)?.deletedAt).toBe(
      "0000000030-0001-client-b",
    );
    expect(getChange(laterFirst, entityId)?.deletedAt).toBe(
      "0000000030-0001-client-b",
    );
    expect(getChange(earlierFirst, entityId)).toEqual(
      getChange(laterFirst, entityId),
    );
  });

  it("uses clientId to break ties between deletes with equal timestamps", () => {
    const entityId = "equal-delete-timestamps";
    const created = makeIncomingCreate(
      entityId,
      "delete me",
      "0000000010-0001-client",
    );
    const makeDelete = (clientId: string) => {
      const change = created[0]!.data[0]!.change;
      return [
        {
          tableName: "testItems",
          data: [
            {
              change: {
                ...change,
                updatedAt: "0000000020-0001-delete",
                deletedAt: "0000000020-0001-delete",
                clientId,
              },
            },
          ],
        },
      ] satisfies ChangesetArrayType;
    };
    const clientADelete = makeDelete("client-a");
    const clientBDelete = makeDelete("client-b");
    const clientAFirst = createDB();
    const clientBFirst = createDB();

    for (const [db, deletes] of [
      [clientAFirst, [clientADelete, clientBDelete]],
      [clientBFirst, [clientBDelete, clientADelete]],
    ] as const) {
      for (const input of deletes) {
        syncDispatch(
          db,
          mergeChanges({
            input,
            nextClock: "0000000030-0001-server",
            clientId: "server",
            registeredSyncableTableNameMap: registeredTables,
          }),
        );
      }
    }

    expect(getChange(clientAFirst, entityId)?.clientId).toBe("client-b");
    expect(getChange(clientAFirst, entityId)).toEqual(
      getChange(clientBFirst, entityId),
    );
  });

  it("does not rebroadcast a creation whose response was lost", () => {
    const db = createDB();
    const incomingCreatedAt = "0000000010-0001-remote";
    const firstServerClock = "0000000020-0001-server";
    const incoming = makeIncomingCreate(
      "retried-create",
      "created offline",
      incomingCreatedAt,
    );

    syncDispatch(
      db,
      mergeChanges({
        input: incoming,
        nextClock: firstServerClock,
        clientId: "server",
        registeredSyncableTableNameMap: registeredTables,
      }),
    );
    const changeAfterCommit = getChange(db, "retried-create");

    // The transaction committed, but the response was lost, so the client
    // sends the exact same changes again with a new server receipt clock.
    syncDispatch(
      db,
      mergeChanges({
        input: incoming,
        nextClock: "0000000030-0001-server",
        clientId: "server",
        registeredSyncableTableNameMap: registeredTables,
      }),
    );

    expect(getChange(db, "retried-create")).toEqual(changeAfterCommit);
    expect(changeAfterCommit?.createdAt).toBe(incomingCreatedAt);
    expect(changeAfterCommit?.updatedAt).toBe(firstServerClock);

    const retryChanges = runSelector(
      db,
      function* () {
        return yield* getChangesetAfter({
          after: firstServerClock,
          registeredSyncableTableNameMap: registeredTables,
        });
      },
      [],
    );
    expect(retryChanges.changesets).toEqual([]);
  });

  it("does not mint a new server clock when replaying an update", () => {
    const db = createDB();
    const entityId = "retried-update";
    const createdAt = "0000000010-0001-remote";
    localCreate(
      db,
      {
        type: "task",
        id: entityId,
        title: "before",
        orderToken: "a",
        createdAt: 100,
      },
      createdAt,
      "remote",
    );
    const incoming: ChangesetArrayType = [
      {
        tableName: "testItems",
        data: [
          {
            row: {
              type: "task",
              id: entityId,
              title: "after",
              orderToken: "a",
              createdAt: 100,
            },
            change: {
              id: `testItems:${entityId}`,
              entityId,
              tableName: "testItems",
              createdAt,
              updatedAt: "0000000020-0001-remote",
              deletedAt: null,
              clientId: "remote",
              changes: {
                type: createdAt,
                id: createdAt,
                title: "0000000020-0001-remote",
                orderToken: createdAt,
                createdAt,
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
        nextClock: "0000000030-0001-server",
        clientId: "server",
        registeredSyncableTableNameMap: registeredTables,
      }),
    );
    const changeAfterCommit = getChange(db, entityId);

    syncDispatch(
      db,
      mergeChanges({
        input: incoming,
        nextClock: "0000000040-0001-server",
        clientId: "server",
        registeredSyncableTableNameMap: registeredTables,
      }),
    );

    expect(getRow(db, entityId)?.title).toBe("after");
    expect(getChange(db, entityId)).toEqual(changeAfterCommit);
  });

  it("does not mint a new server clock when replaying a deletion", () => {
    const db = createDB();
    const entityId = "retried-delete";
    const createdAt = "0000000010-0001-remote";
    const row = {
      type: "task",
      id: entityId,
      title: "delete me",
      orderToken: "a",
      createdAt: 100,
    };
    localCreate(db, row, createdAt, "remote");
    const incoming = makeIncomingCreate(
      entityId,
      row.title,
      createdAt,
      "0000000020-0001-remote",
    );

    syncDispatch(
      db,
      mergeChanges({
        input: incoming,
        nextClock: "0000000030-0001-server",
        clientId: "server",
        registeredSyncableTableNameMap: registeredTables,
      }),
    );
    const changeAfterCommit = getChange(db, entityId);

    syncDispatch(
      db,
      mergeChanges({
        input: incoming,
        nextClock: "0000000040-0001-server",
        clientId: "server",
        registeredSyncableTableNameMap: registeredTables,
      }),
    );

    expect(getRow(db, entityId)).toBeUndefined();
    expect(getChange(db, entityId)).toEqual(changeAfterCommit);
  });

  it("ignores an incoming update already superseded by local state", () => {
    const db = createDB();
    const entityId = "superseded-update";
    const createdAt = "0000000010-0001-local";
    const currentTitleClock = "0000000030-0001-local";
    const row = {
      type: "task",
      id: entityId,
      title: "newer local title",
      orderToken: "a",
      createdAt: 100,
    };
    localCreate(db, row, createdAt, "local");
    const currentChange = getChange(db, entityId)!;
    syncDispatch(
      db,
      action({
        name: "recordNewerLocalTitle",
        args: {},
        handler: function* () {
          yield* upsert(changesTable, [
            {
              ...currentChange,
              updatedAt: currentTitleClock,
              changes: {
                ...currentChange.changes,
                title: currentTitleClock,
              },
            },
          ]);
        },
      })({}),
    );
    const changeBeforeMerge = getChange(db, entityId);
    const staleIncoming: ChangesetArrayType = [
      {
        tableName: "testItems",
        data: [
          {
            row: { ...row, title: "stale remote title" },
            change: {
              ...changeBeforeMerge!,
              clientId: "remote",
              updatedAt: "0000000020-0001-remote",
              changes: {
                ...changeBeforeMerge!.changes,
                title: "0000000020-0001-remote",
              },
            },
          },
        ],
      },
    ];

    syncDispatch(
      db,
      mergeChanges({
        input: staleIncoming,
        nextClock: "0000000040-0001-server",
        clientId: "server",
        registeredSyncableTableNameMap: registeredTables,
      }),
    );

    expect(getRow(db, entityId)).toEqual(row);
    expect(getChange(db, entityId)).toEqual(changeBeforeMerge);
  });
});
