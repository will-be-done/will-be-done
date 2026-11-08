import { selectAsync } from "@will-be-done/hyperdb";
import { Clock, Context, Effect, Layer } from "effect";
import { HttpClient } from "effect/http";
import { getLoadedHyperDBs } from "../db/db";
import { MainDatabase } from "../db/mainDatabase";
import { AppEnv } from "../env";
import { guardedHttpClient } from "./http";
import {
  calendarSettingsFrom,
  CalendarConfig,
  syncCalendarSource,
} from "./service";
import { calendarSourcesBySpace } from "./sources";

const CHECK_INTERVAL_MS = 60_000;
// A slow calendar server holds up only one of these.
const SYNC_CONCURRENCY = 4;

export type CalendarServices =
  | MainDatabase
  | CalendarConfig
  | HttpClient.HttpClient;

// What calendar effects run with; undefined when calendars are turned off.
export class Calendars extends Context.Service<
  Calendars,
  Context.Context<CalendarServices> | undefined
>()("@will-be-done/api/Calendars") {
  static readonly layer = Layer.effect(
    Calendars,
    Effect.gen(function* () {
      const settings = calendarSettingsFrom(yield* AppEnv);
      if (!settings) return undefined;
      return Context.make(MainDatabase, yield* MainDatabase).pipe(
        Context.add(CalendarConfig, settings),
        Context.add(HttpClient.HttpClient, guardedHttpClient(settings)),
      );
    }),
  );
}

// Refreshes due sources of spaces this server has loaded. Spaces load when a
// client syncs, so active spaces stay fresh without opening every database.
export const syncDueCalendarSources = (now?: number) =>
  Effect.gen(function* () {
    const mainDB = yield* MainDatabase;
    const at = now ?? (yield* Clock.currentTimeMillis);
    const sources = yield* Effect.forEach(
      getLoadedHyperDBs().filter(({ dbType }) => dbType === "space"),
      ({ database }) =>
        Effect.promise(() =>
          selectAsync(mainDB, {
            selector: calendarSourcesBySpace,
            args: { spaceId: database.slice("space-".length) },
          }),
        ),
    );
    yield* Effect.forEach(
      sources.flat().filter((source) => source.nextSyncAt <= at),
      (source) => syncCalendarSource(source.id),
      { concurrency: SYNC_CONCURRENCY, discard: true },
    );
  });

// Checks for due sources every minute while its scope is open.
export const calendarSyncLoop = syncDueCalendarSources().pipe(
  Effect.catchCause((cause) =>
    Effect.logError("[Calendars] Sync check failed", cause),
  ),
  Effect.delay(CHECK_INTERVAL_MS),
  Effect.forever,
);
