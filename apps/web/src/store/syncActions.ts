import {
  deleteRows,
  insert,
  selectFrom,
  upsert,
  v,
} from "@will-be-done/hyperdb";
import {
  changesTable,
  clientCursorFromChange,
  compareClientCursor,
  maxClientCursor,
  SYNC_V4_MAX_CHUNK_BYTES,
  SYNC_V4_MAX_CHUNK_CHANGES,
  SYNC_V4_MAX_SESSION_CHUNKS,
  SYNC_V4_MAX_SESSION_BYTES,
  type Change,
  type ClientCursor,
  type ChangesetArrayType,
  getChangesetAfter,
  getSyncStateOrDefault,
  updateSyncState,
} from "@will-be-done/slices/common";
import { action } from "./builders";
import {
  changesetArraySchema,
  syncableTableNameMapSchema,
} from "./syncValidators";
import {
  clientSyncDownloadChunksTable,
  clientSyncDownloadSessionsTable,
  clientSyncUploadChunksTable,
  clientSyncUploadSessionsTable,
} from "./syncV4Tables";

const pageChangesAfter = function* (
  cursor: ClientCursor | null,
  limit: number,
) {
  if (cursor === null) {
    return (yield* selectFrom(changesTable, "byUpdatedAtId")
      .order("asc")
      .limit(limit)) as Change[];
  }
  const atClock = (yield* selectFrom(changesTable, "byUpdatedAtId")
    .where((q) => q.eq("updatedAt", cursor.clock).gte("id", cursor.changeId))
    .order("asc")
    .limit(limit + 1)) as Change[];
  const page =
    atClock[0]?.id === cursor.changeId
      ? atClock.slice(1)
      : atClock.slice(0, limit);
  if (page.length < limit) {
    page.push(
      ...((yield* selectFrom(changesTable, "byUpdatedAtId")
        .where((q) => q.gt("updatedAt", cursor.clock))
        .order("asc")
        .limit(limit - page.length)) as Change[]),
    );
  }
  return page;
};

export const getSyncV4HandshakeState = action({
  name: "getSyncV4HandshakeState",
  args: {},
  handler: function* () {
    const state = yield* getSyncStateOrDefault({});
    const covered = (yield* selectFrom(changesTable, "byUpdatedAtId")
      .order("desc")
      .limit(1)) as Change[];
    return {
      expectedAcceptedClientCursor:
        state.serverConfirmedClientClock && state.serverConfirmedClientChangeId
          ? {
              clock: state.serverConfirmedClientClock,
              changeId: state.serverConfirmedClientChangeId,
            }
          : null,
      coveredClientCursor:
        state.localCoveredClientClock && state.localCoveredClientChangeId
          ? {
              clock: state.localCoveredClientClock,
              changeId: state.localCoveredClientChangeId,
            }
          : null,
      appliedServerRevision: state.lastServerAppliedRevision ?? 0,
      expectedAcknowledgedServerRevision:
        state.serverConfirmedAppliedRevision ?? 0,
      localMaxCursor: covered[0] ? clientCursorFromChange(covered[0]) : null,
    };
  },
});

export const freezeSyncV4Upload = action({
  name: "freezeSyncV4Upload",
  args: {
    uploadId: v.string(),
    after: v.pass<ClientCursor | null>(),
    registeredSyncableTableNameMap: syncableTableNameMapSchema,
    now: v.number(),
  },
  handler: function* ({
    uploadId,
    after,
    registeredSyncableTableNameMap,
    now,
  }) {
    let cursor = after;
    let through = after;
    let sequence = 0;
    let changeCount = 0;
    let pending: ChangesetArrayType = [];
    let pendingCount = 0;
    let totalBytes = 0;

    const flush = function* () {
      if (pendingCount === 0) return;
      if (sequence >= SYNC_V4_MAX_SESSION_CHUNKS) {
        throw new Error("Sync snapshot exceeds the chunk-count limit");
      }
      const payload = JSON.stringify(pending);
      totalBytes += new TextEncoder().encode(payload).byteLength;
      if (totalBytes > SYNC_V4_MAX_SESSION_BYTES) {
        throw new Error("Sync snapshot exceeds the session byte limit");
      }
      yield* insert(clientSyncUploadChunksTable, [
        {
          id: `${uploadId}:${sequence}`,
          uploadId,
          sequence,
          payload,
        },
      ]);
      sequence += 1;
      pending = [];
      pendingCount = 0;
    };

    while (true) {
      const page = yield* pageChangesAfter(cursor, SYNC_V4_MAX_CHUNK_CHANGES);
      if (page.length === 0) break;
      const byTable = new Map<string, Change[]>();
      for (const change of page) {
        const list = byTable.get(change.tableName) ?? [];
        list.push(change);
        byTable.set(change.tableName, list);
      }
      for (const [tableName, tableChanges] of byTable) {
        const table = registeredSyncableTableNameMap[tableName];
        if (!table) throw new Error(`Unknown table: ${tableName}`);
        const rows = yield* selectFrom(table, "byId").where((q) =>
          tableChanges.map((change) => q.eq("id", change.entityId)),
        );
        const rowsById = new Map(rows.map((row) => [row.id, row]));
        for (const change of tableChanges) {
          const data = {
            change,
            ...(rowsById.get(change.entityId)
              ? { row: rowsById.get(change.entityId) as never }
              : {}),
          };
          const candidate = pending.map((changeset) => ({
            ...changeset,
            data: [...changeset.data],
          }));
          const existing = candidate.find(
            (changeset) => changeset.tableName === tableName,
          );
          if (existing) existing.data.push(data);
          else candidate.push({ tableName, data: [data] });
          const candidateBytes = new TextEncoder().encode(
            JSON.stringify(candidate),
          ).byteLength;
          if (candidateBytes > SYNC_V4_MAX_CHUNK_BYTES && pendingCount > 0) {
            yield* flush();
            pending = [{ tableName, data: [data] }];
            pendingCount = 1;
          } else {
            pending = candidate;
            pendingCount += 1;
          }
          if (
            new TextEncoder().encode(JSON.stringify(pending)).byteLength >
            SYNC_V4_MAX_CHUNK_BYTES
          ) {
            throw new Error("A sync change exceeds the upload byte limit");
          }
          if (pendingCount >= SYNC_V4_MAX_CHUNK_CHANGES) yield* flush();
          changeCount += 1;
          through = maxClientCursor([through, clientCursorFromChange(change)]);
        }
      }
      cursor = clientCursorFromChange(page.at(-1)!);
    }
    yield* flush();
    yield* insert(clientSyncUploadSessionsTable, [
      {
        id: uploadId,
        throughClock: through?.clock ?? null,
        throughChangeId: through?.changeId ?? null,
        changeCount,
        chunkCount: sequence,
        createdAt: now,
      },
    ]);
    return { throughCursor: through, changeCount, chunkCount: sequence };
  },
});

export const getSyncV4UploadChunk = action({
  name: "getSyncV4UploadChunk",
  args: { uploadId: v.string(), sequence: v.number() },
  handler: function* ({ uploadId, sequence }) {
    return yield* selectFrom(clientSyncUploadChunksTable, "byId")
      .where((q) => q.eq("id", `${uploadId}:${sequence}`))
      .first();
  },
});

export const getPendingSyncV4Upload = action({
  name: "getPendingSyncV4Upload",
  args: {},
  handler: function* () {
    return yield* selectFrom(clientSyncUploadSessionsTable, "byCreatedAtId")
      .order("desc")
      .first();
  },
});

export const stageSyncV4Download = action({
  name: "stageSyncV4Download",
  args: {
    downloadId: v.string(),
    serverRevision: v.number(),
    acceptedClientCursor: v.pass<ClientCursor | null>(),
    chunks: v.array(v.string()),
  },
  handler: function* ({
    downloadId,
    serverRevision,
    acceptedClientCursor,
    chunks,
  }) {
    yield* upsert(
      clientSyncDownloadChunksTable,
      chunks.map((payload, sequence) => ({
        id: `${downloadId}:${sequence}`,
        downloadId,
        sequence,
        payload,
      })),
    );
    yield* upsert(clientSyncDownloadSessionsTable, [
      {
        id: downloadId,
        serverRevision,
        acceptedClientClock: acceptedClientCursor?.clock ?? null,
        acceptedClientChangeId: acceptedClientCursor?.changeId ?? null,
        chunkCount: chunks.length,
      },
    ]);
  },
});

export const beginSyncV4Download = action({
  name: "beginSyncV4Download",
  args: {
    downloadId: v.string(),
    serverRevision: v.number(),
    acceptedClientCursor: v.pass<ClientCursor | null>(),
    chunkCount: v.number(),
  },
  handler: function* ({
    downloadId,
    serverRevision,
    acceptedClientCursor,
    chunkCount,
  }) {
    yield* upsert(clientSyncDownloadSessionsTable, [
      {
        id: downloadId,
        serverRevision,
        acceptedClientClock: acceptedClientCursor?.clock ?? null,
        acceptedClientChangeId: acceptedClientCursor?.changeId ?? null,
        chunkCount,
      },
    ]);
  },
});

export const stageSyncV4DownloadChunk = action({
  name: "stageSyncV4DownloadChunk",
  args: {
    downloadId: v.string(),
    sequence: v.number(),
    payload: v.string(),
  },
  handler: function* ({ downloadId, sequence, payload }) {
    yield* upsert(clientSyncDownloadChunksTable, [
      {
        id: `${downloadId}:${sequence}`,
        downloadId,
        sequence,
        payload,
      },
    ]);
  },
});

export const recordSyncV4Handshake = action({
  name: "recordSyncV4Handshake",
  args: {
    acceptedClientCursor: v.pass<ClientCursor | null>(),
    acknowledgedServerRevision: v.number(),
  },
  handler: function* ({ acceptedClientCursor, acknowledgedServerRevision }) {
    yield* updateSyncState({
      updates: {
        serverConfirmedClientClock: acceptedClientCursor?.clock,
        serverConfirmedClientChangeId: acceptedClientCursor?.changeId,
        serverConfirmedAppliedRevision: acknowledgedServerRevision,
      },
    });
  },
});

export const createApplySyncV4Download = (nextClock: () => string) =>
  action({
    name: "applySyncV4Download",
    args: {
      downloadId: v.string(),
      uploadId: v.string(),
      registeredSyncableTableNameMap: syncableTableNameMapSchema,
      clientId: v.string(),
    },
    handler: function* ({
      downloadId,
      uploadId,
      registeredSyncableTableNameMap,
      clientId,
    }) {
      const session = yield* selectFrom(clientSyncDownloadSessionsTable, "byId")
        .where((q) => q.eq("id", downloadId))
        .first();
      if (!session) throw new Error("Local sync download is missing");
      const acceptedClientCursor =
        session.acceptedClientClock && session.acceptedClientChangeId
          ? {
              clock: session.acceptedClientClock,
              changeId: session.acceptedClientChangeId,
            }
          : null;
      const latest = (yield* selectFrom(changesTable, "byUpdatedAtId")
        .order("desc")
        .limit(1)) as Change[];
      if (
        latest[0] &&
        compareClientCursor(
          clientCursorFromChange(latest[0]),
          acceptedClientCursor,
        ) > 0
      ) {
        return false;
      }

      let localCovered = acceptedClientCursor;
      let lastLegacyClock = acceptedClientCursor?.clock ?? "";
      for (let sequence = 0; sequence < session.chunkCount; sequence += 1) {
        const chunk = yield* selectFrom(clientSyncDownloadChunksTable, "byId")
          .where((q) => q.eq("id", `${downloadId}:${sequence}`))
          .first();
        if (!chunk) throw new Error("Local sync download is incomplete");
        const changesets = JSON.parse(chunk.payload) as ChangesetArrayType;
        const localChanges: Change[] = [];
        for (const changeset of changesets) {
          const table = registeredSyncableTableNameMap[changeset.tableName];
          if (!table) throw new Error(`Unknown table: ${changeset.tableName}`);
          const toDelete: string[] = [];
          const toUpsert: { id: string; [key: string]: unknown }[] = [];
          for (const { change, row } of changeset.data) {
            if (change.deletedAt !== null) toDelete.push(change.entityId);
            else if (row) toUpsert.push(row);
            const updatedAt = nextClock();
            const localChange: Change = {
              ...change,
              updatedAt,
              clientId,
            };
            localChanges.push(localChange);
            localCovered = maxClientCursor([
              localCovered,
              clientCursorFromChange(localChange),
            ]);
            lastLegacyClock = updatedAt;
          }
          yield* deleteRows(table, toDelete);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          yield* upsert(table, toUpsert as any);
        }
        yield* upsert(changesTable, localChanges);
      }

      yield* updateSyncState({
        updates: {
          lastSentClock: lastLegacyClock,
          lastServerAppliedRevision: session.serverRevision,
          serverConfirmedClientClock: acceptedClientCursor?.clock,
          serverConfirmedClientChangeId: acceptedClientCursor?.changeId,
          localCoveredClientClock: localCovered?.clock,
          localCoveredClientChangeId: localCovered?.changeId,
        },
      });
      const downloadChunks = yield* selectFrom(
        clientSyncDownloadChunksTable,
        "byDownloadSequence",
      ).where((q) => q.eq("downloadId", downloadId));
      const uploadChunks = yield* selectFrom(
        clientSyncUploadChunksTable,
        "byUploadSequence",
      ).where((q) => q.eq("uploadId", uploadId));
      yield* deleteRows(
        clientSyncDownloadChunksTable,
        downloadChunks.map((chunk) => chunk.id),
      );
      yield* deleteRows(clientSyncDownloadSessionsTable, [downloadId]);
      yield* deleteRows(
        clientSyncUploadChunksTable,
        uploadChunks.map((chunk) => chunk.id),
      );
      yield* deleteRows(clientSyncUploadSessionsTable, [uploadId]);
      return true;
    },
  });

export const discardSyncV4Transfer = action({
  name: "discardSyncV4Transfer",
  args: { uploadId: v.string(), downloadId: v.string() },
  handler: function* ({ uploadId, downloadId }) {
    const downloadChunks = yield* selectFrom(
      clientSyncDownloadChunksTable,
      "byDownloadSequence",
    ).where((q) => q.eq("downloadId", downloadId));
    const uploadChunks = yield* selectFrom(
      clientSyncUploadChunksTable,
      "byUploadSequence",
    ).where((q) => q.eq("uploadId", uploadId));
    yield* deleteRows(
      clientSyncDownloadChunksTable,
      downloadChunks.map((chunk) => chunk.id),
    );
    yield* deleteRows(clientSyncDownloadSessionsTable, [downloadId]);
    yield* deleteRows(
      clientSyncUploadChunksTable,
      uploadChunks.map((chunk) => chunk.id),
    );
    yield* deleteRows(clientSyncUploadSessionsTable, [uploadId]);
  },
});

export const createApplyServerChangesIfNoClientChanges = (
  nextClock: () => string,
) =>
  action({
    name: "applyServerChangesIfNoClientChanges",
    args: {
      registeredSyncableTableNameMap: syncableTableNameMapSchema,
      syncState: v.object({
        lastSentClock: v.string(),
      }),
      serverChanges: v.object({
        changesets: changesetArraySchema,
        maxClock: v.string(),
      }),
      clientId: v.string(),
    },
    handler: function* applyServerChangesIfNoClientChanges({
      registeredSyncableTableNameMap,
      syncState,
      serverChanges,
      clientId,
    }) {
      const { changesets } = yield* getChangesetAfter({
        after: syncState.lastSentClock,
        registeredSyncableTableNameMap,
      });
      if (changesets.length !== 0) {
        console.warn(
          "some new client changes appeared, skipping server changes apply",
        );

        return;
      }

      const allChanges: Change[] = [];

      let maxNewClientClock = "";

      for (const changeset of serverChanges.changesets) {
        const toDeleteRows: string[] = [];
        const toUpsertRows: { id: string; [key: string]: unknown }[] = [];

        const table = registeredSyncableTableNameMap[changeset.tableName];
        if (!table) {
          throw new Error("Unknown table: " + changeset.tableName);
        }

        for (const { change, row } of changeset.data) {
          if (change.deletedAt != null) {
            toDeleteRows.push(change.entityId);
          } else if (row) {
            toUpsertRows.push(row);
          }

          const currentClock = nextClock();

          if (currentClock > maxNewClientClock) {
            maxNewClientClock = currentClock;
          }

          allChanges.push({
            id: change.id,
            entityId: change.entityId,
            tableName: table.tableName,
            // TODO: use local createdAt value. Or maybe not?
            createdAt: change.createdAt,
            updatedAt: currentClock,
            deletedAt: change.deletedAt,
            clientId,
            changes: change.changes,
          });
        }

        yield* deleteRows(table, toDeleteRows);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        yield* upsert(table, toUpsertRows as any);
      }

      yield* upsert(changesTable, allChanges);

      yield* updateSyncState({
        updates: {
          lastServerAppliedClock: serverChanges.maxClock,
          lastSentClock: maxNewClientClock,
        },
      });
    },
  });

export const getChangesToSendToServer = action({
  name: "getChangesToSendToServer",
  args: {
    registeredSyncableTableNameMap: syncableTableNameMapSchema,
  },
  handler: function* getChangesToSendToServer({
    registeredSyncableTableNameMap,
  }) {
    const currentSyncState = yield* getSyncStateOrDefault({});

    const { changesets, maxClock } = yield* getChangesetAfter({
      after: currentSyncState.lastSentClock,
      registeredSyncableTableNameMap,
    });

    return { changesets, maxClock };
  },
});

export const resetEmptyPersistedSyncCursor = action({
  name: "resetEmptyPersistedSyncCursor",
  args: {},
  handler: function* resetEmptyPersistedSyncCursor() {
    const currentSyncState = yield* getSyncStateOrDefault({});
    if (
      currentSyncState.lastServerAppliedClock === "" &&
      currentSyncState.lastSentClock === ""
    ) {
      return false;
    }

    const persistedChanges = yield* selectFrom(
      changesTable,
      "byUpdatedAtId",
    ).limit(1);
    if (persistedChanges.length !== 0) {
      return false;
    }

    yield* updateSyncState({
      updates: {
        lastServerAppliedClock: "",
        lastSentClock: "",
      },
    });

    return true;
  },
});
