import { purgeExpiredTrash } from "@will-be-done/slices/space";
import { Cause, Clock, Effect } from "effect";
import type { FastifyBaseLogger } from "fastify";
import type { LoadedDatabase } from "../db/db";
import { Databases } from "../services/databases";
import { dispatch } from "../services/hyperdb";
import { cleanupExpiredSyncSessions, getSyncStagingMetrics } from "./actions";

const CLEANUP_ROW_BUDGET = 10_000;
const CLEANUP_PASS_LIMIT = 100;

export type SyncStagingMetrics = {
  uploadBytes: number;
  downloadBytes: number;
  totalBytes: number;
};

type MaintenanceLogger = Pick<FastifyBaseLogger, "error" | "info">;

const stagedBytesByDatabase = new Map<string, SyncStagingMetrics>();

export const getSyncStagingMetricsSnapshot = () =>
  Object.fromEntries(stagedBytesByDatabase);

const maintainDatabase = Effect.fn("sync.maintainDatabase")(function* (
  logger: MaintenanceLogger,
  { database, dbType, db }: LoadedDatabase,
) {
  // Browsers purge too; this covers spaces used only through the API.
  if (dbType === "space") {
    yield* dispatch(
      db,
      purgeExpiredTrash({ now: yield* Clock.currentTimeMillis }),
    );
  }
  const cleanup = {
    uploads: 0,
    downloads: 0,
    deletedRows: 0,
    hasMore: false,
    passes: 0,
  };
  do {
    const cleaned = yield* dispatch(
      db.withTraits({ type: "skip-sync" }),
      cleanupExpiredSyncSessions({
        now: yield* Clock.currentTimeMillis,
        maxRows: CLEANUP_ROW_BUDGET,
      }),
    );
    cleanup.uploads += cleaned.uploads;
    cleanup.downloads += cleaned.downloads;
    cleanup.deletedRows += cleaned.deletedRows;
    cleanup.hasMore = cleaned.hasMore;
    cleanup.passes += 1;
  } while (cleanup.hasMore && cleanup.passes < CLEANUP_PASS_LIMIT);

  const metrics = yield* dispatch(db, getSyncStagingMetrics({}));
  stagedBytesByDatabase.set(database, metrics);
  logger.info(
    { database, cleanup, ...metrics },
    "Sync v4 staging metrics updated",
  );
});

export const runSyncMaintenance = Effect.fn("sync.runMaintenance")(function* (
  logger: MaintenanceLogger,
) {
  for (const loaded of yield* Databases.use((databases) => databases.loaded)) {
    yield* maintainDatabase(logger, loaded).pipe(
      Effect.catchCause((cause) =>
        Effect.sync(() =>
          logger.error(
            { err: Cause.squash(cause), database: loaded.database },
            "Sync v4 maintenance failed for database",
          ),
        ),
      ),
    );
  }
});
