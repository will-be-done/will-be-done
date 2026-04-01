import { describe, expect, it } from "vitest";
import {
  DB,
  execSync,
  syncDispatch,
  runSelector,
  runQuery,
  insert,
  action,
  selector,
  selectFrom,
  table,
  Row,
} from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/src/hyperdb/drivers/bptree-inmem-driver";
import {
  changesSlice,
  changesTable,
  type Change,
  type ChangesetArrayType,
} from "./changes";

// A simple test table
const testTable = table<{
  type: string;
  id: string;
  title: string;
  orderToken: string;
  createdAt: number;
}>("testItems").withIndexes({
  byId: { cols: ["id"], type: "hash" },
});

function createDB() {
  const driver = new BptreeInmemDriver();
  const db = new DB(driver, [], []);
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
  row: { type: string; id: string; title: string; orderToken: string; createdAt: number },
  createdAtClock: string,
) {
  syncDispatch(
    db,
    action(function* () {
      yield* insert(testTable, [row]);
      yield* insert(changesTable, [
        {
          id: `testItems:${row.id}`,
          entityId: row.id,
          tableName: "testItems",
          createdAt: createdAtClock,
          updatedAt: createdAtClock,
          deletedAt: null,
          clientId: "local",
          changes: {
            type: createdAtClock,
            id: createdAtClock,
            title: createdAtClock,
            orderToken: createdAtClock,
            createdAt: createdAtClock,
          },
        } satisfies Change,
      ]);
    })(),
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

const getRowSelector = selector(function* (id: string) {
  const rows = yield* runQuery(
    selectFrom(testTable, "byId")
      .where((q) => q.eq("id", id))
      .limit(1),
  );
  return rows[0] as Row | undefined;
});

const getChangeSelector = selector(function* (entityId: string) {
  const changes = yield* runQuery(
    selectFrom(changesTable, "byEntityIdAndTableName")
      .where((q) =>
        q.eq("entityId", entityId).eq("tableName", "testItems"),
      )
      .limit(1),
  );
  return changes[0] as Change | undefined;
});

function getRow(db: DB, id: string) {
  return runSelector<Row | undefined>(
    db,
    function* () {
      return yield* getRowSelector(id);
    },
    [],
  );
}

function getChange(db: DB, entityId: string) {
  return runSelector<Change | undefined>(
    db,
    function* () {
      return yield* getChangeSelector(entityId);
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
      { type: "task", id: entityId, title: "client1-title", orderToken: "a", createdAt: 100 },
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
      changesSlice.mergeChanges(
        incoming,
        makeClockFn("0000000030"),
        "local",
        registeredTables,
      ),
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
      { type: "task", id: entityId, title: "client2-title", orderToken: "a", createdAt: 100 },
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
      changesSlice.mergeChanges(
        incoming,
        makeClockFn("0000000030"),
        "local",
        registeredTables,
      ),
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
      { type: "task", id: entityId, title: "client1-title", orderToken: "a", createdAt: 100 },
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
      changesSlice.mergeChanges(
        incoming,
        makeClockFn("0000000040"),
        "local",
        registeredTables,
      ),
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
      { type: "task", id: entityId, title: "client1-title", orderToken: "a", createdAt: 100 },
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
      changesSlice.mergeChanges(
        incoming,
        makeClockFn("0000000030"),
        "local",
        registeredTables,
      ),
    );

    const row = getRow(db, entityId);
    expect(row).toBeUndefined(); // deleted

    const change = getChange(db, entityId);
    expect(change).toBeDefined();
    expect(change!.deletedAt).not.toBeNull();
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
      changesSlice.mergeChanges(
        incoming,
        makeClockFn("0000000020"),
        "local",
        registeredTables,
      ),
    );

    const row = getRow(db, entityId);
    expect(row).toBeDefined();
    expect(row!.title).toBe("remote-title"); // inserted as-is
  });

  it("normal update sync is not blocked by FCW guard (same createdAt)", () => {
    resetClock();
    const db = createDB();
    const entityId = "entity-6";
    const sharedCreatedAt = "0000000010-0001-client1";

    // Both sides share the same entity with the same createdAt (synced earlier)
    localCreate(
      db,
      { type: "task", id: entityId, title: "original", orderToken: "a", createdAt: 100 },
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
      changesSlice.mergeChanges(
        incoming,
        makeClockFn("0000000030"),
        "local",
        registeredTables,
      ),
    );

    const row = getRow(db, entityId);
    expect(row).toBeDefined();
    expect(row!.title).toBe("updated-by-remote"); // update must not be dropped
  });
});
