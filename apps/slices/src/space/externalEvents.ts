import ICAL from "ical.js";
import { deleteRows, selectFrom, upsert, v } from "@will-be-done/hyperdb";
import { action, selector } from "../builders";
import { genUUIDV5, genUUIDV5Many } from "../traits";
import {
  externalCalendarsTable,
  externalCalendarType,
  externalEventsTable,
  externalEventType,
  type ExternalEvent,
} from "./tables";

// Floating and all-day times have no zone until a device shows them; every
// device is within 14 hours of UTC.
const FLOATING_PADDING_MS = 14 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_OCCURRENCES = 50_000;
const UNBOUNDED = Number.MAX_SAFE_INTEGER;

export type ExternalEventOccurrence = {
  key: string;
  eventId: string;
  calendarId: string;
  calendarName: string;
  color: string | null;
  title: string;
  location: string | null;
  allDay: boolean;
  // Absolute ms. All-day and floating times are placed in the device's zone.
  startMs: number;
  endMs: number;
};

type ParsedSeries = {
  // Null when the resource holds only overridden instances.
  master: ICAL.Event | null;
  standalone: ICAL.Event[];
};

const parseSeries = (ics: string): ParsedSeries | null => {
  let root: ICAL.Component;
  try {
    root = new ICAL.Component(ICAL.parse(ics));
  } catch {
    return null;
  }
  const vevents = root.getAllSubcomponents("vevent");
  if (vevents.length === 0) return null;

  const masterComponent = vevents.find((c) => !c.hasProperty("recurrence-id"));
  const overrides = vevents.filter((c) => c.hasProperty("recurrence-id"));
  if (!masterComponent) {
    return {
      master: null,
      standalone: overrides.map((c) => new ICAL.Event(c)),
    };
  }
  const master = new ICAL.Event(masterComponent, { strictExceptions: true });
  for (const override of overrides) master.relateException(override);
  return { master, standalone: [] };
};

const isValidTimeZone = (tzid: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tzid });
    return true;
  } catch {
    return false;
  }
};

// Wall time in an IANA zone to UTC ms, for TZIDs sent without a VTIMEZONE.
const zonedWallTimeToMs = (time: ICAL.Time, tzid: string) => {
  const wall = Date.UTC(
    time.year,
    time.month - 1,
    time.day,
    time.hour,
    time.minute,
    time.second,
  );
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone: tzid,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  });
  const offsetAt = (utc: number) => {
    const parts = Object.fromEntries(
      format.formatToParts(utc).map((p) => [p.type, Number(p.value)]),
    );
    return (
      Date.UTC(
        parts.year!,
        parts.month! - 1,
        parts.day!,
        parts.hour!,
        parts.minute!,
        parts.second!,
      ) - utc
    );
  };
  const guess = wall - offsetAt(wall);
  return wall - offsetAt(guess);
};

type FloatingMode = "local" | "utc";

const unresolvedTzid = (event: ICAL.Event) => {
  const tzid = event.component
    .getFirstProperty("dtstart")
    ?.getParameter("tzid");
  return typeof tzid === "string" && isValidTimeZone(tzid) ? tzid : null;
};

const timeToMs = (
  time: ICAL.Time,
  tzid: string | null,
  floating: FloatingMode,
): number => {
  const isFloating = time.zone === ICAL.Timezone.localTimezone;
  if (isFloating && !time.isDate && tzid) return zonedWallTimeToMs(time, tzid);
  if (isFloating && floating === "utc") {
    return Date.UTC(
      time.year,
      time.month - 1,
      time.day,
      time.isDate ? 0 : time.hour,
      time.isDate ? 0 : time.minute,
      time.isDate ? 0 : time.second,
    );
  }
  return time.toJSDate().getTime();
};

type RawOccurrence = {
  recurrenceKey: string;
  item: ICAL.Event;
  start: ICAL.Time;
  end: ICAL.Time;
};

const isCancelled = (event: ICAL.Event) =>
  String(
    event.component.getFirstPropertyValue("status") ?? "",
  ).toUpperCase() === "CANCELLED";

// Walks occurrences in recurrence-id order until `shouldStop` says so.
function* iterateOccurrences(series: ParsedSeries): Generator<RawOccurrence> {
  for (const event of series.standalone) {
    yield {
      recurrenceKey: event.recurrenceId?.toString() ?? "",
      item: event,
      start: event.startDate,
      end: event.endDate,
    };
  }
  const { master } = series;
  if (!master) return;
  if (!master.isRecurring()) {
    yield {
      recurrenceKey: "",
      item: master,
      start: master.startDate,
      end: master.endDate,
    };
    return;
  }
  const iterator = master.iterator();
  for (let i = 0; i < MAX_OCCURRENCES; i += 1) {
    const next = iterator.next();
    if (!next) return;
    const details = master.getOccurrenceDetails(next);
    yield {
      recurrenceKey: next.toString(),
      item: details.item,
      start: details.startDate,
      end: details.endDate,
    };
  }
}

const isUnbounded = (series: ParsedSeries) =>
  series.master?.component.getAllProperties("rrule").some((prop) => {
    const recur = prop.getFirstValue() as ICAL.Recur;
    return !recur.until && !recur.count;
  }) ?? false;

// Validates a resource and computes its stored bounds. Null when it holds no
// usable VEVENT.
export function externalEventSeriesBounds(
  ics: string,
): { seriesStart: number; seriesEnd: number } | null {
  const series = parseSeries(ics);
  if (!series) return null;
  const unbounded = isUnbounded(series);

  let seriesStart = Infinity;
  let seriesEnd = -Infinity;
  let count = 0;
  for (const occurrence of iterateOccurrences(series)) {
    const tzid = unresolvedTzid(occurrence.item);
    const start = timeToMs(occurrence.start, tzid, "utc");
    const end = timeToMs(occurrence.end, tzid, "utc");
    seriesStart = Math.min(seriesStart, start);
    seriesEnd = Math.max(seriesEnd, end);
    count += 1;
    if (unbounded) break;
  }
  if (count === 0) return null;
  if (unbounded || count >= MAX_OCCURRENCES) seriesEnd = UNBOUNDED;

  return {
    seriesStart: seriesStart - FLOATING_PADDING_MS,
    seriesEnd:
      seriesEnd === UNBOUNDED ? UNBOUNDED : seriesEnd + FLOATING_PADDING_MS,
  };
}

const parsedCache = new Map<string, { ics: string; series: ParsedSeries }>();

const cachedSeries = (row: ExternalEvent) => {
  const cached = parsedCache.get(row.id);
  if (cached && cached.ics === row.ics) return cached.series;
  const series = parseSeries(row.ics);
  if (!series) return null;
  parsedCache.set(row.id, { ics: row.ics, series });
  return series;
};

export function expandExternalEvent(
  row: ExternalEvent,
  fromMs: number,
  toMs: number,
): Omit<ExternalEventOccurrence, "calendarName" | "color">[] {
  const series = cachedSeries(row);
  if (!series) return [];
  if (series.master && isCancelled(series.master)) return [];

  const result: Omit<ExternalEventOccurrence, "calendarName" | "color">[] = [];
  for (const occurrence of iterateOccurrences(series)) {
    const tzid = unresolvedTzid(occurrence.item);
    const startMs = timeToMs(occurrence.start, tzid, "local");
    // Overrides can move an instance; a day of slack keeps moved ones near
    // the range edge.
    if (startMs > toMs + DAY_MS && occurrence.item === series.master) break;
    const endMs = Math.max(timeToMs(occurrence.end, tzid, "local"), startMs);
    if (isCancelled(occurrence.item)) continue;
    const overlaps =
      startMs < toMs &&
      (endMs > fromMs || (endMs === startMs && startMs >= fromMs));
    if (!overlaps) continue;

    result.push({
      key: `${row.id}:${occurrence.recurrenceKey}`,
      eventId: row.id,
      calendarId: row.calendarId,
      title: occurrence.item.summary ?? "",
      location: occurrence.item.location || null,
      allDay: occurrence.start.isDate,
      startMs,
      endMs,
    });
  }
  return result;
}

// Occurrences overlapping [fromMs, toMs), sorted by start.
export const externalEventOccurrencesInRange = selector({
  name: "externalEventOccurrencesInRange",
  args: { fromMs: v.number(), toMs: v.number() },
  handler: function* externalEventOccurrencesInRange({ fromMs, toMs }) {
    // Rows whose series ended before the range are skipped by the index;
    // the rest are the still-running series, a small set.
    const rows = (yield* selectFrom(externalEventsTable, "bySeriesEnd").where(
      (q) => q.gte("seriesEnd", fromMs),
    )).filter((row) => row.seriesStart < toMs);
    if (rows.length === 0) return [];

    const calendars = new Map(
      (yield* selectFrom(externalCalendarsTable, "byIds")).map((c) => [
        c.id,
        c,
      ]),
    );
    const occurrences: ExternalEventOccurrence[] = [];
    for (const row of rows) {
      const calendar = calendars.get(row.calendarId);
      if (!calendar) continue;
      for (const occurrence of expandExternalEvent(row, fromMs, toMs)) {
        occurrences.push({
          ...occurrence,
          calendarName: calendar.name,
          color: calendar.color,
        });
      }
    }
    return occurrences.sort(
      (a, b) =>
        a.startMs - b.startMs ||
        b.endMs - a.endMs ||
        a.key.localeCompare(b.key),
    );
  },
});

const calendarIdFor = (sourceId: string, calendarKey: string) =>
  genUUIDV5(externalCalendarType, `${sourceId}/${calendarKey}`);

const externalEventInput = v.object({
  resource: v.string(),
  etag: v.union(v.string(), v.null()),
  ics: v.string(),
  seriesStart: v.number(),
  seriesEnd: v.number(),
});

export const externalEventResourceEtags = selector({
  name: "externalEventResourceEtags",
  args: { sourceId: v.string(), calendarKey: v.string() },
  handler: function* externalEventResourceEtags({ sourceId, calendarKey }) {
    const calendarId = yield* calendarIdFor(sourceId, calendarKey);
    const rows = yield* selectFrom(
      externalEventsTable,
      "byCalendarResource",
    ).where((q) => q.eq("calendarId", calendarId));
    return new Map(rows.map((row) => [row.resource, row.etag]));
  },
});

// Mirrors one fetched calendar. `calendarKey` identifies it within its source
// (the CalDAV collection URL). `resources` lists every resource the source
// still has; `events` carries the bodies that were fetched. Unchanged rows
// are not rewritten, so a refresh with no news writes nothing.
export const applyExternalCalendar = action({
  name: "applyExternalCalendar",
  args: {
    sourceId: v.string(),
    calendarKey: v.string(),
    name: v.string(),
    color: v.union(v.string(), v.null()),
    resources: v.array(v.string()),
    events: v.array(externalEventInput),
  },
  handler: function* applyExternalCalendar({
    sourceId,
    calendarKey,
    name,
    color,
    resources,
    events,
  }) {
    const calendarId = yield* calendarIdFor(sourceId, calendarKey);
    const calendar = yield* selectFrom(externalCalendarsTable, "byId")
      .where((q) => q.eq("id", calendarId))
      .first();
    if (
      !calendar ||
      calendar.name !== name ||
      calendar.color !== color ||
      calendar.sourceId !== sourceId
    ) {
      yield* upsert(externalCalendarsTable, [
        { type: externalCalendarType, id: calendarId, sourceId, name, color },
      ]);
    }

    const existing = new Map(
      (yield* selectFrom(externalEventsTable, "byCalendarResource").where((q) =>
        q.eq("calendarId", calendarId),
      )).map((row) => [row.resource, row]),
    );

    const ids = yield* genUUIDV5Many(
      externalEventType,
      events.map((event) => `${calendarId}/${event.resource}`),
    );
    const changed: ExternalEvent[] = [];
    events.forEach((event, index) => {
      const current = existing.get(event.resource);
      if (
        current &&
        current.etag === event.etag &&
        current.ics === event.ics &&
        current.seriesStart === event.seriesStart &&
        current.seriesEnd === event.seriesEnd
      ) {
        return;
      }
      changed.push({
        type: externalEventType,
        id: current?.id ?? ids[index]!,
        calendarId,
        ...event,
      });
    });
    if (changed.length > 0) yield* upsert(externalEventsTable, changed);

    const present = new Set(resources);
    const removed = [...existing.values()]
      .filter((row) => !present.has(row.resource))
      .map((row) => row.id);
    if (removed.length > 0) yield* deleteRows(externalEventsTable, removed);
  },
});

// Drops a source's calendars that are not in `keepCalendarKeys`, with their
// events. Calendars are a small complete collection.
export const removeExternalCalendars = action({
  name: "removeExternalCalendars",
  args: { sourceId: v.string(), keepCalendarKeys: v.array(v.string()) },
  handler: function* removeExternalCalendars({ sourceId, keepCalendarKeys }) {
    const keep = new Set(
      yield* genUUIDV5Many(
        externalCalendarType,
        keepCalendarKeys.map((key) => `${sourceId}/${key}`),
      ),
    );
    const calendars = (yield* selectFrom(
      externalCalendarsTable,
      "byIds",
    )).filter((c) => c.sourceId === sourceId && !keep.has(c.id));
    for (const calendar of calendars) {
      const eventIds = (yield* selectFrom(
        externalEventsTable,
        "byCalendarResource",
      ).where((q) => q.eq("calendarId", calendar.id))).map((row) => row.id);
      if (eventIds.length > 0) yield* deleteRows(externalEventsTable, eventIds);
    }
    if (calendars.length > 0) {
      yield* deleteRows(
        externalCalendarsTable,
        calendars.map((c) => c.id),
      );
    }
  },
});
