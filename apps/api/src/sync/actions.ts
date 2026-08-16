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
  type Change,
  maxHlc,
  observedChangeClocks,
  clientCursorFromChange,
  type SyncCommitRequest,
  type SyncCommitResponse,
  type ChangesetArrayType,
  SYNC_V4_INLINE_DOWNLOAD_BYTES,
  SYNC_V4_INLINE_DOWNLOAD_CHANGES,
  SYNC_V4_MAX_ACTIVE_UPLOAD_SESSIONS,
  SYNC_V4_MAX_SESSION_BYTES,
  SYNC_V4_MAX_SESSION_CHUNKS,
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
import {
  assertSyncClockWithinFutureSkew,
  SyncClientCursorAdvancedError,
  SyncConflictError,
  SyncSessionNotFoundError,
} from "./errors";

const INITIAL_FEED_PAGE_SIZE = 256;
const STAGING_METRICS_PAGE_SIZE = 256;

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

    let cursor: ClientCursor | null = null;
    let revision = 0;
    while (true) {
      let changes: Change[];
      if (cursor === null) {
        changes = (yield* selectFrom(changesTable, "byUpdatedAtId")
          .order("asc")
          .limit(INITIAL_FEED_PAGE_SIZE)) as Change[];
      } else {
        const atClock = (yield* selectFrom(changesTable, "byUpdatedAtId")
          .where((q) =>
            q.eq("updatedAt", cursor!.clock).gte("id", cursor!.changeId),
          )
          .order("asc")
          .limit(INITIAL_FEED_PAGE_SIZE + 1)) as Change[];
        changes =
          atClock[0]?.id === cursor.changeId
            ? atClock.slice(1)
            : atClock.slice(0, INITIAL_FEED_PAGE_SIZE);
        if (changes.length < INITIAL_FEED_PAGE_SIZE) {
          changes.push(
            ...((yield* selectFrom(changesTable, "byUpdatedAtId")
              .where((q) => q.gt("updatedAt", cursor!.clock))
              .order("asc")
              .limit(INITIAL_FEED_PAGE_SIZE - changes.length)) as Change[]),
          );
        }
      }
      if (changes.length === 0) break;
      revision = 1;
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
      cursor = clientCursorFromChange(changes.at(-1)!);
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
    const currentClient = (yield* selectFrom(serverClientSyncStateTable, "byId")
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
    const serverAhead =
      cursorOrder > 0 ||
      revisionOrder > 0 ||
      request.appliedServerRevision <
        (currentClient?.acknowledgedServerRevision ?? 0);

    const activeUploads = yield* selectFrom(
      syncUploadSessionsTable,
      "byUserClientStatusExpiresAtId",
    )
      .where((q) =>
        q
          .eq("userId", userId)
          .eq("clientId", request.clientId)
          .eq("status", "uploading")
          .gte("expiresAt", now + 1),
      )
      .limit(SYNC_V4_MAX_ACTIVE_UPLOAD_SESSIONS);
    if (activeUploads.length >= SYNC_V4_MAX_ACTIVE_UPLOAD_SESSIONS) {
      throw new SyncConflictError(
        "Too many active sync upload sessions for this client",
      );
    }

    let uploadFromCursor = storedCursor;
    let downloadFromRevision = request.appliedServerRevision;
    let serverAcknowledgedRevision =
      currentClient?.acknowledgedServerRevision ?? 0;
    if (serverHistoryLost) {
      downloadFromRevision = serverAcknowledgedRevision;
    } else if (!serverAhead) {
      uploadFromCursor = maxClientCursor([
        storedCursor,
        request.coveredClientCursor,
      ]);
      const acknowledgedServerRevision = Math.max(
        currentClient?.acknowledgedServerRevision ?? 0,
        Math.min(request.appliedServerRevision, currentRevision),
      );
      yield* upsert(serverClientSyncStateTable, [
        {
          id: request.clientId,
          ...cursorColumns(uploadFromCursor),
          acknowledgedServerRevision,
          lastSeenAt: now,
        },
      ]);
      serverAcknowledgedRevision = acknowledgedServerRevision;
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
      serverAcknowledgedRevision,
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

export const stageUploadChunk = action({
  name: "stageUploadChunkV4",
  args: {
    uploadId: v.string(),
    userId: v.string(),
    sequence: v.number(),
    byteCount: v.number(),
    chunk: v.pass<{
      checksum: string;
      changesets: ChangesetArrayType;
    }>(),
    tableNameMap: v.pass<Record<string, TableDefinition>>(),
    now: v.number(),
  },
  handler: function* ({
    uploadId,
    userId,
    sequence,
    byteCount,
    chunk,
    tableNameMap,
    now,
  }) {
    const session = (yield* selectFrom(syncUploadSessionsTable, "byId")
      .where((q) => q.eq("id", uploadId))
      .first()) as SyncUploadSession | undefined;
    if (!session || session.userId !== userId || session.expiresAt <= now) {
      throw new SyncSessionNotFoundError("Sync upload session is not active");
    }

    const chunkId = `${uploadId}:${sequence}`;
    const existing = yield* selectFrom(syncUploadChunksTable, "byId")
      .where((q) => q.eq("id", chunkId))
      .first();
    if (existing) {
      if (existing.checksum !== chunk.checksum) {
        throw new SyncConflictError(
          "Sync upload chunk checksum conflicts with retry",
        );
      }
      return { changeCount: existing.changeCount, replay: true };
    }
    if (session.status !== "uploading") {
      throw new SyncConflictError(
        "Sync upload session is not accepting new chunks",
      );
    }
    if (session.uploadedByteCount + byteCount > SYNC_V4_MAX_SESSION_BYTES) {
      throw new SyncConflictError("Sync upload session exceeds its byte limit");
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
          tableName: changeset.tableName,
          entityId: data.change.entityId,
          changeId: data.change.id,
          payload: JSON.stringify(data),
          checksum: chunk.checksum,
        });
        itemIndex += 1;
      }
    }

    const maxObservedClock = maxHlc(observedClocks) ?? null;
    assertSyncClockWithinFutureSkew(maxObservedClock, now);

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
          maxHlc([session.maxObservedClock, maxObservedClock]) ?? null,
        maxClientClock: maxCursor?.clock ?? null,
        maxClientChangeId: maxCursor?.changeId ?? null,
      },
    ]);
    return { changeCount: itemIndex, replay: false };
  },
});

export const deleteSyncUpload = action({
  name: "deleteSyncUploadV4",
  args: { uploadId: v.string(), maxRows: v.number() },
  handler: function* ({ uploadId, maxRows }) {
    const chunks = yield* selectFrom(syncUploadChunksTable, "byUploadSequence")
      .where((q) => q.eq("uploadId", uploadId))
      .limit(maxRows);
    const remaining = Math.max(0, maxRows - chunks.length);
    const items =
      remaining === 0
        ? []
        : yield* selectFrom(syncUploadItemsTable, "byUploadSequenceId")
            .where((q) => q.eq("uploadId", uploadId))
            .limit(remaining);
    yield* deleteRows(
      syncUploadChunksTable,
      chunks.map((row) => row.id),
    );
    yield* deleteRows(
      syncUploadItemsTable,
      items.map((row) => row.id),
    );
    let deletedRows = chunks.length + items.length;
    const deletedSession = deletedRows === 0 && maxRows > 0;
    if (deletedSession) yield* deleteRows(syncUploadSessionsTable, [uploadId]);
    if (deletedSession) deletedRows += 1;
    return { deletedRows, deletedSession };
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
      throw new SyncSessionNotFoundError("Sync upload session is not active");
    }
    if (session.status === "committed" && session.resultJson) {
      return JSON.parse(session.resultJson) as SyncCommitResponse;
    }
    if (session.status !== "uploading") {
      throw new SyncConflictError("Sync upload session cannot be committed");
    }
    if (request.chunkCount > SYNC_V4_MAX_SESSION_CHUNKS) {
      throw new SyncConflictError("Sync upload has too many chunks");
    }
    const chunks = yield* selectFrom(syncUploadChunksTable, "byUploadSequence")
      .where((q) => q.eq("uploadId", uploadId))
      .order("asc")
      .limit(SYNC_V4_MAX_SESSION_CHUNKS + 1);
    if (chunks.length > SYNC_V4_MAX_SESSION_CHUNKS) {
      throw new SyncConflictError("Sync upload has too many chunks");
    }
    const validManifest =
      chunks.length === request.chunkCount &&
      chunks.every((chunk, index) => chunk.sequence === index) &&
      chunks.reduce((sum, chunk) => sum + chunk.changeCount, 0) ===
        request.changeCount &&
      sha256(chunks.map((chunk) => chunk.checksum).join("\n")) ===
        request.checksum;
    if (!validManifest) {
      throw new SyncConflictError("Incomplete sync upload");
    }
    const expectedThroughCursor =
      session.maxClientClock && session.maxClientChangeId
        ? {
            clock: session.maxClientClock,
            changeId: session.maxClientChangeId,
          }
        : null;
    if (
      request.changeCount !== session.uploadedChangeCount ||
      compareClientCursor(request.throughCursor, expectedThroughCursor) !== 0
    ) {
      throw new SyncConflictError(
        "Sync upload manifest does not match staged changes",
      );
    }

    const currentClient = (yield* selectFrom(serverClientSyncStateTable, "byId")
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
      compareClientCursor(cursorFromServerState(currentClient), baseCursor) !==
      0
    ) {
      throw new SyncClientCursorAdvancedError(
        "Client cursor advanced in another sync session",
      );
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
            JSON.parse(
              item.payload,
            ) as ChangesetArrayType[number]["data"][number],
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
    const acceptedClientCursor =
      request.throughCursor ?? cursorFromServerState(currentClient);
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
    let stagedDownloadBytes = 0;
    const downloadManifestHash = createHash("sha256");
    let hashedDownloadChunks = 0;

    const recordDownloadChecksum = (checksum: string) => {
      if (hashedDownloadChunks > 0) downloadManifestHash.update("\n");
      downloadManifestHash.update(checksum);
      hashedDownloadChunks += 1;
    };
    const appendDownloadChangesets = function* (
      changesets: ChangesetArrayType,
    ) {
      const pageChangeCount = changesets.reduce(
        (sum, changeset) => sum + changeset.data.length,
        0,
      );
      if (pageChangeCount === 0) return;

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
        return;
      }

      if (downloadId === null) {
        downloadId = uuidv7();
        if (inlineChangesets.length > 0) {
          const firstPayload = JSON.stringify(inlineChangesets);
          const firstChecksum = sha256(firstPayload);
          yield* insert(syncDownloadChunksTable, [
            {
              id: `${downloadId}:0`,
              downloadId,
              sequence: 0,
              payload: firstPayload,
              checksum: firstChecksum,
            },
          ]);
          recordDownloadChecksum(firstChecksum);
          stagedDownloadBytes += new TextEncoder().encode(
            firstPayload,
          ).byteLength;
          downloadChunkCount = 1;
          inlineChangesets = [];
        }
      }

      const checksum = sha256(payload);
      yield* insert(syncDownloadChunksTable, [
        {
          id: `${downloadId}:${downloadChunkCount}`,
          downloadId,
          sequence: downloadChunkCount,
          payload,
          checksum,
        },
      ]);
      recordDownloadChecksum(checksum);
      stagedDownloadBytes += payloadBytes;
      downloadChunkCount += 1;
    };

    // A merge can keep a newer server value instead of an uploaded value. Such
    // a correction must be returned even when the canonical change predates the
    // client's feed cursor, so derive it directly from the staged upload.
    for (const tableName of orderedTableNames) {
      const table = registeredSyncableTableNameMap[tableName];
      if (!table) continue;
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

        const canonicalChanges = (yield* selectFrom(changesTable, "byId").where(
          (q) => items.map((item) => q.eq("id", item.changeId)),
        )) as Change[];
        const changesById = new Map(
          canonicalChanges.map((change) => [change.id, change]),
        );
        const rows = yield* selectFrom(table, "byId").where((q) =>
          items.map((item) => q.eq("id", item.entityId)),
        );
        const rowsById = new Map(rows.map((row) => [row.id, row]));
        const corrections = items.flatMap((item) => {
          const change = changesById.get(item.changeId);
          if (!change) return [];
          const canonical = {
            change,
            ...(rowsById.get(change.entityId)
              ? { row: rowsById.get(change.entityId) as never }
              : {}),
          };
          return semanticallyEqualUpload(item.payload, canonical)
            ? []
            : [canonical];
        });
        if (corrections.length > 0) {
          yield* appendDownloadChangesets([{ tableName, data: corrections }]);
        }
        afterSequence = items.at(-1)!.sequence;
      }
    }

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
          .where((q) => q.eq("revision", cursorRevision).gte("id", cursorId!))
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
      const stagedChangeIds = new Set(staged.map((item) => item.changeId));
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
          .filter((canonical) => !stagedChangeIds.has(canonical.change.id));
        if (data.length > 0) changesets.push({ tableName, data });
      }
      yield* appendDownloadChangesets(changesets);
      const lastFeed = feedPage.at(-1)! as ServerChangeFeed;
      cursorRevision = lastFeed.revision;
      cursorId = lastFeed.id;
    }

    const downloadChecksum =
      downloadId === null ? null : downloadManifestHash.digest("hex");

    const download =
      downloadId === null
        ? ({ type: "inline", changesets: inlineChangesets } as const)
        : ({
            type: "staged",
            downloadId,
            chunkCount: downloadChunkCount,
            changeCount: downloadChangeCount,
            checksum: downloadChecksum!,
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
          checksum: downloadChecksum!,
          stagedByteCount: stagedDownloadBytes,
          status: "available",
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
    if (
      !session ||
      session.userId !== userId ||
      session.status === "acknowledged" ||
      session.expiresAt <= now
    ) {
      throw new SyncSessionNotFoundError("Sync download session is not active");
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
    if (session.status !== "acknowledged") {
      yield* upsert(syncDownloadSessionsTable, [
        { ...session, status: "acknowledged", expiresAt: 0 },
      ]);
    }
    return true;
  },
});

export const cleanupExpiredSyncSessions = action({
  name: "cleanupExpiredSyncSessionsV4",
  args: { now: v.number(), maxRows: v.number() },
  handler: function* ({ now, maxRows }) {
    const uploads = yield* selectFrom(syncUploadSessionsTable, "byExpiresAtId")
      .where((q) => q.lte("expiresAt", now))
      .order("asc")
      .limit(1);
    let deletedRows = 0;
    let deletedUploads = 0;
    if (uploads[0]) {
      const deleted = yield* deleteSyncUpload({
        uploadId: uploads[0].id,
        maxRows,
      });
      deletedRows += deleted.deletedRows;
      if (deleted.deletedSession) deletedUploads = 1;
    }
    const downloads = yield* selectFrom(
      syncDownloadSessionsTable,
      "byExpiresAtId",
    )
      .where((q) => q.lte("expiresAt", now))
      .order("asc")
      .limit(1);
    let deletedDownloads = 0;
    const remaining = Math.max(0, maxRows - deletedRows);
    if (downloads[0] && remaining > 0) {
      const download = downloads[0];
      const chunks = yield* selectFrom(
        syncDownloadChunksTable,
        "byDownloadSequence",
      )
        .where((q) => q.eq("downloadId", download.id))
        .limit(remaining);
      yield* deleteRows(
        syncDownloadChunksTable,
        chunks.map((chunk) => chunk.id),
      );
      deletedRows += chunks.length;
      if (chunks.length === 0) {
        yield* deleteRows(syncDownloadSessionsTable, [download.id]);
        deletedRows += 1;
        deletedDownloads = 1;
      }
    }
    const remainingUploads = yield* selectFrom(
      syncUploadSessionsTable,
      "byExpiresAtId",
    )
      .where((q) => q.lte("expiresAt", now))
      .order("asc")
      .limit(1);
    const remainingDownloads = yield* selectFrom(
      syncDownloadSessionsTable,
      "byExpiresAtId",
    )
      .where((q) => q.lte("expiresAt", now))
      .order("asc")
      .limit(1);
    return {
      uploads: deletedUploads,
      downloads: deletedDownloads,
      deletedRows,
      hasMore: remainingUploads.length > 0 || remainingDownloads.length > 0,
    };
  },
});

export const getSyncStagingMetrics = action({
  name: "getSyncStagingMetricsV4",
  args: {},
  handler: function* () {
    let uploadBytes = 0;
    let uploadCursor: { expiresAt: number; id: string } | null = null;
    while (true) {
      let uploads;
      if (uploadCursor === null) {
        uploads = yield* selectFrom(syncUploadSessionsTable, "byExpiresAtId")
          .order("asc")
          .limit(STAGING_METRICS_PAGE_SIZE);
      } else {
        const atExpiry = yield* selectFrom(
          syncUploadSessionsTable,
          "byExpiresAtId",
        )
          .where((q) =>
            q
              .eq("expiresAt", uploadCursor!.expiresAt)
              .gte("id", uploadCursor!.id),
          )
          .order("asc")
          .limit(STAGING_METRICS_PAGE_SIZE + 1);
        uploads =
          atExpiry[0]?.id === uploadCursor.id
            ? atExpiry.slice(1)
            : atExpiry.slice(0, STAGING_METRICS_PAGE_SIZE);
        if (uploads.length < STAGING_METRICS_PAGE_SIZE) {
          uploads.push(
            ...(yield* selectFrom(syncUploadSessionsTable, "byExpiresAtId")
              .where((q) => q.gt("expiresAt", uploadCursor!.expiresAt))
              .order("asc")
              .limit(STAGING_METRICS_PAGE_SIZE - uploads.length)),
          );
        }
      }
      if (uploads.length === 0) break;
      for (const session of uploads) uploadBytes += session.uploadedByteCount;
      const last: { expiresAt: number; id: string } = uploads.at(-1)!;
      uploadCursor = { expiresAt: last.expiresAt, id: last.id };
    }

    let downloadBytes = 0;
    let downloadCursor: { expiresAt: number; id: string } | null = null;
    while (true) {
      let downloads;
      if (downloadCursor === null) {
        downloads = yield* selectFrom(
          syncDownloadSessionsTable,
          "byExpiresAtId",
        )
          .order("asc")
          .limit(STAGING_METRICS_PAGE_SIZE);
      } else {
        const atExpiry = yield* selectFrom(
          syncDownloadSessionsTable,
          "byExpiresAtId",
        )
          .where((q) =>
            q
              .eq("expiresAt", downloadCursor!.expiresAt)
              .gte("id", downloadCursor!.id),
          )
          .order("asc")
          .limit(STAGING_METRICS_PAGE_SIZE + 1);
        downloads =
          atExpiry[0]?.id === downloadCursor.id
            ? atExpiry.slice(1)
            : atExpiry.slice(0, STAGING_METRICS_PAGE_SIZE);
        if (downloads.length < STAGING_METRICS_PAGE_SIZE) {
          downloads.push(
            ...(yield* selectFrom(syncDownloadSessionsTable, "byExpiresAtId")
              .where((q) => q.gt("expiresAt", downloadCursor!.expiresAt))
              .order("asc")
              .limit(STAGING_METRICS_PAGE_SIZE - downloads.length)),
          );
        }
      }
      if (downloads.length === 0) break;
      for (const session of downloads) {
        downloadBytes += session.stagedByteCount ?? 0;
      }
      const last: { expiresAt: number; id: string } = downloads.at(-1)!;
      downloadCursor = { expiresAt: last.expiresAt, id: last.id };
    }

    return {
      uploadBytes,
      downloadBytes,
      totalBytes: uploadBytes + downloadBytes,
    };
  },
});

export const serverSyncStagingTables = {
  syncUploadSessionsTable,
  syncUploadChunksTable,
  syncUploadItemsTable,
  syncDownloadSessionsTable,
  syncDownloadChunksTable,
};
