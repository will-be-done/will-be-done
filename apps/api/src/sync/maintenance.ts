import { asyncDispatch } from "@will-be-done/hyperdb";
import type { FastifyBaseLogger } from "fastify";
import { getLoadedHyperDBs } from "../db/db";
import { cleanupExpiredSyncSessions, getSyncStagingMetrics } from "./actions";

const CLEANUP_BATCH_SIZE = 50;

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
) => {
  for (const { database, db } of getLoadedHyperDBs()) {
    let cleanedUploads: number;
    let cleanedDownloads: number;
    do {
      const cleaned = await asyncDispatch(
        db.withTraits({ type: "skip-sync" }),
        cleanupExpiredSyncSessions({ now: Date.now() }),
      );
      cleanedUploads = cleaned.uploads;
      cleanedDownloads = cleaned.downloads;
    } while (
      cleanedUploads === CLEANUP_BATCH_SIZE ||
      cleanedDownloads === CLEANUP_BATCH_SIZE
    );

    const metrics = await asyncDispatch(db, getSyncStagingMetrics({}));
    stagedBytesByDatabase.set(database, metrics);
    logger.info({ database, ...metrics }, "Sync v4 staging metrics updated");
  }
};
