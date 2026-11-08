import { asyncDispatch, selectAsync } from "@will-be-done/hyperdb";
import {
  applyExternalCalendar,
  externalEventResources,
  removeExternalCalendars,
} from "@will-be-done/slices/space";
import { getSpaceById } from "@will-be-done/slices/user";
import { Cause, Clock, Context, Effect, Exit, Option, Semaphore } from "effect";
import { HttpClientRequest } from "effect/http";
import { v5 as uuidv5 } from "uuid";
import { spaceDBConfig, userDBConfig } from "../db/configs";
import { getHyperDB } from "../db/db";
import { MainDatabase } from "../db/mainDatabase";
import type { EnvConfig } from "../env";
import {
  makeCalDavClient,
  normalizeColor,
  type CalDavClient,
  type DiscoveredCollection,
} from "./caldav";
import { CalendarFetchError, responseText, sendCalendarRequest } from "./http";
import { prepareEventIcs, splitIcsFeed } from "./ics";
import { decryptSecret, encryptSecret } from "./secrets";
import {
  calendarSourceById,
  deleteCalendarSource,
  saveCalendarSource,
  setCalendarSourceCalendarEnabled,
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

export type CalendarSettings = {
  encryptionKey: string;
  allowPrivateNetworks: boolean;
  syncIntervalMs: number;
};

export class CalendarConfig extends Context.Service<
  CalendarConfig,
  CalendarSettings
>()("@will-be-done/api/CalendarConfig") {}

// Undefined when the server has no encryption key, which turns calendars off.
export const calendarSettingsFrom = (
  env: EnvConfig,
): CalendarSettings | undefined =>
  env.WBD_CALENDAR_ENCRYPTION_KEY
    ? {
        encryptionKey: env.WBD_CALENDAR_ENCRYPTION_KEY,
        allowPrivateNetworks: env.WBD_CALENDAR_ALLOW_PRIVATE_NETWORKS,
        syncIntervalMs: env.WBD_CALENDAR_SYNC_INTERVAL_MS,
      }
    : undefined;

const dispatch = <T>(...args: Parameters<typeof asyncDispatch<T>>) =>
  Effect.promise(() => asyncDispatch<T>(...args));

const spaceDatabase = (spaceId: string) =>
  Effect.promise(() => getHyperDB(spaceDBConfig(spaceId))).pipe(
    Effect.map(({ db }) => db),
  );

const sourceById = (id: string) =>
  Effect.gen(function* () {
    const mainDB = yield* MainDatabase;
    return yield* Effect.promise(() =>
      selectAsync(mainDB, { selector: calendarSourceById, args: { id } }),
    );
  });

// Null when the feed is unchanged since `cursor`.
const fetchIcsFeed = (url: string, cursor?: CalendarSyncCursor) =>
  Effect.gen(function* () {
    const response = yield* sendCalendarRequest(
      HttpClientRequest.get(url).pipe(
        HttpClientRequest.setHeaders({
          accept: "text/calendar, */*;q=0.5",
          ...(cursor?.etag ? { "if-none-match": cursor.etag } : {}),
          ...(cursor?.lastModified
            ? { "if-modified-since": cursor.lastModified }
            : {}),
        }),
      ),
    );
    if (response.status === 304 && cursor) return null;
    if (response.status !== 200) {
      return yield* new CalendarFetchError({
        message: `The calendar feed returned HTTP ${response.status}`,
        status: response.status,
      });
    }
    const body = yield* responseText(response);
    const feed = yield* Effect.try({
      try: () => splitIcsFeed(body),
      catch: () =>
        new CalendarFetchError({
          message: "The address did not return an iCalendar feed",
        }),
    });
    const { etag, "last-modified": lastModified } = response.headers;
    return {
      ...feed,
      validators: {
        ...(etag ? { etag } : {}),
        ...(lastModified ? { lastModified } : {}),
      },
    };
  });

const caldavClient = (secret: CalendarSourceSecret) =>
  makeCalDavClient({
    url: secret.url,
    username: secret.username ?? "",
    password: secret.password ?? "",
  });

const parseJson = <T>(value: string): T => JSON.parse(value) as T;

const EMAIL = /^[^\s@]+@[^\s@]+$/;

const mirrorSource = (source: CalendarSource, now: number) =>
  Effect.gen(function* () {
    const config = yield* CalendarConfig;
    const spaceDb = yield* spaceDatabase(source.spaceId);
    const disabled = new Set(parseJson<string[]>(source.disabledCalendarKeys));
    const previous = parseJson<DiscoveredCalendar[]>(source.calendars);
    // Unticked calendars disappear even when the remote fetch below fails.
    yield* dispatch(
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
      Effect.promise(() =>
        selectAsync(spaceDb, {
          selector: externalEventResources,
          args: { sourceId: source.id, calendarKey },
        }),
      );

    let calendars: DiscoveredCalendar[];
    if (source.kind === "ics") {
      const cursor = cursorFor(ICS_CALENDAR_KEY);
      const feed = yield* fetchIcsFeed(secret.url, cursor);
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
        const local = yield* localResources(calendar.key);
        yield* dispatch(
          spaceDb,
          applyExternalCalendar({
            sourceId: source.id,
            calendarKey: calendar.key,
            name: calendar.name,
            color: calendar.color,
            // Google names a primary calendar's feed after its owner's address.
            ownerEmails:
              feed.name && EMAIL.test(feed.name)
                ? [feed.name.toLowerCase()]
                : [],
            events,
            removed: [...local.keys()].filter(
              (resource) => !kept.has(resource),
            ),
          }),
        );
        cursors[calendar.key] = { ...stamp, ...feed.validators };
      }
    } else {
      const client = caldavClient(secret);
      const discovered = yield* client.discoverCalendars;
      calendars = discovered.calendars.map(
        ({ syncToken: _, ...calendar }) => calendar,
      );
      for (const calendar of discovered.calendars) {
        if (disabled.has(calendar.key)) continue;
        const local = yield* localResources(calendar.key);
        const changes = yield* changedResources(
          client,
          calendar,
          cursorFor(calendar.key)?.syncToken,
          local,
          notBefore,
        );
        const fetched =
          changes.changed.length > 0
            ? yield* client.fetchEvents(calendar.key, changes.changed)
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
          return [
            { ...prepared, resource, uid: prepared.uid ?? resource, etag },
          ];
        });
        yield* dispatch(
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

    yield* dispatch(
      spaceDb,
      removeExternalCalendars({
        sourceId: source.id,
        keepCalendarKeys: calendars
          .filter((calendar) => !disabled.has(calendar.key))
          .map((calendar) => calendar.key),
      }),
    );
    return { calendars, cursors };
  });

// What changed in a CalDAV calendar since the mirrored `syncToken`. Without
// one, or when the server refuses it, the full listing is compared against
// the local ETags instead.
const changedResources = (
  client: CalDavClient,
  calendar: DiscoveredCollection,
  syncToken: string | undefined,
  local: Map<string, { etag: string | null }>,
  notBefore: number | null,
) =>
  Effect.gen(function* () {
    if (syncToken && syncToken === calendar.syncToken) {
      return { changed: [], removed: [], syncToken };
    }
    const incremental = syncToken
      ? yield* client
          .changesSince(calendar.key, syncToken)
          .pipe(
            Effect.catchTag("CalendarFetchError", (error) =>
              error.status === undefined
                ? Effect.fail(error)
                : Effect.succeed(null),
            ),
          )
      : null;
    if (incremental) {
      const entries = [...incremental.changes];
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
        syncToken: incremental.syncToken,
      };
    }
    // The token is read before the listing, so a change made in between is
    // seen again next time rather than missed.
    const remote = yield* client.listEventEtags(calendar.key, notBefore);
    return {
      changed: [...remote]
        .filter(([resource, etag]) => local.get(resource)?.etag !== etag)
        .map(([resource]) => resource),
      removed: [...local.keys()].filter((resource) => !remote.has(resource)),
      syncToken: calendar.syncToken,
    };
  });

const runSync = (sourceId: string) =>
  Effect.gen(function* () {
    const mainDB = yield* MainDatabase;
    const config = yield* CalendarConfig;
    const source = yield* sourceById(sourceId);
    if (!source) return;
    const space = yield* Effect.promise(async () =>
      selectAsync((await getHyperDB(userDBConfig(source.userId))).db, {
        selector: getSpaceById,
        args: { id: source.spaceId },
      }),
    );
    if (!space) {
      // The space was deleted, so nobody can reach this connection any more.
      yield* dispatch(mainDB, deleteCalendarSource({ id: source.id }));
      return;
    }
    const now = yield* Clock.currentTimeMillis;
    const mirrored = yield* Effect.exit(mirrorSource(source, now));
    if (Exit.isSuccess(mirrored)) {
      yield* dispatch(
        mainDB,
        updateCalendarSource({
          id: source.id,
          patch: {
            calendars: JSON.stringify(mirrored.value.calendars),
            syncCursors: JSON.stringify(mirrored.value.cursors),
            status: "ok",
            lastError: null,
            lastSyncedAt: now,
            nextSyncAt: now + config.syncIntervalMs,
          },
        }),
      );
      return;
    }
    yield* Effect.logError(
      `[Calendars] Sync failed for source ${source.id}`,
      mirrored.cause,
    );
    yield* dispatch(
      mainDB,
      updateCalendarSource({
        id: source.id,
        patch: {
          status: "error",
          lastError: Option.match(Cause.findErrorOption(mirrored.cause), {
            onNone: () => "Could not read this calendar",
            onSome: (error) => error.message,
          }),
          nextSyncAt: now + config.syncIntervalMs,
        },
      }),
    );
  });

const syncLocks = new Map<string, Semaphore.Semaphore>();
const syncLock = (sourceId: string) => {
  let lock = syncLocks.get(sourceId);
  if (!lock) {
    lock = Semaphore.makeUnsafe(1);
    syncLocks.set(sourceId, lock);
  }
  return lock;
};

// Syncs one source; a call made while it is already syncing waits for that
// run and then starts a fresh one so it sees the latest settings.
export const syncCalendarSource = (sourceId: string) =>
  Semaphore.withPermit(syncLock(sourceId), runSync(sourceId));

export const addCalendarSource = (input: {
  userId: string;
  spaceId: string;
  kind: CalendarSource["kind"];
  secret: CalendarSourceSecret;
}) =>
  Effect.gen(function* () {
    const mainDB = yield* MainDatabase;
    const config = yield* CalendarConfig;
    const url = new URL(input.secret.url);
    let name = url.hostname;
    let calendars: DiscoveredCalendar[];
    if (input.kind === "ics") {
      const feed = yield* fetchIcsFeed(url.href);
      if (!feed) {
        return yield* new CalendarFetchError({
          message: "The calendar feed is empty",
        });
      }
      name = feed.name ?? name;
      calendars = [
        { key: ICS_CALENDAR_KEY, name, color: normalizeColor(feed.color) },
      ];
    } else {
      calendars = (yield* caldavClient(input.secret)
        .discoverCalendars).calendars.map(
        ({ syncToken: _, ...calendar }) => calendar,
      );
      if (calendars.length === 0) {
        return yield* new CalendarFetchError({
          message: "This account has no event calendars",
        });
      }
      if (input.secret.username) name = `${input.secret.username} · ${name}`;
    }

    const now = yield* Clock.currentTimeMillis;
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
    yield* dispatch(
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
    yield* syncCalendarSource(id);
    return id;
  });

export const setCalendarEnabled = (
  source: CalendarSource,
  calendarKey: string,
  enabled: boolean,
) =>
  Effect.gen(function* () {
    yield* dispatch(
      yield* MainDatabase,
      setCalendarSourceCalendarEnabled({ id: source.id, calendarKey, enabled }),
    );
    yield* syncCalendarSource(source.id);
  });

export const setCalendarSyncWindow = (
  source: CalendarSource,
  syncWindow: CalendarSyncWindow,
) =>
  Effect.gen(function* () {
    yield* dispatch(
      yield* MainDatabase,
      updateCalendarSource({ id: source.id, patch: { syncWindow } }),
    );
    yield* syncCalendarSource(source.id);
  });

export const removeCalendarSource = (source: CalendarSource) =>
  Effect.gen(function* () {
    yield* dispatch(
      yield* MainDatabase,
      deleteCalendarSource({ id: source.id }),
    );
    const spaceDb = yield* spaceDatabase(source.spaceId);
    // A run that read the source before the delete may still write events;
    // later runs find it gone.
    yield* Semaphore.withPermit(
      syncLock(source.id),
      dispatch(
        spaceDb,
        removeExternalCalendars({ sourceId: source.id, keepCalendarKeys: [] }),
      ),
    );
    syncLocks.delete(source.id);
  });

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
