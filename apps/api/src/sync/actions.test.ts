import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";
import {
  DB,
  createSelector,
  createAction,
  execSync,
  noop,
  selectFrom,
  selectSync,
  SubscribableDB,
  syncDispatch,
  upsert,
  v,
} from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import { changesTable, formatHlc } from "@will-be-done/slices/common";
import { spacesTable } from "@will-be-done/slices/user";
import {
  acknowledgeDownload,
  cleanupExpiredSyncSessions,
  commitSyncUpload,
  getDownloadChunk,
  getSyncStagingMetrics,
  initializeServerSyncFeed,
  stageUploadChunk,
  startSyncUpload,
} from "./actions";
import { installServerChangeFeedHook } from "../db/db";
import {
  SERVER_SYNC_STATE_ID,
  serverClientSyncStateTable,
  syncDownloadChunksTable,
  syncDownloadSessionsTable,
  syncUploadChunksTable,
  syncUploadItemsTable,
  syncUploadSessionsTable,
  serverSyncStateTable,
  serverSyncTables,
} from "./tables";

const clock = (logical: number, actorId = "client") =>
  formatHlc({ physical: 1_700_000_000_000, logical, actorId });
const CLOCK_TIME_MS = 1_700_000_000_000;
const selector = createSelector();
const testAction = createAction();
const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");
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
const seedChanges = testAction({
  name: "seedSyncChanges",
  args: {
    rows: v.pass<Parameters<typeof upsert<typeof spacesTable>>[1]>(),
    changes: v.pass<Parameters<typeof upsert<typeof changesTable>>[1]>(),
  },
  handler: function* ({ rows, changes }) {
    yield* upsert(spacesTable, rows);
    yield* upsert(changesTable, changes);
  },
});
const getDownloadChunks = selector({
  name: "getDownloadChunks",
  args: { downloadId: v.string() },
  handler: function* ({ downloadId }) {
    return yield* selectFrom(syncDownloadChunksTable, "byDownloadSequence")
      .where((q) => q.eq("downloadId", downloadId))
      .order("asc");
  },
});

const seedStagingMetricSessions = testAction({
  name: "seedStagingMetricSessions",
  args: {},
  handler: function* () {
    yield* upsert(
      syncUploadSessionsTable,
      Array.from({ length: 300 }, (_, index) => ({
        id: `upload-${index.toString().padStart(3, "0")}`,
        userId: "user-1",
        clientId: "client-1",
        baseClientClock: null,
        baseClientChangeId: null,
        downloadFromRevision: 0,
        status: "uploading" as const,
        expiresAt: 10_000,
        uploadedChangeCount: 0,
        uploadedByteCount: index + 1,
        maxObservedClock: null,
        maxClientClock: null,
        maxClientChangeId: null,
        resultJson: null,
      })),
    );
    yield* upsert(
      syncDownloadSessionsTable,
      Array.from({ length: 300 }, (_, index) => ({
        id: `download-${index.toString().padStart(3, "0")}`,
        userId: "user-1",
        clientId: "client-1",
        serverRevision: 1,
        chunkCount: 1,
        changeCount: 1,
        checksum: "checksum",
        stagedByteCount: (index + 1) * 2,
        status: "available" as const,
        expiresAt: 10_000,
      })),
    );
  },
});

const seedExpiredTransfers = testAction({
  name: "seedExpiredSyncTransfers",
  args: {},
  handler: function* () {
    yield* upsert(syncUploadSessionsTable, [
      {
        id: "expired-upload",
        userId: "user-1",
        clientId: "client-1",
        baseClientClock: null,
        baseClientChangeId: null,
        downloadFromRevision: 0,
        status: "uploading",
        expiresAt: 1,
        uploadedChangeCount: 2,
        uploadedByteCount: 20,
        maxObservedClock: null,
        maxClientClock: null,
        maxClientChangeId: null,
        resultJson: null,
      },
    ]);
    yield* upsert(
      syncUploadChunksTable,
      [0, 1].map((sequence) => ({
        id: `expired-upload:${sequence}`,
        uploadId: "expired-upload",
        sequence,
        checksum: `checksum-${sequence}`,
        changeCount: 1,
        byteCount: 10,
      })),
    );
    yield* upsert(
      syncUploadItemsTable,
      [0, 1].map((sequence) => ({
        id: `expired-upload:0:${sequence}`,
        uploadId: "expired-upload",
        sequence,
        tableName: "spaces",
        entityId: `space-${sequence}`,
        changeId: `spaces:space-${sequence}`,
        payload: "{}",
        checksum: "checksum",
      })),
    );
    yield* upsert(syncDownloadSessionsTable, [
      {
        id: "expired-download",
        userId: "user-1",
        clientId: "client-1",
        serverRevision: 1,
        chunkCount: 2,
        changeCount: 2,
        checksum: "checksum",
        stagedByteCount: 20,
        status: "available",
        expiresAt: 1,
      },
    ]);
    yield* upsert(
      syncDownloadChunksTable,
      [0, 1].map((sequence) => ({
        id: `expired-download:${sequence}`,
        downloadId: "expired-download",
        sequence,
        payload: "[]",
        checksum: `checksum-${sequence}`,
      })),
    );
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

  test("keeps the server acknowledgement when the client applied revision rolls back", () => {
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
            clock: clock(5),
            changeId: "change-5",
          },
          coveredClientCursor: {
            clock: clock(5),
            changeId: "change-5",
          },
          expectedAcknowledgedServerRevision: 5,
          appliedServerRevision: 2,
        },
        now: 1,
        expiresAt: 10_000,
      }),
    );

    expect(session.serverHistoryLost).toBe(false);
    expect(session.serverAhead).toBe(true);
    expect(session.downloadFromRevision).toBe(2);
    expect(session.serverAcknowledgedRevision).toBe(5);
  });

  test("commits an upload and suppresses its exact canonical echo", () => {
    const db = new SubscribableDB(new DB(new BptreeInmemDriver()));
    execSync(db.loadTables([spacesTable, changesTable, ...serverSyncTables]));
    syncDispatch(db, initializeServerSyncFeed({}));
    installServerChangeFeedHook(db);

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
        now: CLOCK_TIME_MS,
        expiresAt: CLOCK_TIME_MS + 10_000,
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
        userId: "user-1",
        sequence: 0,
        byteCount: 100,
        chunk: {
          checksum: "chunk",
          changesets: [{ tableName: "spaces", data: [{ row, change }] }],
        },
        tableNameMap: { spaces: spacesTable },
        now: CLOCK_TIME_MS + 1,
      }),
    );
    const result = syncDispatch(
      db.withTraits({ type: "skip-sync" }),
      commitSyncUpload({
        uploadId: session.uploadId,
        userId: "user-1",
        request: {
          chunkCount: 1,
          changeCount: 1,
          throughCursor: { clock: clock(0), changeId: change.id },
          checksum: sha256("chunk"),
        },
        registeredSyncableTableNameMap: { spaces: spacesTable },
        orderedTableNames: ["spaces"],
        dbType: "user",
        serverClientId: "server",
        nextClock: clock(1, "server"),
        now: CLOCK_TIME_MS + 2,
        expiresAt: CLOCK_TIME_MS + 10_000,
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

  test("returns a canonical correction even when it predates the feed cursor", () => {
    const db = new SubscribableDB(new DB(new BptreeInmemDriver()));
    execSync(db.loadTables([spacesTable, changesTable, ...serverSyncTables]));
    const serverRow = {
      id: "space-1",
      type: "space" as const,
      name: "Server",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const serverChange = {
      id: "spaces:space-1",
      entityId: "space-1",
      tableName: "spaces",
      createdAt: clock(10, "server"),
      updatedAt: clock(10, "server"),
      deletedAt: null,
      clientId: "server",
      changes: Object.fromEntries(
        Object.keys(serverRow).map((key) => [key, clock(10, "server")]),
      ),
    };
    syncDispatch(
      db,
      seedChanges({ rows: [serverRow], changes: [serverChange] }),
    );
    expect(syncDispatch(db, initializeServerSyncFeed({}))).toBe(1);
    installServerChangeFeedHook(db);

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
          appliedServerRevision: 1,
        },
        now: CLOCK_TIME_MS,
        expiresAt: CLOCK_TIME_MS + 10_000,
      }),
    );
    const clientRow = { ...serverRow, name: "Client" };
    const clientChange = {
      ...serverChange,
      updatedAt: clock(0),
      clientId: "client-1",
      changes: Object.fromEntries(
        Object.keys(clientRow).map((key) => [key, clock(0)]),
      ),
    };
    syncDispatch(
      db,
      stageUploadChunk({
        uploadId: session.uploadId,
        userId: "user-1",
        sequence: 0,
        byteCount: 100,
        chunk: {
          checksum: "chunk",
          changesets: [
            {
              tableName: "spaces",
              data: [{ row: clientRow, change: clientChange }],
            },
          ],
        },
        tableNameMap: { spaces: spacesTable },
        now: CLOCK_TIME_MS + 1,
      }),
    );

    const result = syncDispatch(
      db.withTraits({ type: "skip-sync" }),
      commitSyncUpload({
        uploadId: session.uploadId,
        userId: "user-1",
        request: {
          chunkCount: 1,
          changeCount: 1,
          throughCursor: { clock: clock(0), changeId: clientChange.id },
          checksum: sha256("chunk"),
        },
        registeredSyncableTableNameMap: { spaces: spacesTable },
        orderedTableNames: ["spaces"],
        dbType: "user",
        serverClientId: "server",
        nextClock: clock(11, "server"),
        now: CLOCK_TIME_MS + 2,
        expiresAt: CLOCK_TIME_MS + 10_000,
      }),
    );

    expect(result.serverRevision).toBe(1);
    expect(result.download.type).toBe("inline");
    if (result.download.type !== "inline") throw new Error("Expected inline");
    expect(result.download.changesets).toHaveLength(1);
    expect(result.download.changesets[0]?.data[0]).toEqual({
      row: serverRow,
      change: serverChange,
    });
  });

  test("commits a zero-change upload with a null cursor", () => {
    const db = new DB(new BptreeInmemDriver());
    execSync(db.loadTables([spacesTable, changesTable, ...serverSyncTables]));
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

    const result = syncDispatch(
      db,
      commitSyncUpload({
        uploadId: session.uploadId,
        userId: "user-1",
        request: {
          chunkCount: 0,
          changeCount: 0,
          throughCursor: null,
          checksum: sha256(""),
        },
        registeredSyncableTableNameMap: { spaces: spacesTable },
        orderedTableNames: ["spaces"],
        dbType: "user",
        serverClientId: "server",
        nextClock: clock(1, "server"),
        now: 2,
        expiresAt: 10_000,
      }),
    );

    expect(result).toEqual({
      acceptedClientCursor: null,
      serverRevision: 0,
      download: { type: "inline", changesets: [] },
    });
  });

  test("initializes and stages an oversized download in bounded feed pages", () => {
    const db = new DB(new BptreeInmemDriver());
    execSync(db.loadTables([spacesTable, changesTable, ...serverSyncTables]));
    const sharedClock = clock(0);
    const rows = Array.from({ length: 257 }, (_, index) => ({
      id: `space-${index.toString().padStart(3, "0")}`,
      type: "space" as const,
      name: `Space ${index}`,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }));
    const changes = rows.map((row) => ({
      id: `spaces:${row.id}`,
      entityId: row.id,
      tableName: "spaces",
      createdAt: sharedClock,
      updatedAt: sharedClock,
      deletedAt: null,
      clientId: "remote",
      changes: Object.fromEntries(
        Object.keys(row).map((key) => [key, sharedClock]),
      ),
    }));
    syncDispatch(db, seedChanges({ rows, changes }));
    expect(syncDispatch(db, initializeServerSyncFeed({}))).toBe(1);

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
    const result = syncDispatch(
      db,
      commitSyncUpload({
        uploadId: session.uploadId,
        userId: "user-1",
        request: {
          chunkCount: 0,
          changeCount: 0,
          throughCursor: null,
          checksum: sha256(""),
        },
        registeredSyncableTableNameMap: { spaces: spacesTable },
        orderedTableNames: ["spaces"],
        dbType: "user",
        serverClientId: "server",
        nextClock: clock(1, "server"),
        now: 2,
        expiresAt: 10_000,
      }),
    );

    expect(result.download.type).toBe("staged");
    if (result.download.type !== "staged") throw new Error("Expected staged");
    expect(result.download.changeCount).toBe(257);
    expect(result.download.chunkCount).toBe(2);
    const chunks = selectSync(db, {
      selector: getDownloadChunks,
      args: { downloadId: result.download.downloadId },
    });
    expect(chunks).toHaveLength(2);
    expect(result.download.checksum).toBe(
      sha256(chunks.map((chunk) => chunk.checksum).join("\n")),
    );
  });

  test("limits active upload sessions for one user and client", () => {
    const db = new DB(new BptreeInmemDriver());
    execSync(db.loadTables([...serverSyncTables]));
    const start = () =>
      syncDispatch(
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

    for (let index = 0; index < 8; index += 1) start();
    expect(start).toThrow(
      "Too many active sync upload sessions for this client",
    );
  });

  test("accumulates staging metrics through bounded index pages", () => {
    const db = new SubscribableDB(new DB(new BptreeInmemDriver()));
    execSync(db.loadTables([...serverSyncTables]));
    syncDispatch(db, seedStagingMetricSessions({}));
    const pageSizes: number[] = [];
    db.afterScan(function* (_db, table, indexName, _clauses, _options, rows) {
      if (
        (table === syncUploadSessionsTable ||
          table === syncDownloadSessionsTable) &&
        indexName === "byExpiresAtId"
      ) {
        pageSizes.push(rows.length);
      }
      yield* noop();
    });

    expect(syncDispatch(db, getSyncStagingMetrics({}))).toEqual({
      uploadBytes: 45_150,
      downloadBytes: 90_300,
      totalBytes: 135_450,
    });
    expect(pageSizes.filter((size) => size > 0).length).toBeGreaterThan(2);
    expect(pageSizes.every((size) => size <= 257)).toBe(true);
  });

  test("acknowledges downloads and cleans transfer rows within a row budget", () => {
    const db = new DB(new BptreeInmemDriver());
    execSync(db.loadTables([...serverSyncTables]));
    syncDispatch(db, seedExpiredTransfers({}));

    expect(
      syncDispatch(
        db,
        getDownloadChunk({
          downloadId: "expired-download",
          sequence: 0,
          userId: "user-1",
          now: 0,
        }),
      ),
    ).toBeTruthy();
    expect(
      syncDispatch(
        db,
        acknowledgeDownload({
          downloadId: "expired-download",
          userId: "user-1",
        }),
      ),
    ).toBe(true);
    expect(() =>
      syncDispatch(
        db,
        getDownloadChunk({
          downloadId: "expired-download",
          sequence: 0,
          userId: "user-1",
          now: 0,
        }),
      ),
    ).toThrow("Sync download session is not active");

    let hasMore = true;
    let passes = 0;
    while (hasMore && passes < 10) {
      const cleaned = syncDispatch(
        db,
        cleanupExpiredSyncSessions({ now: 2, maxRows: 2 }),
      );
      expect(cleaned.deletedRows).toBeLessThanOrEqual(2);
      hasMore = cleaned.hasMore;
      passes += 1;
    }
    expect(passes).toBeGreaterThan(1);
    expect(syncDispatch(db, getSyncStagingMetrics({}))).toEqual({
      uploadBytes: 0,
      downloadBytes: 0,
      totalBytes: 0,
    });
  });
});
