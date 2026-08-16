import { asyncDispatch } from "@will-be-done/hyperdb";
import type { FastifyBaseLogger } from "fastify";
import { getLoadedHyperDBs } from "../db/db";
import { cleanupExpiredSyncSessions, getSyncStagingMetrics } from "./actions";

const CLEANUP_ROW_BUDGET = 10_000;

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
    const cleaned = await asyncDispatch(
      db.withTraits({ type: "skip-sync" }),
      cleanupExpiredSyncSessions({
        now: Date.now(),
        maxRows: CLEANUP_ROW_BUDGET,
      }),
    );

    const metrics = await asyncDispatch(db, getSyncStagingMetrics({}));
    stagedBytesByDatabase.set(database, metrics);
    logger.info(
      { database, cleanup: cleaned, ...metrics },
      "Sync v4 staging metrics updated",
    );
  }
};
