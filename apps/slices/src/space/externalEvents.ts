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
const SHORT_SERIES_MS = 7 * DAY_MS;
const MAX_OCCURRENCES = 50_000;
const UNBOUNDED = Number.MAX_SAFE_INTEGER;

export type ExternalEventResponse =
  | "accepted"
  | "declined"
  | "tentative"
  | "needs-action";

export type ExternalEventOccurrence = {
  key: string;
  eventId: string;
  recurrenceKey: string;
  calendarId: string;
  calendarName: string;
  color: string | null;
  title: string;
  location: string | null;
  allDay: boolean;
  // Absolute ms. All-day and floating times are placed in the device's zone.
  startMs: number;
  endMs: number;
  status: "confirmed" | "tentative";
  // TRANSP:TRANSPARENT: shown, but does not block time.
  free: boolean;
  // The account's reply when it was invited; null for its own events.
  response: ExternalEventResponse | null;
};

type ParsedSeries = {
  // Null when the resource holds only overridden instances.
  master: ICAL.Event | null;
  // Instances with a RECURRENCE-ID. They can move anywhere, so they are
  // expanded on their own rather than in the master's order.
  overrides: ICAL.Event[];
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
  const overrides = vevents
    .filter((c) => c.hasProperty("recurrence-id"))
    .map((c) => new ICAL.Event(c));
  if (!masterComponent) return { master: null, overrides };
  const master = new ICAL.Event(masterComponent, { strictExceptions: true });
  for (const override of overrides) master.relateException(override);
  return { master, overrides };
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

const unresolvedTzid = (event: ICAL.Event, property = "dtstart") => {
  const tzid = event.component.getFirstProperty(property)?.getParameter("tzid");
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

// When DTEND names another unresolved zone than DTSTART, ical.js measures the
// duration between the two wall times, so the real duration is applied.
const occurrenceMs = (occurrence: RawOccurrence, floating: FloatingMode) => {
  const { item } = occurrence;
  const tzid = unresolvedTzid(item);
  const endTzid = unresolvedTzid(item, "dtend");
  const dtend = item.component.getFirstPropertyValue("dtend");
  const startMs = timeToMs(occurrence.start, tzid, floating);
  if (
    !endTzid ||
    endTzid === tzid ||
    !(dtend instanceof ICAL.Time) ||
    dtend.isDate
  ) {
    return { startMs, endMs: timeToMs(occurrence.end, tzid, floating) };
  }
  const durationMs =
    timeToMs(dtend, endTzid, floating) -
    timeToMs(item.startDate, tzid, floating);
  return { startMs, endMs: startMs + durationMs };
};

type RawOccurrence = {
  recurrenceKey: string;
  item: ICAL.Event;
  start: ICAL.Time;
  end: ICAL.Time;
  // Generated by the master's rule, in start order.
  fromRule: boolean;
};

const upperProperty = (event: ICAL.Event, name: string) =>
  String(event.component.getFirstPropertyValue(name) ?? "").toUpperCase();

const isCancelled = (event: ICAL.Event) =>
  upperProperty(event, "status") === "CANCELLED";

const RESPONSES: Partial<Record<string, ExternalEventResponse>> = {
  ACCEPTED: "accepted",
  DECLINED: "declined",
  TENTATIVE: "tentative",
  "NEEDS-ACTION": "needs-action",
};

type Person = {
  name: string | null;
  email: string;
  response: ExternalEventResponse | null;
};

const personFrom = (prop: ICAL.Property): Person => {
  const cn = prop.getParameter("cn");
  const partstat = prop.getParameter("partstat");
  return {
    name: typeof cn === "string" && cn ? cn : null,
    email: String(prop.getFirstValue() ?? "")
      .replace(/^mailto:/i, "")
      .toLowerCase(),
    // RFC 5545 defaults PARTSTAT to NEEDS-ACTION.
    response:
      RESPONSES[typeof partstat === "string" ? partstat.toUpperCase() : ""] ??
      (partstat === undefined || partstat === null ? "needs-action" : null),
  };
};

const organizerOf = (event: ICAL.Event) => {
  const prop = event.component.getFirstProperty("organizer");
  return prop ? personFrom(prop) : null;
};

const attendeesOf = (event: ICAL.Event) =>
  event.component.getAllProperties("attendee").map(personFrom);

const ownerResponse = (event: ICAL.Event, ownerEmails: ReadonlySet<string>) => {
  if (ownerEmails.size === 0) return null;
  const organizer = organizerOf(event);
  if (organizer && ownerEmails.has(organizer.email)) return null;
  return (
    attendeesOf(event).find((attendee) => ownerEmails.has(attendee.email))
      ?.response ?? null
  );
};

const recurRules = (master: ICAL.Event) =>
  master.component
    .getAllProperties("rrule")
    .map((prop) => prop.getFirstValue() as ICAL.Recur);

const SUB_DAILY_UNITS: Partial<Record<string, number>> = {
  HOURLY: 24,
  MINUTELY: 24 * 60,
  SECONDLY: 24 * 60 * 60,
};

// Days by which DTSTART can move while every later instance stays the same:
// a whole number of the rule's periods that keeps the weekday and time of
// day. Null for rules that count from DTSTART or have no such step.
const fastForwardStepDays = (master: ICAL.Event): number | null => {
  const rules = recurRules(master);
  if (rules.length !== 1) return null;
  const rule = rules[0]!;
  if (rule.count) return null;
  const interval = rule.interval || 1;
  if (rule.freq === "DAILY") return interval;
  if (rule.freq === "WEEKLY") return 7 * interval;
  const perDay = SUB_DAILY_UNITS[rule.freq];
  return perDay !== undefined && perDay % interval === 0 ? 1 : null;
};

// Walks instances: overrides first, then the master's rule from `notBeforeMs`
// on (approximately), in start order.
function* iterateOccurrences(
  series: ParsedSeries,
  notBeforeMs = -Infinity,
): Generator<RawOccurrence> {
  for (const event of series.overrides) {
    yield {
      recurrenceKey: event.recurrenceId?.toString() ?? "",
      item: event,
      start: event.startDate,
      end: event.endDate,
      fromRule: false,
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
      fromRule: true,
    };
    return;
  }

  let iteratorStart = master.startDate;
  const stepDays = fastForwardStepDays(master);
  if (stepDays !== null && Number.isFinite(notBeforeMs)) {
    // The shifted start is yielded even if the rule would skip it, so keep it
    // a duration and a day clear of the range.
    const slackMs = master.duration.toSeconds() * 1000 + DAY_MS;
    const gapDays = Math.floor(
      (notBeforeMs - slackMs - master.startDate.toJSDate().getTime()) / DAY_MS,
    );
    const steps = Math.floor(gapDays / stepDays);
    if (steps > 0) {
      iteratorStart = master.startDate.clone();
      iteratorStart.adjust(steps * stepDays, 0, 0, 0);
    }
  }

  const iterator = master.iterator(iteratorStart);
  for (let i = 0; i < MAX_OCCURRENCES; i += 1) {
    const next = iterator.next();
    if (!next) return;
    const details: ReturnType<ICAL.Event["getOccurrenceDetails"]> =
      master.getOccurrenceDetails(next);
    // Exact overrides were yielded above; range overrides only shift times.
    if (
      details.item !== master &&
      details.item.recurrenceId?.compare(next) === 0
    ) {
      continue;
    }
    yield {
      recurrenceKey: next.toString(),
      item: details.item,
      start: details.startDate,
      end: details.endDate,
      fromRule: true,
    };
  }
}

const isUnbounded = (series: ParsedSeries) =>
  series.master
    ? recurRules(series.master).some((recur) => !recur.until && !recur.count)
    : false;

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
  let ruleCount = 0;
  for (const occurrence of iterateOccurrences(series)) {
    const { startMs: start, endMs: end } = occurrenceMs(occurrence, "utc");
    seriesStart = Math.min(seriesStart, start);
    seriesEnd = Math.max(seriesEnd, end);
    count += 1;
    if (!occurrence.fromRule) continue;
    if (unbounded) break;
    ruleCount += 1;
  }
  if (count === 0) return null;
  // Iterations also include overridden instances that were skipped.
  const capped = ruleCount + series.overrides.length >= MAX_OCCURRENCES;
  if (unbounded || capped) seriesEnd = UNBOUNDED;

  return {
    seriesStart: seriesStart - FLOATING_PADDING_MS,
    seriesEnd:
      seriesEnd === UNBOUNDED ? UNBOUNDED : seriesEnd + FLOATING_PADDING_MS,
  };
}

const PARSED_CACHE_SIZE = 1000;
// Least recently used last; Map keeps insertion order.
const parsedCache = new Map<string, { ics: string; series: ParsedSeries }>();

const cachedSeries = (row: ExternalEvent) => {
  const cached = parsedCache.get(row.id);
  parsedCache.delete(row.id);
  if (cached && cached.ics === row.ics) {
    parsedCache.set(row.id, cached);
    return cached.series;
  }
  const series = parseSeries(row.ics);
  if (!series) return null;
  parsedCache.set(row.id, { ics: row.ics, series });
  if (parsedCache.size > PARSED_CACHE_SIZE) {
    parsedCache.delete(parsedCache.keys().next().value!);
  }
  return series;
};

export function expandExternalEvent(
  row: ExternalEvent,
  fromMs: number,
  toMs: number,
  ownerEmails: ReadonlySet<string> = new Set(),
): Omit<ExternalEventOccurrence, "calendarName" | "color">[] {
  const series = cachedSeries(row);
  if (!series) return [];
  if (series.master && isCancelled(series.master)) return [];

  const result: Omit<ExternalEventOccurrence, "calendarName" | "color">[] = [];
  for (const occurrence of iterateOccurrences(series, fromMs)) {
    const bounds = occurrenceMs(occurrence, "local");
    const { startMs } = bounds;
    // A day of slack covers RANGE=THISANDFUTURE shifts and floating times.
    if (occurrence.fromRule && startMs > toMs + DAY_MS) break;
    const endMs = Math.max(bounds.endMs, startMs);
    if (isCancelled(occurrence.item)) continue;
    const overlaps =
      startMs < toMs &&
      (endMs > fromMs || (endMs === startMs && startMs >= fromMs));
    if (!overlaps) continue;

    result.push({
      key: `${row.id}:${occurrence.recurrenceKey}`,
      eventId: row.id,
      recurrenceKey: occurrence.recurrenceKey,
      calendarId: row.calendarId,
      title: occurrence.item.summary ?? "",
      location: occurrence.item.location || null,
      allDay: occurrence.start.isDate,
      startMs,
      endMs,
      status:
        upperProperty(occurrence.item, "status") === "TENTATIVE"
          ? "tentative"
          : "confirmed",
      free: upperProperty(occurrence.item, "transp") === "TRANSPARENT",
      response: ownerResponse(occurrence.item, ownerEmails),
    });
  }
  return result.sort((a, b) => a.startMs - b.startMs);
}

// Occurrences overlapping [fromMs, toMs), sorted by start. Invitations the
// account declined are left out.
export const externalEventOccurrencesInRange = selector({
  name: "externalEventOccurrencesInRange",
  args: { fromMs: v.number(), toMs: v.number() },
  handler: function* externalEventOccurrencesInRange({ fromMs, toMs }) {
    const startingNear = yield* selectFrom(
      externalEventsTable,
      "bySeriesStart",
    ).where((q) =>
      q.gte("seriesStart", fromMs - SHORT_SERIES_MS).lt("seriesStart", toMs),
    );
    // Long series that are still running: mostly open-ended repeats.
    const long = yield* selectFrom(externalEventsTable, "bySpanEnd").where(
      (q) => q.eq("span", "long").gte("seriesEnd", fromMs),
    );
    const rows = [
      ...startingNear.filter((row) => row.span === "short"),
      ...long,
    ].filter((row) => row.seriesEnd >= fromMs && row.seriesStart < toMs);
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
      const ownerEmails = new Set(calendar.ownerEmails);
      for (const occurrence of expandExternalEvent(
        row,
        fromMs,
        toMs,
        ownerEmails,
      )) {
        if (occurrence.response === "declined") continue;
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

const MEETING_PROPERTIES = [
  "x-google-conference",
  "x-microsoft-skypeteamsmeetingurl",
];
const MEETING_HOSTS =
  /^https:\/\/([\w-]+\.)*(zoom\.us\/(j|my|w)\/|meet\.google\.com\/|teams\.microsoft\.com\/l\/meetup-join\/|teams\.live\.com\/meet\/|webex\.com\/|whereby\.com\/|meet\.jit\.si\/|facetime\.apple\.com\/)/i;

const urlsIn = (text: string) =>
  (text.match(/https?:\/\/[^\s<>"']+/g) ?? []).map((url) =>
    url.replace(/[).,;:!?]+$/, ""),
  );

const decodeEntities = (text: string) =>
  text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_, code) => {
    const lower = String(code).toLowerCase();
    if (lower.startsWith("#x"))
      return String.fromCodePoint(parseInt(lower.slice(2), 16));
    if (lower.startsWith("#"))
      return String.fromCodePoint(Number(lower.slice(1)));
    return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " }[
      lower
    ]!;
  });

// Google and Outlook send HTML descriptions; show them as plain text.
const descriptionText = (raw: string) => {
  if (!/<[a-z!/][^>]*>/i.test(raw)) return raw.trim();
  const text = raw
    .replace(/\r?\n/g, " ")
    .replace(
      /<a\b[^>]*href\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi,
      (_, href: string, label: string) => {
        const plain = label.replace(/<[^>]*>/g, "").trim();
        return !plain || plain === href ? href : `${plain} (${href})`;
      },
    )
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]*>/g, "");
  return decodeEntities(text)
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

// Read when an occurrence is opened rather than for every visible one.
export const externalEventDetails = selector({
  name: "externalEventDetails",
  args: { eventId: v.string(), recurrenceKey: v.string() },
  handler: function* externalEventDetails({ eventId, recurrenceKey }) {
    const row = yield* selectFrom(externalEventsTable, "byId")
      .where((q) => q.eq("id", eventId))
      .first();
    if (!row) return null;
    const series = cachedSeries(row);
    const item =
      series?.overrides.find(
        (event) => event.recurrenceId?.toString() === recurrenceKey,
      ) ?? series?.master;
    if (!item) return null;
    const calendar = yield* selectFrom(externalCalendarsTable, "byId")
      .where((q) => q.eq("id", row.calendarId))
      .first();
    const ownerEmails = new Set(calendar?.ownerEmails);
    const withOwner = (person: Person) => ({
      ...person,
      isOwner: ownerEmails.has(person.email),
    });

    const description = descriptionText(item.description ?? "") || null;
    const url =
      String(item.component.getFirstPropertyValue("url") ?? "") || null;
    const meetingUrl =
      MEETING_PROPERTIES.map((name) =>
        String(item.component.getFirstPropertyValue(name) ?? ""),
      ).find((value) => /^https:\/\//i.test(value)) ??
      [item.location ?? "", url ?? "", description ?? ""]
        .flatMap(urlsIn)
        .find((candidate) => MEETING_HOSTS.test(candidate)) ??
      null;
    const organizer = organizerOf(item);

    return {
      description,
      url,
      meetingUrl,
      organizer: organizer ? withOwner(organizer) : null,
      attendees: attendeesOf(item).map(withOwner),
    };
  },
});

const calendarIdFor = (sourceId: string, calendarKey: string) =>
  genUUIDV5(externalCalendarType, `${sourceId}/${calendarKey}`);

const externalEventInput = v.object({
  resource: v.string(),
  uid: v.string(),
  etag: v.union(v.string(), v.null()),
  ics: v.string(),
  seriesStart: v.number(),
  seriesEnd: v.number(),
});

const seriesSpan = (bounds: { seriesStart: number; seriesEnd: number }) =>
  bounds.seriesEnd - bounds.seriesStart <= SHORT_SERIES_MS
    ? ("short" as const)
    : ("long" as const);

export const externalEventResources = selector({
  name: "externalEventResources",
  args: { sourceId: v.string(), calendarKey: v.string() },
  handler: function* externalEventResources({ sourceId, calendarKey }) {
    const calendarId = yield* calendarIdFor(sourceId, calendarKey);
    const rows = yield* selectFrom(
      externalEventsTable,
      "byCalendarResource",
    ).where((q) => q.eq("calendarId", calendarId));
    return new Map(
      rows.map((row) => [
        row.resource,
        { etag: row.etag, seriesEnd: row.seriesEnd },
      ]),
    );
  },
});

// Mirrors one fetched calendar. `calendarKey` identifies it within its source
// (the CalDAV collection URL). `events` carries the bodies that were fetched
// and `removed` the resources the source no longer has, so an incremental
// sync touches only what changed. An event's id comes from its UID, so it
// survives the server moving it to another path. Unchanged rows are not
// rewritten, so a refresh with no news writes nothing.
export const applyExternalCalendar = action({
  name: "applyExternalCalendar",
  args: {
    sourceId: v.string(),
    calendarKey: v.string(),
    name: v.string(),
    color: v.union(v.string(), v.null()),
    ownerEmails: v.array(v.string()),
    events: v.array(externalEventInput),
    removed: v.array(v.string()),
  },
  handler: function* applyExternalCalendar({
    sourceId,
    calendarKey,
    name,
    color,
    ownerEmails,
    events,
    removed,
  }) {
    const calendarId = yield* calendarIdFor(sourceId, calendarKey);
    const calendar = yield* selectFrom(externalCalendarsTable, "byId")
      .where((q) => q.eq("id", calendarId))
      .first();
    if (
      !calendar ||
      calendar.name !== name ||
      calendar.color !== color ||
      calendar.sourceId !== sourceId ||
      (calendar.ownerEmails ?? []).join("\n") !== ownerEmails.join("\n")
    ) {
      yield* upsert(externalCalendarsTable, [
        {
          type: externalCalendarType,
          id: calendarId,
          sourceId,
          name,
          color,
          ownerEmails,
        },
      ]);
    }

    const ids = yield* genUUIDV5Many(
      externalEventType,
      events.map((event) => `${calendarId}/${event.uid}`),
    );
    const existingById = new Map(
      ids.length > 0
        ? (yield* selectFrom(externalEventsTable, "byId").where((q) =>
            ids.map((id) => q.eq("id", id)),
          )).map((row) => [row.id, row])
        : [],
    );
    const removedSet = new Set(removed);

    const kept = new Set<string>();
    const changed: ExternalEvent[] = [];
    events.forEach(({ uid: _uid, ...event }, index) => {
      const id = ids[index]!;
      const current = existingById.get(id);
      // A UID held by two resources (against RFC 4791) keeps the one already
      // stored, so the row does not flip between them on every refresh.
      if (
        kept.has(id) ||
        (current &&
          current.resource !== event.resource &&
          !removedSet.has(current.resource))
      ) {
        return;
      }
      kept.add(id);
      if (
        current &&
        current.resource === event.resource &&
        current.etag === event.etag &&
        current.ics === event.ics &&
        current.seriesStart === event.seriesStart &&
        current.seriesEnd === event.seriesEnd
      ) {
        return;
      }
      changed.push({
        type: externalEventType,
        id,
        calendarId,
        ...event,
        span: seriesSpan(event),
      });
    });
    if (changed.length > 0) yield* upsert(externalEventsTable, changed);

    const gone =
      removed.length > 0
        ? (yield* selectFrom(externalEventsTable, "byCalendarResource").where(
            (q) =>
              removed.map((resource) =>
                q.eq("calendarId", calendarId).eq("resource", resource),
              ),
          ))
            .filter((row) => !kept.has(row.id))
            .map((row) => row.id)
        : [];
    if (gone.length > 0) yield* deleteRows(externalEventsTable, gone);
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
