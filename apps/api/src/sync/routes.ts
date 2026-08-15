import { createHash } from "node:crypto";
import { asyncDispatch, type DB } from "@will-be-done/hyperdb";
import {
  SYNC_V4_MAX_CHUNK_BYTES,
  SYNC_V4_MAX_CHUNK_CHANGES,
  SYNC_V4_MAX_SESSION_BYTES,
  SYNC_V4_MAX_SESSION_CHUNKS,
  SYNC_V4_SESSION_TTL_MS,
  ChangesetArray,
  SyncCommitRequestSchema,
  SyncSessionRequestSchema,
  SyncUploadChunkSchema,
} from "@will-be-done/slices/common";
import type { FastifyPluginAsync } from "fastify";
import { ZodError } from "zod";
import { dbConfigByType } from "../db/configs";
import { getHyperDB } from "../db/db";
import { authenticateRequest } from "../services/authentication";
import { ensureDatabaseAccessOrCreate } from "../services/databaseAccess";
import {
  acknowledgeDownload,
  cleanupExpiredSyncSessions,
  commitSyncUpload,
  getDownloadChunk,
  getUploadManifest,
  getUploadSession,
  stageUploadChunk,
  startSyncUpload,
} from "./actions";

type DatabaseParams = { dbType: "user" | "space"; dbId: string };
type UploadParams = DatabaseParams & { uploadId: string };
type ChunkParams = UploadParams & { sequence: string };
type DownloadParams = DatabaseParams & {
  downloadId: string;
  sequence?: string;
};

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

const tableRank = (tableName: string) => {
  const ranks: Record<string, number> = {
    spaces: 0,
    projects: 0,
    project_sections: 10,
    daily_lists: 20,
    tasks: 30,
    task_templates: 30,
    checklist_items: 40,
    daily_entries: 50,
    stash_entries: 50,
  };
  return ranks[tableName] ?? 1_000;
};

const prepare = async (
  request: Parameters<typeof authenticateRequest>[0],
  params: DatabaseParams,
  mainDB?: DB,
) => {
  if (params.dbType !== "user" && params.dbType !== "space") {
    throw new Error("Invalid database type");
  }
  const user = await authenticateRequest(request, undefined, mainDB);
  if (!user) return null;
  await ensureDatabaseAccessOrCreate({ ...params, userId: user.id }, mainDB);
  const config = dbConfigByType(params.dbType, params.dbId);
  const hyper = await getHyperDB(config);
  return { user, config, ...hyper };
};

export const syncV4Routes: FastifyPluginAsync<{ mainDB?: DB }> = async (
  server,
  options,
) => {
  server.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: "Invalid sync request" });
    }
    const knownError =
      error instanceof Error ? error : new Error(String(error));
    if (knownError.name === "DatabaseAccessDeniedError") {
      return reply.code(403).send({ error: "Forbidden" });
    }
    if (knownError.name === "ResourceNotFoundError") {
      return reply.code(404).send({ error: knownError.message });
    }
    request.log.error(knownError, "Sync v4 request failed");
    return reply.code(500).send({ error: knownError.message });
  });

  server.post<{ Params: DatabaseParams }>(
    "/:dbType/:dbId/sessions",
    async (request, reply) => {
      const prepared = await prepare(request, request.params, options.mainDB);
      if (!prepared) return reply.code(401).send({ error: "Unauthorized" });
      const body = SyncSessionRequestSchema.parse(request.body);
      if (
        body.dbId !== request.params.dbId ||
        body.dbType !== request.params.dbType
      ) {
        return reply.code(400).send({ error: "Database path and body differ" });
      }
      const now = Date.now();
      await asyncDispatch(
        prepared.db.withTraits({ type: "skip-sync" }),
        cleanupExpiredSyncSessions({ now }),
      );
      const result = await asyncDispatch(
        prepared.db.withTraits({ type: "skip-sync" }),
        startSyncUpload({
          userId: prepared.user.id,
          request: body,
          now,
          expiresAt: now + SYNC_V4_SESSION_TTL_MS,
        }),
      );
      return {
        ...result,
        limits: {
          maxChunkChanges: SYNC_V4_MAX_CHUNK_CHANGES,
          maxChunkBytes: SYNC_V4_MAX_CHUNK_BYTES,
        },
      };
    },
  );

  server.put<{ Params: ChunkParams }>(
    "/:dbType/:dbId/sessions/:uploadId/chunks/:sequence",
    async (request, reply) => {
      const prepared = await prepare(request, request.params, options.mainDB);
      if (!prepared) return reply.code(401).send({ error: "Unauthorized" });
      const sequence = Number(request.params.sequence);
      if (
        !Number.isSafeInteger(sequence) ||
        sequence < 0 ||
        sequence >= SYNC_V4_MAX_SESSION_CHUNKS
      ) {
        return reply.code(400).send({ error: "Invalid chunk sequence" });
      }
      const chunk = SyncUploadChunkSchema.parse(request.body);
      const payload = chunk.payload;
      if (
        Buffer.byteLength(payload) > SYNC_V4_MAX_CHUNK_BYTES ||
        sha256(payload) !== chunk.checksum
      ) {
        return reply.code(400).send({ error: "Invalid sync chunk" });
      }
      let changesets;
      try {
        changesets = ChangesetArray.parse(JSON.parse(payload));
      } catch (error) {
        if (error instanceof SyntaxError) {
          return reply.code(400).send({ error: "Invalid sync chunk" });
        }
        throw error;
      }
      const changeCount = changesets.reduce(
        (sum, changeset) => sum + changeset.data.length,
        0,
      );
      const byteCount = Buffer.byteLength(payload);
      if (changeCount === 0 || changeCount > SYNC_V4_MAX_CHUNK_CHANGES) {
        return reply.code(400).send({ error: "Invalid sync chunk" });
      }
      const session = await asyncDispatch(
        prepared.db,
        getUploadSession({ uploadId: request.params.uploadId }),
      );
      if (!session || session.userId !== prepared.user.id) {
        return reply.code(404).send({ error: "Upload session not found" });
      }
      const tableRanks = Object.fromEntries(
        Object.keys(prepared.config.tableNameMap).map((name) => [
          name,
          tableRank(name),
        ]),
      );
      return await asyncDispatch(
        prepared.db.withTraits({ type: "skip-sync" }),
        stageUploadChunk({
          uploadId: request.params.uploadId,
          sequence,
          byteCount,
          chunk: { checksum: chunk.checksum, changesets },
          tableNameMap: prepared.config.tableNameMap,
          tableRanks,
          maxSessionBytes: SYNC_V4_MAX_SESSION_BYTES,
          now: Date.now(),
        }),
      );
    },
  );

  server.post<{ Params: UploadParams }>(
    "/:dbType/:dbId/sessions/:uploadId/commit",
    async (request, reply) => {
      const prepared = await prepare(request, request.params, options.mainDB);
      if (!prepared) return reply.code(401).send({ error: "Unauthorized" });
      const body = SyncCommitRequestSchema.parse(request.body);
      if (body.chunkCount > SYNC_V4_MAX_SESSION_CHUNKS) {
        return reply.code(400).send({ error: "Too many sync chunks" });
      }
      const manifest = await asyncDispatch(
        prepared.db,
        getUploadManifest({ uploadId: request.params.uploadId }),
      );
      if (!manifest.session || manifest.session.userId !== prepared.user.id) {
        return reply.code(404).send({ error: "Upload session not found" });
      }
      const chunks = [...manifest.chunks].sort(
        (a, b) => a.sequence - b.sequence,
      );
      const validManifest =
        chunks.length === body.chunkCount &&
        chunks.every((chunk, index) => chunk.sequence === index) &&
        chunks.reduce((sum, chunk) => sum + chunk.changeCount, 0) ===
          body.changeCount &&
        sha256(chunks.map((chunk) => chunk.checksum).join("\n")) ===
          body.checksum;
      if (!validManifest) {
        return reply.code(409).send({ error: "Incomplete sync upload" });
      }
      prepared.nextClock.observe([manifest.session.maxObservedClock]);
      const orderedTableNames = Object.keys(prepared.config.tableNameMap).sort(
        (a, b) => tableRank(a) - tableRank(b) || a.localeCompare(b),
      );
      const now = Date.now();
      return await asyncDispatch(
        prepared.db.withTraits({ type: "skip-sync" }),
        commitSyncUpload({
          uploadId: request.params.uploadId,
          userId: prepared.user.id,
          request: body,
          registeredSyncableTableNameMap: prepared.config.tableNameMap,
          orderedTableNames,
          dbType: request.params.dbType,
          serverClientId: prepared.clientId,
          nextClock: prepared.nextClock(),
          now,
          expiresAt: now + SYNC_V4_SESSION_TTL_MS,
        }),
      );
    },
  );

  server.get<{ Params: DownloadParams }>(
    "/:dbType/:dbId/downloads/:downloadId/chunks/:sequence",
    async (request, reply) => {
      const prepared = await prepare(request, request.params, options.mainDB);
      if (!prepared) return reply.code(401).send({ error: "Unauthorized" });
      const sequence = Number(request.params.sequence);
      const chunk = await asyncDispatch(
        prepared.db,
        getDownloadChunk({
          downloadId: request.params.downloadId,
          sequence,
          userId: prepared.user.id,
          now: Date.now(),
        }),
      );
      if (!chunk) return reply.code(404).send({ error: "Chunk not found" });
      return {
        sequence: chunk.sequence,
        checksum: chunk.checksum,
        changesets: JSON.parse(chunk.payload),
      };
    },
  );

  server.post<{ Params: DownloadParams }>(
    "/:dbType/:dbId/downloads/:downloadId/ack",
    async (request, reply) => {
      const prepared = await prepare(request, request.params, options.mainDB);
      if (!prepared) return reply.code(401).send({ error: "Unauthorized" });
      return {
        acknowledged: await asyncDispatch(
          prepared.db.withTraits({ type: "skip-sync" }),
          acknowledgeDownload({
            downloadId: request.params.downloadId,
            userId: prepared.user.id,
          }),
        ),
      };
    },
  );
};
