import { selectAsync, type DB } from "@will-be-done/hyperdb";
import type { FastifyPluginAsync } from "fastify";
import { getLoadedHyperDBs, getMainHyperDB } from "../db/db";
import {
  getCalendarConfig,
  syncCalendarSource,
  type CalendarConfig,
} from "./service";
import { calendarSourcesBySpace } from "./sources";

const CHECK_INTERVAL_MS = 60_000;
// A slow calendar server holds up only one of these.
const SYNC_CONCURRENCY = 4;

// Refreshes due sources of spaces this server has loaded. Spaces load when a
// client syncs, so active spaces stay fresh without opening every database.
export async function syncDueCalendarSources(
  mainDB: DB,
  config: CalendarConfig,
  now = Date.now(),
) {
  const due: string[] = [];
  for (const { dbType, database } of getLoadedHyperDBs()) {
    if (dbType !== "space") continue;
    const sources = await selectAsync(mainDB, {
      selector: calendarSourcesBySpace,
      args: { spaceId: database.slice("space-".length) },
    });
    for (const source of sources) {
      if (source.nextSyncAt <= now) due.push(source.id);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(SYNC_CONCURRENCY, due.length) }, async () => {
      for (let id = due.shift(); id; id = due.shift()) {
        await syncCalendarSource(mainDB, id, config);
      }
    }),
  );
}

export const calendarSyncPlugin: FastifyPluginAsync<{ mainDB?: DB }> = async (
  server,
  options,
) => {
  const config = getCalendarConfig();
  if (!config) return;

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await syncDueCalendarSources(
        options.mainDB ?? (await getMainHyperDB()),
        config,
      );
    } catch (error) {
      server.log.error({ err: error }, "Calendar sync check failed");
    } finally {
      running = false;
    }
  };

  let interval: ReturnType<typeof setInterval> | undefined;
  server.addHook("onReady", async () => {
    interval = setInterval(() => void tick(), CHECK_INTERVAL_MS);
    interval.unref?.();
  });
  server.addHook("onClose", async () => {
    if (interval) clearInterval(interval);
  });
};
