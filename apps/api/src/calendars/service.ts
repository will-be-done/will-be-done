import { asyncDispatch, selectAsync, type DB } from "@will-be-done/hyperdb";
import {
  applyExternalCalendar,
  externalEventResourceEtags,
  removeExternalCalendars,
} from "@will-be-done/slices/space";
import { uuidv7 } from "uuidv7";
import { spaceDBConfig } from "../db/configs";
import { getHyperDB } from "../db/db";
import { getEnvConfig } from "../env";
import { CalDavClient, normalizeColor } from "./caldav";
import {
  CalendarFetchError,
  guardedFetch,
  type GuardedFetchOptions,
} from "./guardedFetch";
import { prepareEventIcs, splitIcsFeed } from "./ics";
import { decryptSecret, encryptSecret } from "./secrets";
import {
  calendarSourceById,
  deleteCalendarSource,
  insertCalendarSource,
  updateCalendarSource,
} from "./sources";
import type {
  CalendarSource,
  CalendarSourceSecret,
  DiscoveredCalendar,
} from "./tables";

// Older events are not fetched; the calendar views rarely look that far back.
export const CALENDAR_PAST_WINDOW_MS = 60 * 24 * 60 * 60 * 1000;
const ICS_CALENDAR_KEY = "feed";

export type CalendarConfig = {
  encryptionKey: string;
  allowPrivateNetworks: boolean;
  syncIntervalMs: number;
};

export class CalendarsDisabledError extends Error {
  constructor() {
    super(
      "Calendar connections are turned off on this server. Set WBD_CALENDAR_ENCRYPTION_KEY to enable them.",
    );
    this.name = "CalendarsDisabledError";
  }
}

export function getCalendarConfig(): CalendarConfig | null {
  const env = getEnvConfig();
  if (!env.WBD_CALENDAR_ENCRYPTION_KEY) return null;
  return {
    encryptionKey: env.WBD_CALENDAR_ENCRYPTION_KEY,
    allowPrivateNetworks: env.WBD_CALENDAR_ALLOW_PRIVATE_NETWORKS,
    syncIntervalMs: env.WBD_CALENDAR_SYNC_INTERVAL_MS,
  };
}

export function requireCalendarConfig(): CalendarConfig {
  const config = getCalendarConfig();
  if (!config) throw new CalendarsDisabledError();
  return config;
}

const fetchOptions = (config: CalendarConfig): GuardedFetchOptions => ({
  allowPrivateNetworks: config.allowPrivateNetworks,
});

async function fetchIcsFeed(url: string, config: CalendarConfig) {
  const response = await guardedFetch(
    url,
    { method: "GET", headers: { accept: "text/calendar, */*;q=0.5" } },
    fetchOptions(config),
  );
  if (response.status !== 200) {
    throw new CalendarFetchError(
      `The calendar feed returned HTTP ${response.status}`,
      response.status,
    );
  }
  try {
    return splitIcsFeed(response.body);
  } catch {
    throw new CalendarFetchError(
      "The address did not return an iCalendar feed",
    );
  }
}

const caldavClient = (secret: CalendarSourceSecret, config: CalendarConfig) =>
  new CalDavClient(
    {
      url: secret.url,
      username: secret.username ?? "",
      password: secret.password ?? "",
    },
    fetchOptions(config),
  );

const parseJson = <T>(value: string): T => JSON.parse(value) as T;

async function mirrorSource(
  source: CalendarSource,
  config: CalendarConfig,
  now: number,
): Promise<DiscoveredCalendar[]> {
  const spaceDb = (await getHyperDB(spaceDBConfig(source.spaceId))).db;
  const disabled = new Set(parseJson<string[]>(source.disabledCalendarKeys));
  // Unticked calendars disappear even when the remote fetch below fails.
  await asyncDispatch(
    spaceDb,
    removeExternalCalendars({
      sourceId: source.id,
      keepCalendarKeys: parseJson<DiscoveredCalendar[]>(source.calendars)
        .filter((calendar) => !disabled.has(calendar.key))
        .map((calendar) => calendar.key),
    }),
  );
  const secret = parseJson<CalendarSourceSecret>(
    decryptSecret(source.secret, config.encryptionKey),
  );
  const notBefore = now - CALENDAR_PAST_WINDOW_MS;

  let calendars: DiscoveredCalendar[];
  if (source.kind === "ics") {
    const feed = await fetchIcsFeed(secret.url, config);
    const calendar: DiscoveredCalendar = {
      key: ICS_CALENDAR_KEY,
      name: feed.name ?? source.name,
      color: normalizeColor(feed.color),
    };
    calendars = [calendar];
    if (!disabled.has(calendar.key)) {
      const events = feed.events.flatMap(({ uid, ics }) => {
        const prepared = prepareEventIcs(ics, notBefore);
        return prepared ? [{ resource: uid, etag: null, ...prepared }] : [];
      });
      await asyncDispatch(
        spaceDb,
        applyExternalCalendar({
          sourceId: source.id,
          calendarKey: calendar.key,
          name: calendar.name,
          color: calendar.color,
          resources: events.map((event) => event.resource),
          events,
        }),
      );
    }
  } else {
    const client = caldavClient(secret, config);
    calendars = await client.discoverCalendars();
    for (const calendar of calendars) {
      if (disabled.has(calendar.key)) continue;
      const remote = await client.listEventEtags(calendar.key, notBefore);
      const local = await selectAsync(spaceDb, {
        selector: externalEventResourceEtags,
        args: { sourceId: source.id, calendarKey: calendar.key },
      });
      const changed = [...remote]
        .filter(([resource, etag]) => local.get(resource) !== etag)
        .map(([resource]) => resource);
      const fetched =
        changed.length > 0
          ? await client.fetchEvents(calendar.key, changed)
          : [];
      // A fetched body that can't be stored drops the old row instead of
      // leaving a stale version visible.
      const rejected = new Set<string>();
      const events = fetched.flatMap(({ resource, etag, ics }) => {
        const prepared = prepareEventIcs(ics, notBefore);
        if (!prepared) rejected.add(resource);
        return prepared ? [{ resource, etag, ...prepared }] : [];
      });
      await asyncDispatch(
        spaceDb,
        applyExternalCalendar({
          sourceId: source.id,
          calendarKey: calendar.key,
          name: calendar.name,
          color: calendar.color,
          resources: [...remote.keys()].filter((key) => !rejected.has(key)),
          events,
        }),
      );
    }
  }

  await asyncDispatch(
    spaceDb,
    removeExternalCalendars({
      sourceId: source.id,
      keepCalendarKeys: calendars
        .filter((calendar) => !disabled.has(calendar.key))
        .map((calendar) => calendar.key),
    }),
  );
  return calendars;
}

const inFlight = new Map<string, Promise<void>>();

async function runSync(mainDB: DB, sourceId: string, config: CalendarConfig) {
  const source = await selectAsync(mainDB, {
    selector: calendarSourceById,
    args: { id: sourceId },
  });
  if (!source) return;
  const now = Date.now();
  try {
    const calendars = await mirrorSource(source, config, now);
    await asyncDispatch(
      mainDB,
      updateCalendarSource({
        id: source.id,
        patch: {
          calendars: JSON.stringify(calendars),
          status: "ok",
          lastError: null,
          lastSyncedAt: now,
          nextSyncAt: now + config.syncIntervalMs,
        },
      }),
    );
  } catch (error) {
    console.error(`[Calendars] Sync failed for source ${source.id}:`, error);
    await asyncDispatch(
      mainDB,
      updateCalendarSource({
        id: source.id,
        patch: {
          status: "error",
          lastError:
            error instanceof CalendarFetchError
              ? error.message
              : "Could not read this calendar",
          nextSyncAt: now + config.syncIntervalMs,
        },
      }),
    );
  }
}

// Syncs one source; a call made while it is already syncing waits for that
// run and then starts a fresh one so it sees the latest settings.
export async function syncCalendarSource(
  mainDB: DB,
  sourceId: string,
  config: CalendarConfig,
): Promise<void> {
  const previous = inFlight.get(sourceId);
  const run = (async () => {
    await previous?.catch(() => undefined);
    await runSync(mainDB, sourceId, config);
  })();
  inFlight.set(sourceId, run);
  try {
    await run;
  } finally {
    if (inFlight.get(sourceId) === run) inFlight.delete(sourceId);
  }
}

export async function addCalendarSource(
  mainDB: DB,
  config: CalendarConfig,
  input: {
    userId: string;
    spaceId: string;
    kind: CalendarSource["kind"];
    secret: CalendarSourceSecret;
  },
): Promise<string> {
  const url = new URL(input.secret.url);
  let name = url.hostname;
  let calendars: DiscoveredCalendar[];
  if (input.kind === "ics") {
    const feed = await fetchIcsFeed(url.href, config);
    name = feed.name ?? name;
    calendars = [
      { key: ICS_CALENDAR_KEY, name, color: normalizeColor(feed.color) },
    ];
  } else {
    calendars = await caldavClient(input.secret, config).discoverCalendars();
    if (calendars.length === 0) {
      throw new CalendarFetchError("This account has no event calendars");
    }
    if (input.secret.username) name = `${input.secret.username} · ${name}`;
  }

  const now = Date.now();
  const id = uuidv7();
  await asyncDispatch(
    mainDB,
    insertCalendarSource({
      source: {
        id,
        userId: input.userId,
        spaceId: input.spaceId,
        kind: input.kind,
        name,
        secret: encryptSecret(
          JSON.stringify(input.secret),
          config.encryptionKey,
        ),
        calendars: JSON.stringify(calendars),
        disabledCalendarKeys: "[]",
        status: "pending",
        lastError: null,
        lastSyncedAt: null,
        nextSyncAt: now,
        createdAt: now,
      },
    }),
  );
  await syncCalendarSource(mainDB, id, config);
  return id;
}

export async function setCalendarEnabled(
  mainDB: DB,
  config: CalendarConfig,
  source: CalendarSource,
  calendarKey: string,
  enabled: boolean,
) {
  const disabled = new Set(parseJson<string[]>(source.disabledCalendarKeys));
  if (enabled) disabled.delete(calendarKey);
  else disabled.add(calendarKey);
  await asyncDispatch(
    mainDB,
    updateCalendarSource({
      id: source.id,
      patch: { disabledCalendarKeys: JSON.stringify([...disabled]) },
    }),
  );
  await syncCalendarSource(mainDB, source.id, config);
}

export async function removeCalendarSource(mainDB: DB, source: CalendarSource) {
  await inFlight.get(source.id)?.catch(() => undefined);
  await asyncDispatch(mainDB, deleteCalendarSource({ id: source.id }));
  const spaceDb = (await getHyperDB(spaceDBConfig(source.spaceId))).db;
  await asyncDispatch(
    spaceDb,
    removeExternalCalendars({ sourceId: source.id, keepCalendarKeys: [] }),
  );
}

export function publicCalendarSource(source: CalendarSource) {
  const disabled = new Set(parseJson<string[]>(source.disabledCalendarKeys));
  return {
    id: source.id,
    kind: source.kind,
    name: source.name,
    status: source.status,
    lastError: source.lastError,
    lastSyncedAt: source.lastSyncedAt,
    calendars: parseJson<DiscoveredCalendar[]>(source.calendars).map(
      (calendar) => ({ ...calendar, enabled: !disabled.has(calendar.key) }),
    ),
  };
}
