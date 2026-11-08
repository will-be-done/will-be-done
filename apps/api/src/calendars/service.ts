import { asyncDispatch, selectAsync, type DB } from "@will-be-done/hyperdb";
import {
  applyExternalCalendar,
  externalEventResources,
  removeExternalCalendars,
} from "@will-be-done/slices/space";
import { v5 as uuidv5 } from "uuid";
import { spaceDBConfig } from "../db/configs";
import { getHyperDB } from "../db/db";
import { getEnvConfig } from "../env";
import {
  CalDavClient,
  normalizeColor,
  type DiscoveredCollection,
} from "./caldav";
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
  saveCalendarSource,
  updateCalendarSource,
} from "./sources";
import type {
  CalendarSource,
  CalendarSourceSecret,
  CalendarSyncCursor,
  CalendarSyncWindow,
  DiscoveredCalendar,
} from "./tables";

const DAY_MS = 24 * 60 * 60 * 1000;
const SYNC_WINDOW_DAYS: Record<CalendarSyncWindow, number | null> = {
  "2-weeks": 14,
  "1-month": 30,
  "3-months": 91,
  "6-months": 182,
  all: null,
};
export const DEFAULT_SYNC_WINDOW: CalendarSyncWindow = "1-month";
const ICS_CALENDAR_KEY = "feed";
// Bump when the stored form of events changes, so the next sync re-reads
// every calendar instead of trusting its cursor.
const MIRROR_VERSION = 1;
const SOURCE_ID_NAMESPACE = "253391e3-98b0-4e27-aabb-d4b28def53a3";

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

// Null when the feed is unchanged since `cursor`.
async function fetchIcsFeed(
  url: string,
  config: CalendarConfig,
  cursor?: CalendarSyncCursor,
) {
  const response = await guardedFetch(
    url,
    {
      method: "GET",
      headers: {
        accept: "text/calendar, */*;q=0.5",
        ...(cursor?.etag ? { "if-none-match": cursor.etag } : {}),
        ...(cursor?.lastModified
          ? { "if-modified-since": cursor.lastModified }
          : {}),
      },
    },
    fetchOptions(config),
  );
  if (response.status === 304 && cursor) return null;
  if (response.status !== 200) {
    throw new CalendarFetchError(
      `The calendar feed returned HTTP ${response.status}`,
      response.status,
    );
  }
  let feed: ReturnType<typeof splitIcsFeed>;
  try {
    feed = splitIcsFeed(response.body);
  } catch {
    throw new CalendarFetchError(
      "The address did not return an iCalendar feed",
    );
  }
  const { etag, "last-modified": lastModified } = response.headers;
  return {
    ...feed,
    validators: {
      ...(etag ? { etag } : {}),
      ...(lastModified ? { lastModified } : {}),
    },
  };
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

const EMAIL = /^[^\s@]+@[^\s@]+$/;

async function mirrorSource(
  source: CalendarSource,
  config: CalendarConfig,
  now: number,
): Promise<{
  calendars: DiscoveredCalendar[];
  cursors: Record<string, CalendarSyncCursor>;
}> {
  const spaceDb = (await getHyperDB(spaceDBConfig(source.spaceId))).db;
  const disabled = new Set(parseJson<string[]>(source.disabledCalendarKeys));
  const previous = parseJson<DiscoveredCalendar[]>(source.calendars);
  // Unticked calendars disappear even when the remote fetch below fails.
  await asyncDispatch(
    spaceDb,
    removeExternalCalendars({
      sourceId: source.id,
      keepCalendarKeys: previous
        .filter((calendar) => !disabled.has(calendar.key))
        .map((calendar) => calendar.key),
    }),
  );
  const secret = parseJson<CalendarSourceSecret>(
    decryptSecret(source.secret, config.encryptionKey),
  );
  const window = source.syncWindow ?? DEFAULT_SYNC_WINDOW;
  const windowDays = SYNC_WINDOW_DAYS[window];
  const notBefore = windowDays === null ? null : now - windowDays * DAY_MS;
  const stamp = { version: MIRROR_VERSION, window };
  const storedCursors = parseJson<Record<string, CalendarSyncCursor>>(
    source.syncCursors ?? "{}",
  );
  // Only enabled calendars keep a cursor: a re-enabled one starts over.
  const cursorFor = (key: string) => {
    const cursor = storedCursors[key];
    return !disabled.has(key) &&
      cursor?.version === stamp.version &&
      cursor.window === stamp.window
      ? cursor
      : undefined;
  };
  const cursors: Record<string, CalendarSyncCursor> = {};
  const localResources = (calendarKey: string) =>
    selectAsync(spaceDb, {
      selector: externalEventResources,
      args: { sourceId: source.id, calendarKey },
    });

  let calendars: DiscoveredCalendar[];
  if (source.kind === "ics") {
    const cursor = cursorFor(ICS_CALENDAR_KEY);
    const feed = await fetchIcsFeed(secret.url, config, cursor);
    if (!feed) {
      return {
        calendars: previous,
        cursors: cursor ? { [ICS_CALENDAR_KEY]: cursor } : {},
      };
    }
    const calendar: DiscoveredCalendar = {
      key: ICS_CALENDAR_KEY,
      name: feed.name ?? source.name,
      color: normalizeColor(feed.color),
    };
    calendars = [calendar];
    if (!disabled.has(calendar.key)) {
      const events = feed.events.flatMap(({ uid, ics }) => {
        const prepared = prepareEventIcs(ics, notBefore);
        return prepared
          ? [{ ...prepared, resource: uid, uid, etag: null }]
          : [];
      });
      const kept = new Set(events.map((event) => event.resource));
      await asyncDispatch(
        spaceDb,
        applyExternalCalendar({
          sourceId: source.id,
          calendarKey: calendar.key,
          name: calendar.name,
          color: calendar.color,
          // Google names a primary calendar's feed after its owner's address.
          ownerEmails:
            feed.name && EMAIL.test(feed.name) ? [feed.name.toLowerCase()] : [],
          events,
          removed: [...(await localResources(calendar.key)).keys()].filter(
            (resource) => !kept.has(resource),
          ),
        }),
      );
      cursors[calendar.key] = { ...stamp, ...feed.validators };
    }
  } else {
    const client = caldavClient(secret, config);
    const discovered = await client.discoverCalendars();
    calendars = discovered.calendars.map(
      ({ syncToken: _, ...calendar }) => calendar,
    );
    for (const calendar of discovered.calendars) {
      if (disabled.has(calendar.key)) continue;
      const local = await localResources(calendar.key);
      const changes = await changedResources(
        client,
        calendar,
        cursorFor(calendar.key)?.syncToken,
        local,
        notBefore,
      );
      const fetched =
        changes.changed.length > 0
          ? await client.fetchEvents(calendar.key, changes.changed)
          : [];
      const changed = new Set(changes.changed);
      // Neither a sync token nor an unchanged listing reports events that
      // have aged out of the window.
      const agedOut = [...local]
        .filter(
          ([resource, { seriesEnd }]) =>
            notBefore !== null &&
            seriesEnd < notBefore &&
            !changed.has(resource),
        )
        .map(([resource]) => resource);
      // A fetched body that can't be stored drops the old row instead of
      // leaving a stale version visible.
      const removed = [...changes.removed, ...agedOut];
      const events = fetched.flatMap(({ resource, etag, ics }) => {
        const prepared = prepareEventIcs(ics, notBefore);
        if (!prepared) {
          removed.push(resource);
          return [];
        }
        return [{ ...prepared, resource, uid: prepared.uid ?? resource, etag }];
      });
      await asyncDispatch(
        spaceDb,
        applyExternalCalendar({
          sourceId: source.id,
          calendarKey: calendar.key,
          name: calendar.name,
          color: calendar.color,
          ownerEmails: discovered.ownerEmails,
          events,
          removed,
        }),
      );
      if (changes.syncToken) {
        cursors[calendar.key] = { ...stamp, syncToken: changes.syncToken };
      }
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
  return { calendars, cursors };
}

// What changed in a CalDAV calendar since the mirrored `syncToken`. Without
// one, or when the server refuses it, the full listing is compared against
// the local ETags instead.
async function changedResources(
  client: CalDavClient,
  calendar: DiscoveredCollection,
  syncToken: string | undefined,
  local: Map<string, { etag: string | null }>,
  notBefore: number | null,
): Promise<{ changed: string[]; removed: string[]; syncToken: string | null }> {
  if (syncToken && syncToken === calendar.syncToken) {
    return { changed: [], removed: [], syncToken };
  }
  if (syncToken) {
    try {
      const result = await client.changesSince(calendar.key, syncToken);
      const entries = [...result.changes];
      return {
        changed: entries
          .filter(
            ([resource, etag]) =>
              etag !== null && local.get(resource)?.etag !== etag,
          )
          .map(([resource]) => resource),
        removed: entries
          .filter(([, etag]) => etag === null)
          .map(([resource]) => resource),
        syncToken: result.syncToken,
      };
    } catch (error) {
      if (
        !(error instanceof CalendarFetchError) ||
        error.status === undefined
      ) {
        throw error;
      }
    }
  }
  // The token is read before the listing, so a change made in between is
  // seen again next time rather than missed.
  const remote = await client.listEventEtags(calendar.key, notBefore);
  return {
    changed: [...remote]
      .filter(([resource, etag]) => local.get(resource)?.etag !== etag)
      .map(([resource]) => resource),
    removed: [...local.keys()].filter((resource) => !remote.has(resource)),
    syncToken: calendar.syncToken,
  };
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
    const { calendars, cursors } = await mirrorSource(source, config, now);
    await asyncDispatch(
      mainDB,
      updateCalendarSource({
        id: source.id,
        patch: {
          calendars: JSON.stringify(calendars),
          syncCursors: JSON.stringify(cursors),
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
    if (!feed) throw new CalendarFetchError("The calendar feed is empty");
    name = feed.name ?? name;
    calendars = [
      { key: ICS_CALENDAR_KEY, name, color: normalizeColor(feed.color) },
    ];
  } else {
    calendars = (
      await caldavClient(input.secret, config).discoverCalendars()
    ).calendars.map(({ syncToken: _, ...calendar }) => calendar);
    if (calendars.length === 0) {
      throw new CalendarFetchError("This account has no event calendars");
    }
    if (input.secret.username) name = `${input.secret.username} · ${name}`;
  }

  const now = Date.now();
  // Event ids derive from the source id, so reconnecting an account keeps them.
  const id = uuidv5(
    JSON.stringify([
      input.userId,
      input.spaceId,
      input.kind,
      url.href,
      input.secret.username ?? null,
    ]),
    SOURCE_ID_NAMESPACE,
  );
  await asyncDispatch(
    mainDB,
    saveCalendarSource({
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

export async function setCalendarSyncWindow(
  mainDB: DB,
  config: CalendarConfig,
  source: CalendarSource,
  syncWindow: CalendarSyncWindow,
) {
  await asyncDispatch(
    mainDB,
    updateCalendarSource({ id: source.id, patch: { syncWindow } }),
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
    syncWindow: source.syncWindow ?? DEFAULT_SYNC_WINDOW,
    calendars: parseJson<DiscoveredCalendar[]>(source.calendars).map(
      (calendar) => ({ ...calendar, enabled: !disabled.has(calendar.key) }),
    ),
  };
}
