import { createHash } from "node:crypto";
import type { HyperDB } from "@will-be-done/hyperdb";
import { Clock, Effect } from "effect";
import type { z } from "zod";
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
import { dispatch } from "../services/hyperdb";
import {
  isSyncError,
  SyncInvalidRequestError,
  SyncSessionNotFoundError,
  syncClockSkew,
} from "./errors";

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export const SYNC_V4_SMALL_BODY_LIMIT = 64 * 1024;
// The decoded payload is capped at 1 MiB. Its outer JSON string may be larger
// because quotes and backslashes are escaped a second time.
export const SYNC_V4_CHUNK_BODY_LIMIT = SYNC_V4_MAX_CHUNK_BYTES * 4;

// Sync actions throw their errors to roll back the transaction.
const syncDispatch = <A>(db: HyperDB, action: Generator<unknown, A, unknown>) =>
  dispatch(db, action).pipe(
    Effect.catchDefect((defect) =>
      isSyncError(defect) ? Effect.fail(defect) : Effect.die(defect),
    ),
  );

const parse = <T>(schema: z.ZodType<T>, value: unknown, message: string) => {
  const result = schema.safeParse(value);
  return result.success
    ? Effect.succeed(result.data)
    : Effect.fail(new SyncInvalidRequestError({ message }));
};

const invalid = (message: string) =>
  Effect.fail(new SyncInvalidRequestError({ message }));

export type ServerSyncV4Dependencies = {
  db: HyperDB;
  dbConfig: DBConfig;
  nextClock: HlcClock;
  serverClientId: string;
  userId: string;
};

export const createServerSyncV4 = ({
  db,
  dbConfig,
  nextClock,
  serverClientId,
  userId,
}: ServerSyncV4Dependencies) => ({
  createSession: Effect.fn("sync.createSession")(function* (body: unknown) {
    const request = yield* parse(
      SyncSessionRequestSchema,
      body,
      "Invalid sync request",
    );
    if (request.dbId !== dbConfig.dbId || request.dbType !== dbConfig.dbType) {
      return yield* invalid("Database path and body differ");
    }
    const startedAt = yield* Clock.currentTimeMillis;
    const result = yield* syncDispatch(
      db.withTraits({ type: "skip-sync" }),
      startSyncUpload({
        userId,
        request,
        now: startedAt,
        expiresAt: startedAt + SYNC_V4_SESSION_TTL_MS,
      }),
    );
    const response: SyncSessionResponse = {
      ...result,
      serverTimeMs: yield* Clock.currentTimeMillis,
      limits: {
        maxChunkChanges: SYNC_V4_MAX_CHUNK_CHANGES,
        maxChunkBytes: SYNC_V4_MAX_CHUNK_BYTES,
        maxFutureSkewMs: SYNC_V4_MAX_FUTURE_SKEW_MS,
      },
    };
    return response;
  }),

  putChunk: Effect.fn("sync.putChunk")(function* (
    uploadId: string,
    sequenceValue: unknown,
    body: unknown,
  ) {
    const sequence = Number(sequenceValue);
    if (
      !Number.isSafeInteger(sequence) ||
      sequence < 0 ||
      sequence >= SYNC_V4_MAX_SESSION_CHUNKS
    ) {
      return yield* invalid("Invalid chunk sequence");
    }
    const chunk = yield* parse(
      SyncUploadChunkSchema,
      body,
      "Invalid sync request",
    );
    const byteCount = Buffer.byteLength(chunk.payload);
    if (
      byteCount > SYNC_V4_MAX_CHUNK_BYTES ||
      sha256(chunk.payload) !== chunk.checksum
    ) {
      return yield* invalid("Invalid sync chunk");
    }
    const payload = yield* Effect.try({
      try: (): unknown => JSON.parse(chunk.payload),
      catch: () =>
        new SyncInvalidRequestError({ message: "Invalid sync chunk" }),
    });
    const changesets = yield* parse(
      ChangesetArray,
      payload,
      "Invalid sync request",
    );
    const changeCount = changesets.reduce(
      (sum, changeset) => sum + changeset.data.length,
      0,
    );
    if (changeCount === 0 || changeCount > SYNC_V4_MAX_CHUNK_CHANGES) {
      return yield* invalid("Invalid sync chunk");
    }
    for (const changeset of changesets) {
      if (!dbConfig.tableNameMap[changeset.tableName]) {
        return yield* invalid(`Unknown sync table: ${changeset.tableName}`);
      }
    }
    return yield* syncDispatch(
      db.withTraits({ type: "skip-sync" }),
      stageUploadChunk({
        uploadId,
        userId,
        sequence,
        byteCount,
        chunk: { checksum: chunk.checksum, changesets },
        tableNameMap: dbConfig.tableNameMap,
        now: yield* Clock.currentTimeMillis,
      }),
    );
  }),

  commit: Effect.fn("sync.commit")(function* (uploadId: string, body: unknown) {
    const request = yield* parse(
      SyncCommitRequestSchema,
      body,
      "Invalid sync request",
    );
    if (request.chunkCount > SYNC_V4_MAX_SESSION_CHUNKS) {
      return yield* invalid("Too many sync chunks");
    }
    const session = yield* syncDispatch(db, getUploadSession({ uploadId }));
    if (!session || session.userId !== userId) {
      return yield* new SyncSessionNotFoundError({
        message: "Upload session not found",
      });
    }
    const committedAt = yield* Clock.currentTimeMillis;
    const clockSkew = syncClockSkew(session.maxObservedClock, committedAt);
    if (clockSkew) return yield* clockSkew;
    nextClock.observe([session.maxObservedClock]);
    const response: SyncCommitResponse = yield* syncDispatch(
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
    return response;
  }),

  readDownloadChunk: Effect.fn("sync.readDownloadChunk")(function* (
    downloadId: string,
    sequenceValue: unknown,
  ) {
    const sequence = Number(sequenceValue);
    if (!Number.isSafeInteger(sequence) || sequence < 0) {
      return yield* invalid("Invalid chunk sequence");
    }
    const chunk = yield* syncDispatch(
      db,
      getDownloadChunk({
        downloadId,
        sequence,
        userId,
        now: yield* Clock.currentTimeMillis,
      }),
    );
    if (!chunk) {
      return yield* new SyncSessionNotFoundError({
        message: "Chunk not found",
      });
    }
    return {
      sequence: chunk.sequence,
      checksum: chunk.checksum,
      changesets: JSON.parse(chunk.payload) as unknown,
    };
  }),

  acknowledgeDownload: Effect.fn("sync.acknowledgeDownload")(function* (
    downloadId: string,
  ) {
    return {
      acknowledged: yield* syncDispatch(
        db.withTraits({ type: "skip-sync" }),
        acknowledgeDownload({ downloadId, userId }),
      ),
    };
  }),
});

export type ServerSyncV4 = ReturnType<typeof createServerSyncV4>;
