import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DB,
  execSync,
  selectFrom,
  selectSync,
  SubscribableDB,
  syncDispatch,
  createSelector,
  noop,
} from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import { dbIdTrait } from "../traits";
import { registeredSpaceSyncableTables } from "./syncMap";
import { externalCalendarsTable, externalEventsTable } from "./tables";
import {
  applyExternalCalendar,
  expandExternalEvent,
  externalEventOccurrencesInRange,
  externalEventResourceEtags,
  externalEventSeriesBounds,
  removeExternalCalendars,
} from "./externalEvents";
import { loadSpaceBackup } from "./backup";

const HOUR = 60 * 60 * 1000;
const selector = createSelector();

const vcalendar = (...parts: string[]) =>
  [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//test//EN",
    ...parts,
    "END:VCALENDAR",
  ].join("\r\n");

const berlin = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Berlin",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
].join("\r\n");

const vevent = (...lines: string[]) =>
  ["BEGIN:VEVENT", "DTSTAMP:20260101T000000Z", ...lines, "END:VEVENT"].join(
    "\r\n",
  );

const row = (ics: string, id = "event") => ({
  type: "externalEvent" as const,
  id,
  calendarId: "calendar",
  resource: `${id}.ics`,
  etag: null,
  ics,
  seriesStart: 0,
  seriesEnd: Number.MAX_SAFE_INTEGER,
});

const utc = (iso: string) => new Date(iso).getTime();

let previousTZ: string | undefined;
beforeEach(() => {
  previousTZ = process.env.TZ;
});
afterEach(() => {
  if (previousTZ === undefined) delete process.env.TZ;
  else process.env.TZ = previousTZ;
});

describe("expandExternalEvent", () => {
  const weekly = vcalendar(
    berlin,
    vevent(
      "UID:standup",
      "SUMMARY:Standup",
      "DTSTART;TZID=Europe/Berlin:20261019T090000",
      "DTEND;TZID=Europe/Berlin:20261019T093000",
      "RRULE:FREQ=WEEKLY;COUNT=4",
      "EXDATE;TZID=Europe/Berlin:20261102T090000",
    ),
    vevent(
      "UID:standup",
      "SUMMARY:Standup (moved)",
      "RECURRENCE-ID;TZID=Europe/Berlin:20261109T090000",
      "DTSTART;TZID=Europe/Berlin:20261109T110000",
      "DTEND;TZID=Europe/Berlin:20261109T113000",
    ),
  );

  it("expands a zoned series across DST with excluded and moved instances", () => {
    const occurrences = expandExternalEvent(
      row(weekly),
      utc("2026-10-01T00:00:00Z"),
      utc("2026-12-01T00:00:00Z"),
    );

    expect(
      occurrences.map((o) => [new Date(o.startMs).toISOString(), o.title]),
    ).toEqual([
      // 09:00 Berlin is 07:00 UTC in summer time and 08:00 UTC after it.
      ["2026-10-19T07:00:00.000Z", "Standup"],
      ["2026-10-26T08:00:00.000Z", "Standup"],
      ["2026-11-09T10:00:00.000Z", "Standup (moved)"],
    ]);
    expect(occurrences[0]!.endMs - occurrences[0]!.startMs).toBe(HOUR / 2);
    expect(new Set(occurrences.map((o) => o.key)).size).toBe(3);
  });

  it("returns only occurrences overlapping the range", () => {
    const occurrences = expandExternalEvent(
      row(weekly),
      utc("2026-10-19T07:15:00Z"),
      utc("2026-10-26T08:00:00Z"),
    );
    expect(occurrences.map((o) => o.startMs)).toEqual([
      utc("2026-10-19T07:00:00Z"),
    ]);
  });

  it("places all-day and floating events in the device's zone", () => {
    const ics = vcalendar(
      vevent(
        "UID:trip",
        "SUMMARY:Trip",
        "DTSTART;VALUE=DATE:20261110",
        "DTEND;VALUE=DATE:20261112",
      ),
    );
    const floating = vcalendar(
      vevent(
        "UID:gym",
        "SUMMARY:Gym",
        "DTSTART:20261110T100000",
        "DTEND:20261110T110000",
      ),
    );

    for (const tz of ["America/New_York", "Asia/Tokyo"]) {
      process.env.TZ = tz;
      const [trip] = expandExternalEvent(row(ics), 0, Number.MAX_SAFE_INTEGER);
      expect(trip).toMatchObject({
        allDay: true,
        startMs: new Date(2026, 10, 10).getTime(),
        endMs: new Date(2026, 10, 12).getTime(),
      });
      const [gym] = expandExternalEvent(
        row(floating, "gym"),
        0,
        Number.MAX_SAFE_INTEGER,
      );
      expect(gym).toMatchObject({
        allDay: false,
        startMs: new Date(2026, 10, 10, 10).getTime(),
      });
    }
  });

  it("resolves an IANA TZID sent without a VTIMEZONE", () => {
    const ics = vcalendar(
      vevent(
        "UID:call",
        "SUMMARY:Call",
        "DTSTART;TZID=America/New_York:20260715T090000",
        "DTEND;TZID=America/New_York:20260715T100000",
      ),
    );
    process.env.TZ = "Asia/Tokyo";
    const [call] = expandExternalEvent(row(ics), 0, Number.MAX_SAFE_INTEGER);
    expect(call!.startMs).toBe(utc("2026-07-15T13:00:00Z"));
    expect(call!.endMs).toBe(utc("2026-07-15T14:00:00Z"));
  });

  it("skips cancelled series and cancelled instances", () => {
    const cancelled = vcalendar(
      vevent(
        "UID:x",
        "STATUS:CANCELLED",
        "DTSTART:20261110T100000Z",
        "DTEND:20261110T110000Z",
      ),
    );
    expect(expandExternalEvent(row(cancelled), 0, Infinity)).toEqual([]);

    const daily = vcalendar(
      vevent(
        "UID:y",
        "DTSTART:20261110T100000Z",
        "DTEND:20261110T110000Z",
        "RRULE:FREQ=DAILY;COUNT=3",
      ),
      vevent(
        "UID:y",
        "RECURRENCE-ID:20261111T100000Z",
        "STATUS:CANCELLED",
        "DTSTART:20261111T100000Z",
        "DTEND:20261111T110000Z",
      ),
    );
    expect(
      expandExternalEvent(row(daily), 0, Infinity).map((o) => o.startMs),
    ).toEqual([utc("2026-11-10T10:00:00Z"), utc("2026-11-12T10:00:00Z")]);
  });

  it("expands an unbounded series far into the future", () => {
    const ics = vcalendar(
      vevent(
        "UID:z",
        "DTSTART:20200106T100000Z",
        "DTEND:20200106T110000Z",
        "RRULE:FREQ=WEEKLY",
      ),
    );
    const occurrences = expandExternalEvent(
      row(ics),
      utc("2030-01-01T00:00:00Z"),
      utc("2030-01-15T00:00:00Z"),
    );
    expect(occurrences.map((o) => new Date(o.startMs).toISOString())).toEqual([
      "2030-01-07T10:00:00.000Z",
      "2030-01-14T10:00:00.000Z",
    ]);
  });
});

describe("externalEventSeriesBounds", () => {
  it("pads a single event", () => {
    const bounds = externalEventSeriesBounds(
      vcalendar(
        vevent("UID:a", "DTSTART:20261110T100000Z", "DTEND:20261110T110000Z"),
      ),
    );
    expect(bounds).toEqual({
      seriesStart: utc("2026-11-10T10:00:00Z") - 14 * HOUR,
      seriesEnd: utc("2026-11-10T11:00:00Z") + 14 * HOUR,
    });
  });

  it("ends a counted series at its last occurrence", () => {
    const bounds = externalEventSeriesBounds(
      vcalendar(
        vevent(
          "UID:a",
          "DTSTART;VALUE=DATE:20261110",
          "RRULE:FREQ=DAILY;COUNT=3",
        ),
      ),
    );
    expect(bounds?.seriesEnd).toBe(utc("2026-11-13T00:00:00Z") + 14 * HOUR);
  });

  it("treats a rule without UNTIL or COUNT as unbounded", () => {
    const bounds = externalEventSeriesBounds(
      vcalendar(
        vevent("UID:a", "DTSTART:20261110T100000Z", "RRULE:FREQ=MONTHLY"),
      ),
    );
    expect(bounds?.seriesEnd).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("rejects resources without a usable event", () => {
    expect(externalEventSeriesBounds("not ical")).toBeNull();
    expect(externalEventSeriesBounds(vcalendar())).toBeNull();
  });
});

const createDB = () => {
  const db = new SubscribableDB(
    new DB(new BptreeInmemDriver(), {
      traits: [dbIdTrait("space", "a0000000-0000-4000-8000-000000000001")],
    }),
  );
  execSync(db.loadTables(registeredSpaceSyncableTables));
  return db;
};

const allEvents = selector({
  name: "allExternalEventsForTest",
  args: {},
  handler: function* () {
    return yield* selectFrom(externalEventsTable, "byIds");
  },
});
const allCalendars = selector({
  name: "allExternalCalendarsForTest",
  args: {},
  handler: function* () {
    return yield* selectFrom(externalCalendarsTable, "byIds");
  },
});

const eventIcs = (uid: string, start: string) =>
  vcalendar(
    vevent(`UID:${uid}`, `SUMMARY:${uid}`, `DTSTART:${start}`, "DURATION:PT1H"),
  );
const input = (resource: string, ics: string, etag: string | null = null) => ({
  resource,
  etag,
  ics,
  ...externalEventSeriesBounds(ics)!,
});

describe("applyExternalCalendar", () => {
  const calendar = {
    sourceId: "source",
    calendarKey: "/cal/work/",
    name: "Work",
    color: "#ff0000",
  };

  it("mirrors the source and rewrites nothing when it is unchanged", () => {
    const db = createDB();
    const a = input("a.ics", eventIcs("a", "20261110T100000Z"), "1");
    const b = input("b.ics", eventIcs("b", "20261111T100000Z"), "1");
    syncDispatch(
      db,
      applyExternalCalendar({
        ...calendar,
        resources: ["a.ics", "b.ics"],
        events: [a, b],
      }),
    );
    expect(selectSync(db, { selector: allEvents, args: {} })).toHaveLength(2);
    expect(
      selectSync(db, {
        selector: externalEventResourceEtags,
        args: { sourceId: "source", calendarKey: "/cal/work/" },
      }),
    ).toEqual(
      new Map([
        ["a.ics", "1"],
        ["b.ics", "1"],
      ]),
    );

    let writes = 0;
    db.afterUpsert(function* () {
      writes += 1;
      yield* noop();
    });
    db.afterDelete(function* () {
      writes += 1;
      yield* noop();
    });
    syncDispatch(
      db,
      applyExternalCalendar({
        ...calendar,
        resources: ["a.ics", "b.ics"],
        events: [a],
      }),
    );
    expect(writes).toBe(0);

    const changedA = input("a.ics", eventIcs("a", "20261110T120000Z"), "2");
    syncDispatch(
      db,
      applyExternalCalendar({
        ...calendar,
        name: "Work (renamed)",
        resources: ["a.ics"],
        events: [changedA],
      }),
    );
    const events = selectSync(db, { selector: allEvents, args: {} });
    expect(events.map((e) => [e.resource, e.etag])).toEqual([["a.ics", "2"]]);
    expect(
      selectSync(db, { selector: allCalendars, args: {} }).map((c) => c.name),
    ).toEqual(["Work (renamed)"]);

    const occurrences = selectSync(db, {
      selector: externalEventOccurrencesInRange,
      args: {
        fromMs: utc("2026-11-10T00:00:00Z"),
        toMs: utc("2026-11-11T00:00:00Z"),
      },
    });
    expect(occurrences).toMatchObject([
      {
        title: "a",
        calendarName: "Work (renamed)",
        color: "#ff0000",
        startMs: utc("2026-11-10T12:00:00Z"),
      },
    ]);
  });

  it("removes calendars that are no longer kept, with their events", () => {
    const db = createDB();
    for (const calendarKey of ["/cal/work/", "/cal/home/"]) {
      syncDispatch(
        db,
        applyExternalCalendar({
          ...calendar,
          calendarKey,
          resources: ["a.ics"],
          events: [input("a.ics", eventIcs("a", "20261110T100000Z"))],
        }),
      );
    }

    syncDispatch(
      db,
      removeExternalCalendars({
        sourceId: "source",
        keepCalendarKeys: ["/cal/home/"],
      }),
    );
    expect(selectSync(db, { selector: allCalendars, args: {} })).toHaveLength(
      1,
    );
    expect(selectSync(db, { selector: allEvents, args: {} })).toHaveLength(1);

    syncDispatch(
      db,
      removeExternalCalendars({ sourceId: "source", keepCalendarKeys: [] }),
    );
    expect(selectSync(db, { selector: allCalendars, args: {} })).toEqual([]);
    expect(selectSync(db, { selector: allEvents, args: {} })).toEqual([]);
  });

  it("survives a backup load", () => {
    const db = createDB();
    syncDispatch(
      db,
      applyExternalCalendar({
        ...calendar,
        resources: ["a.ics"],
        events: [input("a.ics", eventIcs("a", "20261110T100000Z"))],
      }),
    );

    syncDispatch(
      db,
      loadSpaceBackup({
        backup: {
          projects: [],
          projectSections: [],
          tasks: [],
          taskTemplates: [],
          dailyLists: [],
        },
      }),
    );

    expect(selectSync(db, { selector: allEvents, args: {} })).toHaveLength(1);
    expect(selectSync(db, { selector: allCalendars, args: {} })).toHaveLength(
      1,
    );
  });
});
