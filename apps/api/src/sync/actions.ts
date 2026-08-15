import {
  deleteRows,
  insert,
  selectFrom,
  upsert,
  v,
  type TableDefinition,
} from "@will-be-done/hyperdb";
import {
  changesTable,
  compareClientCursor,
  maxClientCursor,
  type ClientCursor,
  type SyncSessionRequest,
  type SyncUploadChunk,
  type Change,
  maxHlc,
  observedChangeClocks,
  clientCursorFromChange,
  type SyncCommitRequest,
  type SyncCommitResponse,
  type ChangesetArrayType,
  SYNC_V4_INLINE_DOWNLOAD_BYTES,
  SYNC_V4_INLINE_DOWNLOAD_CHANGES,
} from "@will-be-done/slices/common";
import { action } from "@will-be-done/slices";
import { mergeSpaceChanges } from "@will-be-done/slices/space";
import { mergeChanges } from "@will-be-done/slices/common";
import { uuidv7 } from "uuidv7";
import { isDeepStrictEqual } from "node:util";
import { createHash } from "node:crypto";
import {
  SERVER_SYNC_STATE_ID,
  serverChangeFeedTable,
  serverClientSyncStateTable,
  serverSyncStateTable,
  syncDownloadChunksTable,
  syncDownloadSessionsTable,
  syncUploadChunksTable,
  syncUploadItemsTable,
  syncUploadSessionsTable,
  type ServerClientSyncState,
  type SyncUploadSession,
  type ServerChangeFeed,
} from "./tables";

export const cursorFromServerState = (
  state: ServerClientSyncState | undefined,
): ClientCursor | null =>
  state?.acceptedClientClock && state.acceptedClientChangeId
    ? {
        clock: state.acceptedClientClock,
        changeId: state.acceptedClientChangeId,
      }
    : null;

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

const cursorColumns = (cursor: ClientCursor | null) => ({
  acceptedClientClock: cursor?.clock ?? null,
  acceptedClientChangeId: cursor?.changeId ?? null,
});

export const getServerSyncState = action({
  name: "getServerSyncStateV4",
  args: { clientId: v.string() },
  handler: function* ({ clientId }) {
    const server = yield* selectFrom(serverSyncStateTable, "byId")
      .where((q) => q.eq("id", SERVER_SYNC_STATE_ID))
      .first();
    const client = yield* selectFrom(serverClientSyncStateTable, "byId")
      .where((q) => q.eq("id", clientId))
      .first();
    return {
      currentRevision: server?.currentRevision ?? 0,
      client: client as ServerClientSyncState | undefined,
    };
  },
});

export const initializeServerSyncFeed = action({
  name: "initializeServerSyncFeedV4",
  args: {},
  handler: function* () {
    const existing = yield* selectFrom(serverSyncStateTable, "byId")
      .where((q) => q.eq("id", SERVER_SYNC_STATE_ID))
      .first();
    if (existing) return existing.currentRevision;

    const changes = yield* selectFrom(changesTable, "byUpdatedAtId");
    const revision = changes.length === 0 ? 0 : 1;
    if (changes.length > 0) {
      yield* upsert(
        serverChangeFeedTable,
        changes.map((change) => ({
          id: change.id,
          revision,
          tableName: change.tableName,
          entityId: change.entityId,
          changeId: change.id,
        })),
      );
    }
    yield* upsert(serverSyncStateTable, [
      { id: SERVER_SYNC_STATE_ID, currentRevision: revision },
    ]);
    return revision;
  },
});

export const recordServerChanges = action({
  name: "recordServerChangesV4",
  args: { changes: v.pass<Change[]>() },
  handler: function* ({ changes }) {
    if (changes.length === 0) return 0;
    const state = yield* selectFrom(serverSyncStateTable, "byId")
      .where((q) => q.eq("id", SERVER_SYNC_STATE_ID))
      .first();
    const revision = (state?.currentRevision ?? 0) + 1;
    yield* upsert(serverSyncStateTable, [
      { id: SERVER_SYNC_STATE_ID, currentRevision: revision },
    ]);
    yield* upsert(
      serverChangeFeedTable,
      changes.map((change) => ({
        id: change.id,
        revision,
        tableName: change.tableName,
        entityId: change.entityId,
        changeId: change.id,
      })),
    );
    return revision;
  },
});

export const startSyncUpload = action({
  name: "startSyncUploadV4",
  args: {
    userId: v.string(),
    request: v.pass<SyncSessionRequest>(),
    now: v.number(),
    expiresAt: v.number(),
  },
  handler: function* ({ userId, request, now, expiresAt }) {
    const server = yield* selectFrom(serverSyncStateTable, "byId")
      .where((q) => q.eq("id", SERVER_SYNC_STATE_ID))
      .first();
    const currentRevision = server?.currentRevision ?? 0;
    const currentClient = (yield* selectFrom(
      serverClientSyncStateTable,
      "byId",
    )
      .where((q) => q.eq("id", request.clientId))
      .first()) as ServerClientSyncState | undefined;
    const storedCursor = cursorFromServerState(currentClient);
    const cursorOrder = compareClientCursor(
      storedCursor,
      request.expectedAcceptedClientCursor,
    );
    const revisionOrder =
      (currentClient?.acknowledgedServerRevision ?? 0) -
      request.expectedAcknowledgedServerRevision;
    const serverHistoryLost = cursorOrder < 0 || revisionOrder < 0;
    const serverAhead = cursorOrder > 0 || revisionOrder > 0;

    let uploadFromCursor = storedCursor;
    let downloadFromRevision = request.appliedServerRevision;
    if (serverHistoryLost) {
      downloadFromRevision = currentClient?.acknowledgedServerRevision ?? 0;
    } else if (!serverAhead) {
      uploadFromCursor = maxClientCursor([
        storedCursor,
        request.coveredClientCursor,
      ]);
      const acknowledgedServerRevision = Math.min(
        request.appliedServerRevision,
        currentRevision,
      );
      yield* upsert(serverClientSyncStateTable, [
        {
          id: request.clientId,
          ...cursorColumns(uploadFromCursor),
          acknowledgedServerRevision,
          lastSeenAt: now,
        },
      ]);
      downloadFromRevision = acknowledgedServerRevision;
    } else {
      downloadFromRevision = Math.min(
        request.appliedServerRevision,
        currentRevision,
      );
    }

    const uploadId = uuidv7();
    yield* insert(syncUploadSessionsTable, [
      {
        id: uploadId,
        userId,
        clientId: request.clientId,
        baseClientClock: uploadFromCursor?.clock ?? null,
        baseClientChangeId: uploadFromCursor?.changeId ?? null,
        downloadFromRevision,
        status: "uploading",
        expiresAt,
        uploadedChangeCount: 0,
        uploadedByteCount: 0,
        maxObservedClock: null,
        maxClientClock: uploadFromCursor?.clock ?? null,
        maxClientChangeId: uploadFromCursor?.changeId ?? null,
        resultJson: null,
      },
    ]);

    return {
      uploadId,
      uploadFromCursor,
      downloadFromRevision,
      serverHistoryLost,
      serverAhead,
      expiresAt,
    };
  },
});

export const getUploadSession = action({
  name: "getUploadSessionV4",
  args: { uploadId: v.string() },
  handler: function* ({ uploadId }) {
    return (yield* selectFrom(syncUploadSessionsTable, "byId")
      .where((q) => q.eq("id", uploadId))
      .first()) as SyncUploadSession | undefined;
  },
});

export const getUploadManifest = action({
  name: "getUploadManifestV4",
  args: { uploadId: v.string() },
  handler: function* ({ uploadId }) {
    const session = (yield* selectFrom(syncUploadSessionsTable, "byId")
      .where((q) => q.eq("id", uploadId))
      .first()) as SyncUploadSession | undefined;
    const chunks = yield* selectFrom(
      syncUploadChunksTable,
      "byUploadSequence",
    )
      .where((q) => q.eq("uploadId", uploadId))
      .order("asc");
    return { session, chunks };
  },
});

export const stageUploadChunk = action({
  name: "stageUploadChunkV4",
  args: {
    uploadId: v.string(),
    sequence: v.number(),
    byteCount: v.number(),
    chunk: v.pass<SyncUploadChunk>(),
    tableNameMap: v.pass<Record<string, TableDefinition>>(),
    tableRanks: v.pass<Record<string, number>>(),
    maxSessionBytes: v.number(),
    now: v.number(),
  },
  handler: function* ({
    uploadId,
    sequence,
    byteCount,
    chunk,
    tableNameMap,
    tableRanks,
    maxSessionBytes,
    now,
  }) {
    const session = (yield* selectFrom(syncUploadSessionsTable, "byId")
      .where((q) => q.eq("id", uploadId))
      .first()) as SyncUploadSession | undefined;
    if (!session || session.expiresAt <= now) {
      throw new Error("Sync upload session is not active");
    }

    const chunkId = `${uploadId}:${sequence}`;
    const existing = yield* selectFrom(syncUploadChunksTable, "byId")
      .where((q) => q.eq("id", chunkId))
      .first();
    if (existing) {
      if (existing.checksum !== chunk.checksum) {
        throw new Error("Sync upload chunk checksum conflicts with retry");
      }
      return { changeCount: existing.changeCount, replay: true };
    }
    if (session.status !== "uploading") {
      throw new Error("Sync upload session is not accepting new chunks");
    }
    if (session.uploadedByteCount + byteCount > maxSessionBytes) {
      throw new Error("Sync upload session exceeds its byte limit");
    }

    const items = [];
    const observedClocks: string[] = [];
    let chunkCursor: ClientCursor | null = null;
    let itemIndex = 0;
    for (const changeset of chunk.changesets) {
      if (!tableNameMap[changeset.tableName]) {
        throw new Error(`Unknown sync table: ${changeset.tableName}`);
      }
      for (const data of changeset.data) {
        observedClocks.push(...observedChangeClocks(data.change));
        chunkCursor = maxClientCursor([
          chunkCursor,
          clientCursorFromChange(data.change),
        ]);
        items.push({
          id: `${chunkId}:${itemIndex}`,
          uploadId,
          sequence: sequence * 1_000_000 + itemIndex,
          tableRank: tableRanks[changeset.tableName] ?? 1_000,
          tableName: changeset.tableName,
          entityId: data.change.entityId,
          changeId: data.change.id,
          payload: JSON.stringify(data),
          checksum: chunk.checksum,
        });
        itemIndex += 1;
      }
    }

    yield* insert(syncUploadItemsTable, items);
    yield* insert(syncUploadChunksTable, [
      {
        id: chunkId,
        uploadId,
        sequence,
        checksum: chunk.checksum,
        changeCount: itemIndex,
        byteCount,
      },
    ]);
    const sessionCursor =
      session.maxClientClock && session.maxClientChangeId
        ? {
            clock: session.maxClientClock,
            changeId: session.maxClientChangeId,
          }
        : null;
    const maxCursor = maxClientCursor([sessionCursor, chunkCursor]);
    yield* upsert(syncUploadSessionsTable, [
      {
        ...session,
        uploadedChangeCount: session.uploadedChangeCount + itemIndex,
        uploadedByteCount: session.uploadedByteCount + byteCount,
        maxObservedClock:
          maxHlc([session.maxObservedClock, ...observedClocks]) ?? null,
        maxClientClock: maxCursor?.clock ?? null,
        maxClientChangeId: maxCursor?.changeId ?? null,
      },
    ]);
    return { changeCount: itemIndex, replay: false };
  },
});

export const deleteSyncUpload = action({
  name: "deleteSyncUploadV4",
  args: { uploadId: v.string() },
  handler: function* ({ uploadId }) {
    const chunks = yield* selectFrom(
      syncUploadChunksTable,
      "byUploadSequence",
    ).where((q) => q.eq("uploadId", uploadId));
    const items = yield* selectFrom(
      syncUploadItemsTable,
      "byUploadSequenceId",
    ).where((q) => q.eq("uploadId", uploadId));
    yield* deleteRows(
      syncUploadChunksTable,
      chunks.map((row) => row.id),
    );
    yield* deleteRows(
      syncUploadItemsTable,
      items.map((row) => row.id),
    );
    yield* deleteRows(syncUploadSessionsTable, [uploadId]);
  },
});

const semanticallyEqualUpload = (
  stagedPayload: string | undefined,
  canonical: ChangesetArrayType[number]["data"][number],
) => {
  if (!stagedPayload) return false;
  const staged = JSON.parse(stagedPayload) as typeof canonical;
  return (
    staged.change.createdAt === canonical.change.createdAt &&
    staged.change.deletedAt === canonical.change.deletedAt &&
    staged.change.clientId === canonical.change.clientId &&
    isDeepStrictEqual(staged.change.changes, canonical.change.changes) &&
    isDeepStrictEqual(staged.row, canonical.row)
  );
};

export const commitSyncUpload = action({
  name: "commitSyncUploadV4",
  args: {
    uploadId: v.string(),
    userId: v.string(),
    request: v.pass<SyncCommitRequest>(),
    registeredSyncableTableNameMap: v.pass<Record<string, TableDefinition>>(),
    orderedTableNames: v.array(v.string()),
    dbType: v.union(v.literal("user"), v.literal("space")),
    serverClientId: v.string(),
    nextClock: v.string(),
    now: v.number(),
    expiresAt: v.number(),
  },
  handler: function* ({
    uploadId,
    userId,
    request,
    registeredSyncableTableNameMap,
    orderedTableNames,
    dbType,
    serverClientId,
    nextClock,
    now,
    expiresAt,
  }) {
    const session = (yield* selectFrom(syncUploadSessionsTable, "byId")
      .where((q) => q.eq("id", uploadId))
      .first()) as SyncUploadSession | undefined;
    if (!session || session.userId !== userId || session.expiresAt <= now) {
      throw new Error("Sync upload session is not active");
    }
    if (session.status === "committed" && session.resultJson) {
      return JSON.parse(session.resultJson) as SyncCommitResponse;
    }
    if (session.status !== "uploading") {
      throw new Error("Sync upload session cannot be committed");
    }
    if (
      request.changeCount !== session.uploadedChangeCount ||
      request.throughCursor?.clock !== session.maxClientClock ||
      request.throughCursor?.changeId !== session.maxClientChangeId
    ) {
      throw new Error("Sync upload manifest does not match staged changes");
    }

    const currentClient = (yield* selectFrom(
      serverClientSyncStateTable,
      "byId",
    )
      .where((q) => q.eq("id", session.clientId))
      .first()) as ServerClientSyncState | undefined;
    const baseCursor =
      session.baseClientClock && session.baseClientChangeId
        ? {
            clock: session.baseClientClock,
            changeId: session.baseClientChangeId,
          }
        : null;
    if (
      compareClientCursor(cursorFromServerState(currentClient), baseCursor) !== 0
    ) {
      throw new Error("Client cursor advanced in another sync session");
    }

    const merge = dbType === "space" ? mergeSpaceChanges : mergeChanges;
    for (const tableName of orderedTableNames) {
      let afterSequence = -1;
      while (true) {
        const queriedItems = yield* selectFrom(
          syncUploadItemsTable,
          "byUploadTableSequence",
        )
          .where((q) =>
            q
              .eq("uploadId", uploadId)
              .eq("tableName", tableName)
              .gte("sequence", afterSequence),
          )
          .order("asc")
          .limit(257);
        const items =
          queriedItems[0]?.sequence === afterSequence
            ? queriedItems.slice(1)
            : queriedItems.slice(0, 256);
        if (items.length === 0) break;
        const data = items.map(
          (item) =>
            JSON.parse(item.payload) as ChangesetArrayType[number]["data"][number],
        );
        yield* merge({
          input: [{ tableName, data }],
          nextClock,
          clientId: serverClientId,
          registeredSyncableTableNameMap,
        });
        afterSequence = items.at(-1)!.sequence;
      }
    }

    const serverState = yield* selectFrom(serverSyncStateTable, "byId")
      .where((q) => q.eq("id", SERVER_SYNC_STATE_ID))
      .first();
    const serverRevision = serverState?.currentRevision ?? 0;
    const acceptedClientCursor = request.throughCursor ??
      cursorFromServerState(currentClient);
    yield* upsert(serverClientSyncStateTable, [
      {
        id: session.clientId,
        ...cursorColumns(acceptedClientCursor),
        acknowledgedServerRevision:
          currentClient?.acknowledgedServerRevision ?? 0,
        lastSeenAt: now,
      },
    ]);

    let cursorRevision = session.downloadFromRevision;
    let cursorId: string | null = null;
    let inlineChangesets: ChangesetArrayType = [];
    let inlineBytes = 2;
    let downloadId: string | null = null;
    let downloadChunkCount = 0;
    let downloadChangeCount = 0;
    const downloadChecksums: string[] = [];

    while (true) {
      let feedPage;
      if (cursorId === null) {
        feedPage = yield* selectFrom(serverChangeFeedTable, "byRevisionId")
          .where((q) => q.gt("revision", cursorRevision))
          .order("asc")
          .limit(256);
      } else {
        const sameRevision = yield* selectFrom(
          serverChangeFeedTable,
          "byRevisionId",
        )
          .where((q) =>
            q.eq("revision", cursorRevision).gte("id", cursorId!),
          )
          .order("asc")
          .limit(257);
        feedPage =
          sameRevision[0]?.id === cursorId
            ? sameRevision.slice(1)
            : sameRevision.slice(0, 256);
        if (feedPage.length < 256) {
          feedPage.push(
            ...(yield* selectFrom(serverChangeFeedTable, "byRevisionId")
              .where((q) => q.gt("revision", cursorRevision))
              .order("asc")
              .limit(256 - feedPage.length)),
          );
        }
      }
      if (feedPage.length === 0) break;

      const changes = (yield* selectFrom(changesTable, "byId").where((q) =>
        feedPage.map((feed) => q.eq("id", feed.changeId)),
      )) as Change[];
      const staged = yield* selectFrom(
        syncUploadItemsTable,
        "byUploadChangeSequence",
      ).where((q) =>
        changes.map((change) =>
          q.eq("uploadId", uploadId).eq("changeId", change.id),
        ),
      );
      const stagedByChangeId = new Map(
        staged.map((item) => [item.changeId, item.payload]),
      );
      const changesets: ChangesetArrayType = [];
      for (const [tableName, table] of Object.entries(
        registeredSyncableTableNameMap,
      )) {
        const tableChanges = changes.filter(
          (change) => change.tableName === tableName,
        );
        if (tableChanges.length === 0) continue;
        const rows = yield* selectFrom(table, "byId").where((q) =>
          tableChanges.map((change) => q.eq("id", change.entityId)),
        );
        const rowsById = new Map(rows.map((row) => [row.id, row]));
        const data = tableChanges
          .map((change) => ({
            change,
            ...(rowsById.get(change.entityId)
              ? { row: rowsById.get(change.entityId) as never }
              : {}),
          }))
          .filter(
            (canonical) =>
              !semanticallyEqualUpload(
                stagedByChangeId.get(canonical.change.id),
                canonical,
              ),
          );
        if (data.length > 0) changesets.push({ tableName, data });
      }

      const pageChangeCount = changesets.reduce(
        (sum, changeset) => sum + changeset.data.length,
        0,
      );
      if (pageChangeCount > 0) {
        const payload = JSON.stringify(changesets);
        const payloadBytes = new TextEncoder().encode(payload).byteLength;
        downloadChangeCount += pageChangeCount;
        if (
          downloadId === null &&
          downloadChangeCount <= SYNC_V4_INLINE_DOWNLOAD_CHANGES &&
          inlineBytes + payloadBytes <= SYNC_V4_INLINE_DOWNLOAD_BYTES
        ) {
          inlineChangesets.push(...changesets);
          inlineBytes += payloadBytes;
        } else {
          if (downloadId === null) {
            downloadId = uuidv7();
            if (inlineChangesets.length > 0) {
              const firstPayload = JSON.stringify(inlineChangesets);
              yield* insert(syncDownloadChunksTable, [
                {
                  id: `${downloadId}:0`,
                  downloadId,
                  sequence: 0,
                  payload: firstPayload,
                  checksum: sha256(firstPayload),
                },
              ]);
              downloadChecksums.push(sha256(firstPayload));
              downloadChunkCount = 1;
              inlineChangesets = [];
            }
          }
          yield* insert(syncDownloadChunksTable, [
            {
              id: `${downloadId}:${downloadChunkCount}`,
              downloadId,
              sequence: downloadChunkCount,
              payload,
              checksum: sha256(payload),
            },
          ]);
          downloadChecksums.push(sha256(payload));
          downloadChunkCount += 1;
        }
      }
      const lastFeed = feedPage.at(-1)! as ServerChangeFeed;
      cursorRevision = lastFeed.revision;
      cursorId = lastFeed.id;
    }

    const download =
      downloadId === null
        ? ({ type: "inline", changesets: inlineChangesets } as const)
        : ({
            type: "staged",
            downloadId,
            chunkCount: downloadChunkCount,
            changeCount: downloadChangeCount,
            checksum: sha256(downloadChecksums.join("\n")),
          } as const);
    if (downloadId !== null) {
      yield* insert(syncDownloadSessionsTable, [
        {
          id: downloadId,
          userId,
          clientId: session.clientId,
          serverRevision,
          chunkCount: downloadChunkCount,
          changeCount: downloadChangeCount,
          checksum: sha256(downloadChecksums.join("\n")),
          expiresAt,
        },
      ]);
    }
    const result: SyncCommitResponse = {
      acceptedClientCursor,
      serverRevision,
      download,
    };
    yield* upsert(syncUploadSessionsTable, [
      { ...session, status: "committed", resultJson: JSON.stringify(result) },
    ]);
    return result;
  },
});

export const getDownloadChunk = action({
  name: "getDownloadChunkV4",
  args: {
    downloadId: v.string(),
    sequence: v.number(),
    userId: v.string(),
    now: v.number(),
  },
  handler: function* ({ downloadId, sequence, userId, now }) {
    const session = yield* selectFrom(syncDownloadSessionsTable, "byId")
      .where((q) => q.eq("id", downloadId))
      .first();
    if (!session || session.userId !== userId || session.expiresAt <= now) {
      throw new Error("Sync download session is not active");
    }
    return yield* selectFrom(syncDownloadChunksTable, "byId")
      .where((q) => q.eq("id", `${downloadId}:${sequence}`))
      .first();
  },
});

export const acknowledgeDownload = action({
  name: "acknowledgeDownloadV4",
  args: { downloadId: v.string(), userId: v.string() },
  handler: function* ({ downloadId, userId }) {
    const session = yield* selectFrom(syncDownloadSessionsTable, "byId")
      .where((q) => q.eq("id", downloadId))
      .first();
    if (!session || session.userId !== userId) return false;
    const chunks = yield* selectFrom(
      syncDownloadChunksTable,
      "byDownloadSequence",
    ).where((q) => q.eq("downloadId", downloadId));
    yield* deleteRows(
      syncDownloadChunksTable,
      chunks.map((chunk) => chunk.id),
    );
    yield* deleteRows(syncDownloadSessionsTable, [downloadId]);
    return true;
  },
});

export const cleanupExpiredSyncSessions = action({
  name: "cleanupExpiredSyncSessionsV4",
  args: { now: v.number() },
  handler: function* ({ now }) {
    const uploads = yield* selectFrom(
      syncUploadSessionsTable,
      "byExpiresAtId",
    )
      .where((q) => q.lte("expiresAt", now))
      .order("asc")
      .limit(50);
    for (const upload of uploads) {
      yield* deleteSyncUpload({ uploadId: upload.id });
    }
    const downloads = yield* selectFrom(
      syncDownloadSessionsTable,
      "byExpiresAtId",
    )
      .where((q) => q.lte("expiresAt", now))
      .order("asc")
      .limit(50);
    for (const download of downloads) {
      const chunks = yield* selectFrom(
        syncDownloadChunksTable,
        "byDownloadSequence",
      ).where((q) => q.eq("downloadId", download.id));
      yield* deleteRows(
        syncDownloadChunksTable,
        chunks.map((chunk) => chunk.id),
      );
      yield* deleteRows(syncDownloadSessionsTable, [download.id]);
    }
    return { uploads: uploads.length, downloads: downloads.length };
  },
});

export const serverSyncStagingTables = {
  syncUploadSessionsTable,
  syncUploadChunksTable,
  syncUploadItemsTable,
  syncDownloadSessionsTable,
  syncDownloadChunksTable,
};
