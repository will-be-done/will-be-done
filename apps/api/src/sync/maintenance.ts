import { asyncDispatch } from "@will-be-done/hyperdb";
import type { FastifyBaseLogger } from "fastify";
import { getLoadedHyperDBs } from "../db/db";
import { cleanupExpiredSyncSessions, getSyncStagingMetrics } from "./actions";

const CLEANUP_ROW_BUDGET = 10_000;
const CLEANUP_PASS_LIMIT = 100;

export type SyncStagingMetrics = {
  uploadBytes: number;
  downloadBytes: number;
  totalBytes: number;
};

const stagedBytesByDatabase = new Map<string, SyncStagingMetrics>();

export const getSyncStagingMetricsSnapshot = () =>
  Object.fromEntries(stagedBytesByDatabase);

export const runSyncMaintenance = async (
  logger: Pick<FastifyBaseLogger, "error" | "info">,
  loadedDatabases = getLoadedHyperDBs(),
) => {
  for (const { database, db } of loadedDatabases) {
    try {
      const cleanup = {
        uploads: 0,
        downloads: 0,
        deletedRows: 0,
        hasMore: false,
        passes: 0,
      };
      do {
        const cleaned = await asyncDispatch(
          db.withTraits({ type: "skip-sync" }),
          cleanupExpiredSyncSessions({
            now: Date.now(),
            maxRows: CLEANUP_ROW_BUDGET,
          }),
        );
        cleanup.uploads += cleaned.uploads;
        cleanup.downloads += cleaned.downloads;
        cleanup.deletedRows += cleaned.deletedRows;
        cleanup.hasMore = cleaned.hasMore;
        cleanup.passes += 1;
      } while (cleanup.hasMore && cleanup.passes < CLEANUP_PASS_LIMIT);

      const metrics = await asyncDispatch(db, getSyncStagingMetrics({}));
      stagedBytesByDatabase.set(database, metrics);
      logger.info(
        { database, cleanup, ...metrics },
        "Sync v4 staging metrics updated",
      );
    } catch (error) {
      logger.error(
        { err: error, database },
        "Sync v4 maintenance failed for database",
      );
    }
  }
};
