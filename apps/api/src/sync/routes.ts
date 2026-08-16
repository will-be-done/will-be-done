import type { DB } from "@will-be-done/hyperdb";
import type { FastifyPluginAsync } from "fastify";
import { ZodError } from "zod";
import { dbConfigByType } from "../db/configs";
import { getHyperDB } from "../db/db";
import { authenticateRequest } from "../services/authentication";
import { ensureDatabaseAccessOrCreate } from "../services/databaseAccess";
import {
  SyncClockSkewError,
  SyncConflictError,
  SyncInvalidRequestError,
  SyncSessionNotFoundError,
} from "./errors";
import { runSyncMaintenance } from "./maintenance";
import {
  createServerSyncV4,
  SYNC_V4_CHUNK_BODY_LIMIT,
  SYNC_V4_SMALL_BODY_LIMIT,
} from "./serverSyncV4";

type DatabaseParams = { dbType: "user" | "space"; dbId: string };
type UploadParams = DatabaseParams & { uploadId: string };
type ChunkParams = UploadParams & { sequence: string };
type DownloadParams = DatabaseParams & {
  downloadId: string;
  sequence?: string;
};

const SYNC_MAINTENANCE_INTERVAL_MS = 15 * 60 * 1000;

const prepare = async (
  request: Parameters<typeof authenticateRequest>[0],
  params: DatabaseParams,
  mainDB?: DB,
) => {
  if (params.dbType !== "user" && params.dbType !== "space") {
    throw new SyncInvalidRequestError("Invalid database type");
  }
  const user = await authenticateRequest(request, undefined, mainDB);
  if (!user) return null;
  await ensureDatabaseAccessOrCreate({ ...params, userId: user.id }, mainDB);
  const config = dbConfigByType(params.dbType, params.dbId);
  const hyper = await getHyperDB(config);
  return createServerSyncV4({
    db: hyper.db,
    dbConfig: config,
    nextClock: hyper.nextClock,
    serverClientId: hyper.clientId,
    userId: user.id,
  });
};

export const syncV4Routes: FastifyPluginAsync<{ mainDB?: DB }> = async (
  server,
  options,
) => {
  let maintenanceRunning = false;
  const maintain = async () => {
    if (maintenanceRunning) return;
    maintenanceRunning = true;
    try {
      await runSyncMaintenance(server.log);
    } catch (error) {
      server.log.error({ err: error }, "Sync v4 maintenance failed");
    } finally {
      maintenanceRunning = false;
    }
  };
  let maintenanceInterval: ReturnType<typeof setInterval> | undefined;
  server.addHook("onReady", async () => {
    await maintain();
    maintenanceInterval = setInterval(
      () => void maintain(),
      SYNC_MAINTENANCE_INTERVAL_MS,
    );
    maintenanceInterval.unref?.();
  });
  server.addHook("onClose", async () => {
    if (maintenanceInterval) clearInterval(maintenanceInterval);
  });

  server.setErrorHandler((error, request, reply) => {
    if ((error as { code?: string }).code === "FST_ERR_CTP_BODY_TOO_LARGE") {
      return reply.code(413).send({ error: "Sync request body is too large" });
    }
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: "Invalid sync request" });
    }
    if (error instanceof SyncInvalidRequestError) {
      return reply.code(400).send({ error: error.message });
    }
    const knownError =
      error instanceof Error ? error : new Error(String(error));
    if (knownError.name === "DatabaseAccessDeniedError") {
      return reply.code(403).send({ error: "Forbidden" });
    }
    if (knownError.name === "ResourceNotFoundError") {
      return reply.code(404).send({ error: knownError.message });
    }
    if (knownError instanceof SyncSessionNotFoundError) {
      return reply.code(404).send({ error: knownError.message });
    }
    if (knownError instanceof SyncConflictError) {
      return reply.code(409).send({ error: knownError.message });
    }
    if (knownError instanceof SyncClockSkewError) {
      return reply.code(422).send({
        error: knownError.message,
        code: knownError.code,
        observedClock: knownError.observedClock,
        serverTimeMs: knownError.serverTimeMs,
        maxFutureSkewMs: knownError.maxFutureSkewMs,
      });
    }
    request.log.error(knownError, "Sync v4 request failed");
    return reply.code(500).send({ error: "Internal server error" });
  });

  server.post<{ Params: DatabaseParams }>(
    "/:dbType/:dbId/sessions",
    { bodyLimit: SYNC_V4_SMALL_BODY_LIMIT },
    async (request, reply) => {
      const sync = await prepare(request, request.params, options.mainDB);
      if (!sync) return reply.code(401).send({ error: "Unauthorized" });
      return await sync.createSession(request.body);
    },
  );

  server.put<{ Params: ChunkParams }>(
    "/:dbType/:dbId/sessions/:uploadId/chunks/:sequence",
    { bodyLimit: SYNC_V4_CHUNK_BODY_LIMIT },
    async (request, reply) => {
      const sync = await prepare(request, request.params, options.mainDB);
      if (!sync) return reply.code(401).send({ error: "Unauthorized" });
      return await sync.putChunk(
        request.params.uploadId,
        request.params.sequence,
        request.body,
      );
    },
  );

  server.post<{ Params: UploadParams }>(
    "/:dbType/:dbId/sessions/:uploadId/commit",
    { bodyLimit: SYNC_V4_SMALL_BODY_LIMIT },
    async (request, reply) => {
      const sync = await prepare(request, request.params, options.mainDB);
      if (!sync) return reply.code(401).send({ error: "Unauthorized" });
      return await sync.commit(request.params.uploadId, request.body);
    },
  );

  server.get<{ Params: DownloadParams }>(
    "/:dbType/:dbId/downloads/:downloadId/chunks/:sequence",
    async (request, reply) => {
      const sync = await prepare(request, request.params, options.mainDB);
      if (!sync) return reply.code(401).send({ error: "Unauthorized" });
      return await sync.readDownloadChunk(
        request.params.downloadId,
        request.params.sequence,
      );
    },
  );

  server.post<{ Params: DownloadParams }>(
    "/:dbType/:dbId/downloads/:downloadId/ack",
    { bodyLimit: SYNC_V4_SMALL_BODY_LIMIT },
    async (request, reply) => {
      const sync = await prepare(request, request.params, options.mainDB);
      if (!sync) return reply.code(401).send({ error: "Unauthorized" });
      return await sync.acknowledgeDownload(request.params.downloadId);
    },
  );
};
