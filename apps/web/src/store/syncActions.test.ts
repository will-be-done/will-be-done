import { describe, expect, it } from "vitest";
import {
  createAction,
  DB,
  defineTable,
  execSync,
  selectFrom,
  selectSync,
  syncDispatch,
  upsert,
  v,
} from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import {
  changesTable,
  formatHlc,
  getSyncStateOrDefault,
  syncStateTable,
  type Change,
} from "@will-be-done/slices/common";
import {
  cleanupStaleSyncV4Transfers,
  createApplySyncV4Download,
  discardSyncV4Transfer,
} from "./syncActions";
import { clientSyncV4Tables } from "./syncV4Tables";
import {
  clientSyncDownloadChunksTable,
  clientSyncDownloadSessionsTable,
  clientSyncUploadSessionsTable,
} from "./syncV4Tables";

const itemsTable = defineTable("test_sync_items", {
  id: v.string(),
  title: v.string(),
});
const seed = createAction();
const clock = (logical: number) =>
  formatHlc({ physical: 1_700_000_000_000, logical, actorId: "client" });

const createDb = () => {
  const db = new DB(new BptreeInmemDriver());
  execSync(
    db.loadTables([
      itemsTable,
      changesTable,
      syncStateTable,
      ...clientSyncV4Tables,
    ]),
  );
  return db;
};

describe("sync v4 client actions", () => {
  it("skips a stale download and lets the caller discard both transfers", () => {
    const db = createDb();
    const localChange: Change = {
      id: "test_sync_items:local",
      entityId: "local",
      tableName: "test_sync_items",
      createdAt: clock(5),
      updatedAt: clock(5),
      deletedAt: null,
      clientId: "client",
      changes: { id: clock(5), title: clock(5) },
    };
    syncDispatch(
      db,
      seed({
        name: "seedStaleSyncDownload",
        args: {},
        handler: function* () {
          yield* upsert(changesTable, [localChange]);
          yield* upsert(clientSyncUploadSessionsTable, [
            {
              id: "upload",
              throughClock: clock(5),
              throughChangeId: localChange.id,
              changeCount: 1,
              chunkCount: 0,
              createdAt: 1,
            },
          ]);
          yield* upsert(clientSyncDownloadSessionsTable, [
            {
              id: "download",
              serverRevision: 1,
              acceptedClientClock: clock(4),
              acceptedClientChangeId: "test_sync_items:accepted",
              chunkCount: 0,
              createdAt: 1,
            },
          ]);
        },
      })({}),
    );

    const apply = createApplySyncV4Download(() => clock(6));
    expect(
      syncDispatch(
        db,
        apply({
          downloadId: "download",
          uploadId: "upload",
          registeredSyncableTableNameMap: {
            test_sync_items: itemsTable,
          },
          clientId: "client",
        }),
      ),
    ).toBe(false);

    syncDispatch(
      db,
      discardSyncV4Transfer({ uploadId: "upload", downloadId: "download" }),
    );
    expect(
      selectSync(db, {
        selector: getSyncStateOrDefault,
        args: {},
      }).lastServerAppliedRevision,
    ).toBeUndefined();
    const sessions = syncDispatch(
      db,
      seed({
        name: "readDiscardedSyncSessions",
        args: {},
        handler: function* () {
          return {
            upload: yield* selectFrom(clientSyncUploadSessionsTable, "byId")
              .where((q) => q.eq("id", "upload"))
              .first(),
            download: yield* selectFrom(clientSyncDownloadSessionsTable, "byId")
              .where((q) => q.eq("id", "download"))
              .first(),
          };
        },
      })({}),
    );
    expect(sessions).toEqual({ upload: undefined, download: undefined });
  });

  it("persists the maximum locally covered cursor after applying a download", () => {
    const db = createDb();
    const incoming = [
      {
        tableName: "test_sync_items",
        data: [
          {
            row: { id: "one", title: "One" },
            change: {
              id: "test_sync_items:one",
              entityId: "one",
              tableName: "test_sync_items",
              createdAt: clock(1),
              updatedAt: clock(1),
              deletedAt: null,
              clientId: "server",
              changes: { id: clock(1), title: clock(1) },
            },
          },
          {
            row: { id: "two", title: "Two" },
            change: {
              id: "test_sync_items:two",
              entityId: "two",
              tableName: "test_sync_items",
              createdAt: clock(2),
              updatedAt: clock(2),
              deletedAt: null,
              clientId: "server",
              changes: { id: clock(2), title: clock(2) },
            },
          },
        ],
      },
    ];
    syncDispatch(
      db,
      seed({
        name: "seedApplicableSyncDownload",
        args: {},
        handler: function* () {
          yield* upsert(clientSyncUploadSessionsTable, [
            {
              id: "upload",
              throughClock: null,
              throughChangeId: null,
              changeCount: 0,
              chunkCount: 0,
              createdAt: 1,
            },
          ]);
          yield* upsert(clientSyncDownloadSessionsTable, [
            {
              id: "download",
              serverRevision: 2,
              acceptedClientClock: null,
              acceptedClientChangeId: null,
              chunkCount: 1,
              createdAt: 1,
            },
          ]);
          yield* upsert(clientSyncDownloadChunksTable, [
            {
              id: "download:0",
              downloadId: "download",
              sequence: 0,
              payload: JSON.stringify(incoming),
            },
          ]);
        },
      })({}),
    );
    const generated = [clock(10), clock(9)];
    const apply = createApplySyncV4Download(() => generated.shift()!);

    expect(
      syncDispatch(
        db,
        apply({
          downloadId: "download",
          uploadId: "upload",
          registeredSyncableTableNameMap: {
            test_sync_items: itemsTable,
          },
          clientId: "client",
        }),
      ),
    ).toBe(true);
    expect(
      selectSync(db, { selector: getSyncStateOrDefault, args: {} }),
    ).toMatchObject({
      lastSentClock: clock(10),
      lastSentChangeId: "test_sync_items:one",
      localCoveredClientClock: clock(10),
      localCoveredClientChangeId: "test_sync_items:one",
      lastServerAppliedRevision: 2,
    });
  });

  it("cleans stale download sessions without removing active ones", () => {
    const db = createDb();
    syncDispatch(
      db,
      seed({
        name: "seedStaleAndActiveDownloads",
        args: {},
        handler: function* () {
          yield* upsert(clientSyncDownloadSessionsTable, [
            {
              id: "stale",
              serverRevision: 1,
              acceptedClientClock: null,
              acceptedClientChangeId: null,
              chunkCount: 1,
              createdAt: 10,
            },
            {
              id: "active",
              serverRevision: 2,
              acceptedClientClock: null,
              acceptedClientChangeId: null,
              chunkCount: 1,
              createdAt: 20,
            },
          ]);
          yield* upsert(clientSyncDownloadChunksTable, [
            {
              id: "stale:0",
              downloadId: "stale",
              sequence: 0,
              payload: "[]",
            },
            {
              id: "active:0",
              downloadId: "active",
              sequence: 0,
              payload: "[]",
            },
          ]);
        },
      })({}),
    );

    expect(
      syncDispatch(db, cleanupStaleSyncV4Transfers({ createdBefore: 15 })),
    ).toEqual({ uploads: 0, downloads: 1 });
    const sessions = syncDispatch(
      db,
      seed({
        name: "readCleanedDownloads",
        args: {},
        handler: function* () {
          return yield* selectFrom(
            clientSyncDownloadSessionsTable,
            "byCreatedAtId",
          );
        },
      })({}),
    );
    expect(sessions.map((session) => session.id)).toEqual(["active"]);
  });
});
