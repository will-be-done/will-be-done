import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { Cause, Effect, Option } from "effect";
import { dbConfigByType } from "../db/configs";
import { runRequest, type RequestServices } from "../runtime";
import { requireUser } from "../services/authentication";
import { ensureDatabaseAccessOrCreate } from "../services/databaseAccess";
import { Databases } from "../services/databases";
import type { ServiceError } from "../services/errors";
import { SyncInvalidRequestError, type SyncError } from "./errors";
import { runSyncMaintenance } from "./maintenance";
import {
  createServerSyncV4,
  SYNC_V4_CHUNK_BODY_LIMIT,
  SYNC_V4_SMALL_BODY_LIMIT,
  type ServerSyncV4,
} from "./serverSyncV4";

type DatabaseParams = { dbType: "user" | "space"; dbId: string };
type UploadParams = DatabaseParams & { uploadId: string };
type ChunkParams = UploadParams & { sequence: string };
type DownloadParams = DatabaseParams & {
  downloadId: string;
  sequence?: string;
};

const SYNC_MAINTENANCE_INTERVAL_MS = 15 * 60 * 1000;

const prepare = Effect.fn("sync.prepare")(function* (
  request: FastifyRequest,
  params: DatabaseParams,
) {
  if (params.dbType !== "user" && params.dbType !== "space") {
    return yield* new SyncInvalidRequestError({
      message: "Invalid database type",
    });
  }
  const user = yield* requireUser(request);
  yield* ensureDatabaseAccessOrCreate({ ...params, userId: user.id });
  const config = dbConfigByType(params.dbType, params.dbId);
  const hyper = yield* Databases.use((databases) => databases.open(config));
  return createServerSyncV4({
    db: hyper.db,
    dbConfig: config,
    nextClock: hyper.nextClock,
    serverClientId: hyper.clientId,
    userId: user.id,
  });
});

const sendSyncError = (
  reply: FastifyReply,
  error: SyncError | ServiceError,
) => {
  switch (error._tag) {
    case "UnauthorizedError":
      return reply.code(401).send({ error: "Unauthorized" });
    case "BadRequestError":
    case "SyncInvalidRequestError":
      return reply.code(400).send({ error: error.message });
    case "DatabaseAccessDeniedError":
      return reply.code(403).send({ error: "Forbidden" });
    case "ResourceNotFoundError":
    case "SyncSessionNotFoundError":
      return reply.code(404).send({ error: error.message });
    case "SyncClientCursorAdvancedError":
      return reply.code(409).send({ error: error.message, code: error.code });
    case "ConflictError":
    case "SyncConflictError":
      return reply.code(409).send({ error: error.message });
    case "SyncClockSkewError":
      return reply.code(422).send({
        error: error.message,
        code: error.code,
        observedClock: error.observedClock,
        serverTimeMs: error.serverTimeMs,
        maxFutureSkewMs: error.maxFutureSkewMs,
      });
  }
};

const runSyncRoute = <A, E extends SyncError | ServiceError>(
  request: FastifyRequest<{ Params: DatabaseParams }>,
  reply: FastifyReply,
  handle: (sync: ServerSyncV4) => Effect.Effect<A, E, RequestServices>,
) =>
  runRequest(
    request,
    prepare(request, request.params).pipe(
      Effect.flatMap(handle),
      Effect.catchCause((cause: Cause.Cause<SyncError | ServiceError>) =>
        Effect.sync(() => {
          const error = Cause.findErrorOption(cause);
          if (Option.isSome(error)) return sendSyncError(reply, error.value);
          request.log.error(Cause.squash(cause), "Sync v4 request failed");
          return reply.code(500).send({ error: "Internal server error" });
        }),
      ),
    ),
  );

export const syncV4Routes: FastifyPluginAsync = async (server) => {
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

  // Errors raised before the handler runs, such as body parsing.
  server.setErrorHandler((error, request, reply) => {
    if ((error as { code?: string }).code === "FST_ERR_CTP_BODY_TOO_LARGE") {
      return reply.code(413).send({ error: "Sync request body is too large" });
    }
    request.log.error(error, "Sync v4 request failed");
    return reply.code(500).send({ error: "Internal server error" });
  });

  server.post<{ Params: DatabaseParams }>(
    "/:dbType/:dbId/sessions",
    { bodyLimit: SYNC_V4_SMALL_BODY_LIMIT },
    async (request, reply) => {
      return runSyncRoute(request, reply, (sync) =>
        sync.createSession(request.body),
      );
    },
  );

  server.put<{ Params: ChunkParams }>(
    "/:dbType/:dbId/sessions/:uploadId/chunks/:sequence",
    { bodyLimit: SYNC_V4_CHUNK_BODY_LIMIT },
    async (request, reply) => {
      return runSyncRoute(request, reply, (sync) =>
        sync.putChunk(
          request.params.uploadId,
          request.params.sequence,
          request.body,
        ),
      );
    },
  );

  server.post<{ Params: UploadParams }>(
    "/:dbType/:dbId/sessions/:uploadId/commit",
    { bodyLimit: SYNC_V4_SMALL_BODY_LIMIT },
    async (request, reply) => {
      return runSyncRoute(request, reply, (sync) =>
        sync.commit(request.params.uploadId, request.body),
      );
    },
  );

  server.get<{ Params: DownloadParams }>(
    "/:dbType/:dbId/downloads/:downloadId/chunks/:sequence",
    async (request, reply) => {
      return runSyncRoute(request, reply, (sync) =>
        sync.readDownloadChunk(
          request.params.downloadId,
          request.params.sequence,
        ),
      );
    },
  );

  server.post<{ Params: DownloadParams }>(
    "/:dbType/:dbId/downloads/:downloadId/ack",
    { bodyLimit: SYNC_V4_SMALL_BODY_LIMIT },
    async (request, reply) => {
      return runSyncRoute(request, reply, (sync) =>
        sync.acknowledgeDownload(request.params.downloadId),
      );
    },
  );
};
