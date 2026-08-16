import { createHash } from "node:crypto";
import { asyncDispatch, type SubscribableDB } from "@will-be-done/hyperdb";
import {
  ChangesetArray,
  SyncCommitRequestSchema,
  SyncSessionRequestSchema,
  SyncUploadChunkSchema,
  SYNC_V4_MAX_CHUNK_BYTES,
  SYNC_V4_MAX_CHUNK_CHANGES,
  SYNC_V4_MAX_FUTURE_SKEW_MS,
  SYNC_V4_MAX_SESSION_CHUNKS,
  SYNC_V4_SESSION_TTL_MS,
  type HlcClock,
  type SyncCommitResponse,
  type SyncSessionResponse,
} from "@will-be-done/slices/common";
import type { DBConfig } from "../db/db";
import {
  acknowledgeDownload,
  commitSyncUpload,
  getDownloadChunk,
  getUploadSession,
  stageUploadChunk,
  startSyncUpload,
} from "./actions";
import {
  assertSyncClockWithinFutureSkew,
  SyncInvalidRequestError,
  SyncSessionNotFoundError,
} from "./errors";

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export const SYNC_V4_SMALL_BODY_LIMIT = 64 * 1024;
// The decoded payload is capped at 1 MiB. Its outer JSON string may be larger
// because quotes and backslashes are escaped a second time.
export const SYNC_V4_CHUNK_BODY_LIMIT = SYNC_V4_MAX_CHUNK_BYTES * 4;

export type ServerSyncV4Dependencies = {
  db: SubscribableDB;
  dbConfig: DBConfig;
  nextClock: HlcClock;
  serverClientId: string;
  userId: string;
  now?: () => number;
};

export const createServerSyncV4 = ({
  db,
  dbConfig,
  nextClock,
  serverClientId,
  userId,
  now = Date.now,
}: ServerSyncV4Dependencies) => ({
  async createSession(body: unknown): Promise<SyncSessionResponse> {
    const request = SyncSessionRequestSchema.parse(body);
    if (request.dbId !== dbConfig.dbId || request.dbType !== dbConfig.dbType) {
      throw new SyncInvalidRequestError("Database path and body differ");
    }
    const startedAt = now();
    const result = await asyncDispatch(
      db.withTraits({ type: "skip-sync" }),
      startSyncUpload({
        userId,
        request,
        now: startedAt,
        expiresAt: startedAt + SYNC_V4_SESSION_TTL_MS,
      }),
    );
    return {
      ...result,
      serverTimeMs: now(),
      limits: {
        maxChunkChanges: SYNC_V4_MAX_CHUNK_CHANGES,
        maxChunkBytes: SYNC_V4_MAX_CHUNK_BYTES,
        maxFutureSkewMs: SYNC_V4_MAX_FUTURE_SKEW_MS,
      },
    };
  },

  async putChunk(uploadId: string, sequenceValue: unknown, body: unknown) {
    const sequence = Number(sequenceValue);
    if (
      !Number.isSafeInteger(sequence) ||
      sequence < 0 ||
      sequence >= SYNC_V4_MAX_SESSION_CHUNKS
    ) {
      throw new SyncInvalidRequestError("Invalid chunk sequence");
    }
    const chunk = SyncUploadChunkSchema.parse(body);
    const byteCount = Buffer.byteLength(chunk.payload);
    if (
      byteCount > SYNC_V4_MAX_CHUNK_BYTES ||
      sha256(chunk.payload) !== chunk.checksum
    ) {
      throw new SyncInvalidRequestError("Invalid sync chunk");
    }
    let changesets;
    try {
      changesets = ChangesetArray.parse(JSON.parse(chunk.payload));
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new SyncInvalidRequestError("Invalid sync chunk");
      }
      throw error;
    }
    const changeCount = changesets.reduce(
      (sum, changeset) => sum + changeset.data.length,
      0,
    );
    if (changeCount === 0 || changeCount > SYNC_V4_MAX_CHUNK_CHANGES) {
      throw new SyncInvalidRequestError("Invalid sync chunk");
    }
    for (const changeset of changesets) {
      if (!dbConfig.tableNameMap[changeset.tableName]) {
        throw new SyncInvalidRequestError(
          `Unknown sync table: ${changeset.tableName}`,
        );
      }
    }
    return await asyncDispatch(
      db.withTraits({ type: "skip-sync" }),
      stageUploadChunk({
        uploadId,
        userId,
        sequence,
        byteCount,
        chunk: { checksum: chunk.checksum, changesets },
        tableNameMap: dbConfig.tableNameMap,
        now: now(),
      }),
    );
  },

  async commit(uploadId: string, body: unknown): Promise<SyncCommitResponse> {
    const request = SyncCommitRequestSchema.parse(body);
    if (request.chunkCount > SYNC_V4_MAX_SESSION_CHUNKS) {
      throw new SyncInvalidRequestError("Too many sync chunks");
    }
    const session = await asyncDispatch(db, getUploadSession({ uploadId }));
    if (!session || session.userId !== userId) {
      throw new SyncSessionNotFoundError("Upload session not found");
    }
    const committedAt = now();
    assertSyncClockWithinFutureSkew(session.maxObservedClock, committedAt);
    nextClock.observe([session.maxObservedClock]);
    return await asyncDispatch(
      db.withTraits({ type: "skip-sync" }),
      commitSyncUpload({
        uploadId,
        userId,
        request,
        registeredSyncableTableNameMap: dbConfig.tableNameMap,
        orderedTableNames: dbConfig.syncTableNamesInDependencyOrder,
        dbType: dbConfig.dbType,
        serverClientId,
        nextClock: nextClock(),
        now: committedAt,
        expiresAt: committedAt + SYNC_V4_SESSION_TTL_MS,
      }),
    );
  },

  async readDownloadChunk(downloadId: string, sequenceValue: unknown) {
    const sequence = Number(sequenceValue);
    if (!Number.isSafeInteger(sequence) || sequence < 0) {
      throw new SyncInvalidRequestError("Invalid chunk sequence");
    }
    const chunk = await asyncDispatch(
      db,
      getDownloadChunk({ downloadId, sequence, userId, now: now() }),
    );
    if (!chunk) throw new SyncSessionNotFoundError("Chunk not found");
    return {
      sequence: chunk.sequence,
      checksum: chunk.checksum,
      changesets: JSON.parse(chunk.payload),
    };
  },

  async acknowledgeDownload(downloadId: string) {
    return {
      acknowledged: await asyncDispatch(
        db.withTraits({ type: "skip-sync" }),
        acknowledgeDownload({ downloadId, userId }),
      ),
    };
  },
});

export type ServerSyncV4 = ReturnType<typeof createServerSyncV4>;
