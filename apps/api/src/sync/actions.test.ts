import { describe, expect, test } from "bun:test";
import {
  DB,
  createSelector,
  createAction,
  execSync,
  selectFrom,
  selectSync,
  SubscribableDB,
  syncDispatch,
  upsert,
} from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import { changesTable, formatHlc } from "@will-be-done/slices/common";
import { spacesTable } from "@will-be-done/slices/user";
import {
  commitSyncUpload,
  initializeServerSyncFeed,
  recordServerChanges,
  stageUploadChunk,
  startSyncUpload,
} from "./actions";
import {
  SERVER_SYNC_STATE_ID,
  serverClientSyncStateTable,
  serverSyncStateTable,
  serverSyncTables,
} from "./tables";

const clock = (logical: number, actorId = "client") =>
  formatHlc({ physical: 1_700_000_000_000, logical, actorId });
const selector = createSelector();
const testAction = createAction();
const seedRestoredSyncState = testAction({
  name: "seedRestoredSyncState",
  args: {},
  handler: function* () {
    yield* upsert(serverSyncStateTable, [
      { id: SERVER_SYNC_STATE_ID, currentRevision: 5 },
    ]);
    yield* upsert(serverClientSyncStateTable, [
      {
        id: "client-1",
        acceptedClientClock: clock(5),
        acceptedClientChangeId: "change-5",
        acknowledgedServerRevision: 5,
        lastSeenAt: 0,
      },
    ]);
  },
});
const getTestSpace = selector({
  name: "getTestSpace",
  args: {},
  handler: function* () {
    return yield* selectFrom(spacesTable, "byId")
      .where((q) => q.eq("id", "space-1"))
      .first();
  },
});

describe("sync v4 actions", () => {
  test("asks for incremental resend when the restored server cursor is behind", () => {
    const db = new DB(new BptreeInmemDriver());
    execSync(db.loadTables([...serverSyncTables]));
    syncDispatch(db, seedRestoredSyncState({}));

    const session = syncDispatch(
      db,
      startSyncUpload({
        userId: "user-1",
        request: {
          syncVersion: 4,
          dbId: "user-1",
          dbType: "user",
          clientId: "client-1",
          expectedAcceptedClientCursor: {
            clock: clock(8),
            changeId: "change-8",
          },
          coveredClientCursor: {
            clock: clock(10),
            changeId: "change-10",
          },
          expectedAcknowledgedServerRevision: 8,
          appliedServerRevision: 8,
        },
        now: 1,
        expiresAt: 10_000,
      }),
    );

    expect(session.serverHistoryLost).toBe(true);
    expect(session.uploadFromCursor).toEqual({
      clock: clock(5),
      changeId: "change-5",
    });
    expect(session.downloadFromRevision).toBe(5);
  });

  test("commits an upload and suppresses its exact canonical echo", () => {
    const db = new SubscribableDB(new DB(new BptreeInmemDriver()));
    execSync(db.loadTables([spacesTable, changesTable, ...serverSyncTables]));
    db.afterUpsert(function* (_db, table, _traits, ops) {
      if (table !== changesTable || ops.length === 0) return;
      yield* recordServerChanges({
        changes: ops.map((op) => op.newValue as never),
      });
    });
    syncDispatch(db, initializeServerSyncFeed({}));

    const session = syncDispatch(
      db,
      startSyncUpload({
        userId: "user-1",
        request: {
          syncVersion: 4,
          dbId: "user-1",
          dbType: "user",
          clientId: "client-1",
          expectedAcceptedClientCursor: null,
          coveredClientCursor: null,
          expectedAcknowledgedServerRevision: 0,
          appliedServerRevision: 0,
        },
        now: 1,
        expiresAt: 10_000,
      }),
    );
    const row = {
      id: "space-1",
      type: "space" as const,
      name: "One",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const change = {
      id: "spaces:space-1",
      entityId: "space-1",
      tableName: "spaces",
      createdAt: clock(0),
      updatedAt: clock(0),
      deletedAt: null,
      clientId: "client-1",
      changes: Object.fromEntries(
        Object.keys(row).map((key) => [key, clock(0)]),
      ),
    };
    syncDispatch(
      db,
      stageUploadChunk({
        uploadId: session.uploadId,
        sequence: 0,
        byteCount: 100,
        chunk: {
          checksum: "chunk",
          changesets: [{ tableName: "spaces", data: [{ row, change }] }],
        },
        tableNameMap: { spaces: spacesTable },
        tableRanks: { spaces: 0 },
        maxSessionBytes: 1_000,
        now: 2,
      }),
    );
    const result = syncDispatch(
      db,
      commitSyncUpload({
        uploadId: session.uploadId,
        userId: "user-1",
        request: {
          chunkCount: 1,
          changeCount: 1,
          throughCursor: { clock: clock(0), changeId: change.id },
          checksum: "manifest",
        },
        registeredSyncableTableNameMap: { spaces: spacesTable },
        orderedTableNames: ["spaces"],
        dbType: "user",
        serverClientId: "server",
        nextClock: clock(1, "server"),
        now: 3,
        expiresAt: 10_000,
      }),
    );

    expect(result.acceptedClientCursor).toEqual({
      clock: clock(0),
      changeId: change.id,
    });
    expect(result.serverRevision).toBe(1);
    expect(result.download).toEqual({ type: "inline", changesets: [] });
    expect(
      selectSync(db, {
        selector: getTestSpace,
        args: {},
      }),
    ).toEqual(row);
  });
});
