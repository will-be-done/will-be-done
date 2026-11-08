import ICAL from "ical.js";
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
  externalEventDetails,
  externalEventOccurrencesInRange,
  externalEventResources,
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

  it("shows an instance moved far before its original date", () => {
    const ics = vcalendar(
      vevent(
        "UID:d",
        "SUMMARY:Daily",
        "DTSTART:20261101T100000Z",
        "DTEND:20261101T110000Z",
        "RRULE:FREQ=DAILY",
      ),
      vevent(
        "UID:d",
        "SUMMARY:Daily (pulled in)",
        "RECURRENCE-ID:20261120T100000Z",
        "DTSTART:20261110T150000Z",
        "DTEND:20261110T160000Z",
      ),
    );
    const occurrences = expandExternalEvent(
      row(ics),
      utc("2026-11-10T00:00:00Z"),
      utc("2026-11-11T00:00:00Z"),
    );
    expect(occurrences.map((o) => o.title)).toEqual([
      "Daily",
      "Daily (pulled in)",
    ]);
    expect(
      expandExternalEvent(
        row(ics),
        utc("2026-11-20T00:00:00Z"),
        utc("2026-11-21T00:00:00Z"),
      ),
    ).toEqual([]);
  });

  it("expands years-old dense series near the requested range", () => {
    const hourly = vcalendar(
      vevent(
        "UID:h",
        "DTSTART:20200101T000000Z",
        "DURATION:PT10M",
        "RRULE:FREQ=HOURLY",
      ),
    );
    expect(
      expandExternalEvent(
        row(hourly),
        utc("2026-11-10T00:00:00Z"),
        utc("2026-11-10T03:00:00Z"),
      ).map((o) => new Date(o.startMs).toISOString()),
    ).toEqual([
      "2026-11-10T00:00:00.000Z",
      "2026-11-10T01:00:00.000Z",
      "2026-11-10T02:00:00.000Z",
    ]);
  });

  it.each([
    [
      "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH",
      "2026-10-20T00:00:00Z",
      "2026-11-20T00:00:00Z",
    ],
    ["FREQ=HOURLY;INTERVAL=6", "2026-11-01T00:00:00Z", "2026-11-03T00:00:00Z"],
    // Skipping ahead lands on a day the rule filters out.
    ["FREQ=DAILY;BYMONTH=1,7", "2026-12-30T00:00:00Z", "2027-01-03T00:00:00Z"],
    ["FREQ=DAILY;BYMONTH=1,7", "2026-11-01T00:00:00Z", "2026-11-20T00:00:00Z"],
  ])("matches a full expansion when skipping ahead: %s", (rule, from, to) => {
    const ics = vcalendar(
      berlin,
      vevent(
        "UID:r",
        "DTSTART;TZID=Europe/Berlin:20200102T090000",
        "DURATION:PT1H",
        `RRULE:${rule}`,
      ),
    );
    const event = new ICAL.Event(
      new ICAL.Component(ICAL.parse(ics)).getFirstSubcomponent("vevent")!,
    );
    const expected: number[] = [];
    const iterator = event.iterator();
    for (let next = iterator.next(); next; next = iterator.next()) {
      const start = next.toJSDate().getTime();
      if (start >= utc(to)) break;
      if (start >= utc(from)) expected.push(start);
    }

    expect(
      expandExternalEvent(row(ics), utc(from), utc(to)).map((o) => o.startMs),
    ).toEqual(expected);
  });
});

describe("invitations", () => {
  const invite = (...lines: string[]) =>
    vcalendar(
      vevent(
        "UID:sync",
        "SUMMARY:Sync",
        "DTSTART:20261110T100000Z",
        "DTEND:20261110T110000Z",
        "RRULE:FREQ=DAILY;COUNT=3",
        "ORGANIZER;CN=Ann:mailto:ann@example.com",
        ...lines,
      ),
      vevent(
        "UID:sync",
        "SUMMARY:Sync",
        "RECURRENCE-ID:20261111T100000Z",
        "DTSTART:20261111T100000Z",
        "DTEND:20261111T110000Z",
        "ORGANIZER;CN=Ann:mailto:ann@example.com",
        "ATTENDEE;PARTSTAT=DECLINED:mailto:Me@Example.com",
      ),
    );

  it("reads the owner's reply per instance", () => {
    const occurrences = expandExternalEvent(
      row(invite("ATTENDEE;PARTSTAT=TENTATIVE:mailto:me@example.com")),
      0,
      Infinity,
      new Set(["me@example.com"]),
    );
    expect(occurrences.map((o) => o.response)).toEqual([
      "tentative",
      "declined",
      "tentative",
    ]);
    expect(
      expandExternalEvent(row(invite()), 0, Infinity).map((o) => o.response),
    ).toEqual([null, null, null]);
  });

  it("marks tentative and free events", () => {
    const [event] = expandExternalEvent(
      row(
        vcalendar(
          vevent(
            "UID:x",
            "STATUS:TENTATIVE",
            "TRANSP:TRANSPARENT",
            "DTSTART:20261110T100000Z",
            "DTEND:20261110T110000Z",
          ),
        ),
      ),
      0,
      Infinity,
    );
    expect(event).toMatchObject({ status: "tentative", free: true });
  });

  it("hides declined instances from the range", () => {
    const db = createDB();
    syncDispatch(
      db,
      applyExternalCalendar({
        sourceId: "source",
        calendarKey: "/cal/work/",
        name: "Work",
        color: null,
        ownerEmails: ["me@example.com"],
        removed: [],
        events: [
          {
            resource: "sync.ics",
            uid: "sync",
            etag: null,
            ics: invite("ATTENDEE;PARTSTAT=ACCEPTED:mailto:me@example.com"),
            seriesStart: 0,
            seriesEnd: Number.MAX_SAFE_INTEGER,
          },
        ],
      }),
    );
    const occurrences = selectSync(db, {
      selector: externalEventOccurrencesInRange,
      args: { fromMs: 0, toMs: utc("2027-01-01T00:00:00Z") },
    });
    expect(occurrences.map((o) => new Date(o.startMs).toISOString())).toEqual([
      "2026-11-10T10:00:00.000Z",
      "2026-11-12T10:00:00.000Z",
    ]);

    const [first] = occurrences;
    expect(
      selectSync(db, {
        selector: externalEventDetails,
        args: { eventId: first!.eventId, recurrenceKey: first!.recurrenceKey },
      }),
    ).toMatchObject({
      organizer: { name: "Ann", email: "ann@example.com", isOwner: false },
      attendees: [
        { email: "me@example.com", response: "accepted", isOwner: true },
      ],
    });
  });
});

describe("externalEventDetails", () => {
  it("reads the description as text and finds the meeting link", () => {
    const db = createDB();
    syncDispatch(
      db,
      applyExternalCalendar({
        sourceId: "source",
        calendarKey: "/cal/work/",
        name: "Work",
        color: null,
        ownerEmails: [],
        removed: [],
        events: [
          {
            resource: "call.ics",
            uid: "call",
            etag: null,
            ics: vcalendar(
              vevent(
                "UID:call",
                "SUMMARY:Call",
                "DTSTART:20261110T100000Z",
                "DTEND:20261110T110000Z",
                "DESCRIPTION:<p>Agenda &amp; notes<br>Join: https://us02web.zoom.us/j/123?pwd=abc</p>",
                "URL:https://example.com/event",
              ),
            ),
            seriesStart: 0,
            seriesEnd: Number.MAX_SAFE_INTEGER,
          },
        ],
      }),
    );
    const [occurrence] = selectSync(db, {
      selector: externalEventOccurrencesInRange,
      args: { fromMs: 0, toMs: utc("2027-01-01T00:00:00Z") },
    });
    expect(
      selectSync(db, {
        selector: externalEventDetails,
        args: {
          eventId: occurrence!.eventId,
          recurrenceKey: occurrence!.recurrenceKey,
        },
      }),
    ).toEqual({
      description:
        "Agenda & notes\nJoin: https://us02web.zoom.us/j/123?pwd=abc",
      url: "https://example.com/event",
      meetingUrl: "https://us02web.zoom.us/j/123?pwd=abc",
      organizer: null,
      attendees: [],
    });
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

  it("starts an unbounded series at an instance moved before it", () => {
    const bounds = externalEventSeriesBounds(
      vcalendar(
        vevent("UID:a", "DTSTART:20261110T100000Z", "RRULE:FREQ=DAILY"),
        vevent(
          "UID:a",
          "RECURRENCE-ID:20261112T100000Z",
          "DTSTART:20261101T100000Z",
        ),
      ),
    );
    expect(bounds).toEqual({
      seriesStart: utc("2026-11-01T10:00:00Z") - 14 * HOUR,
      seriesEnd: Number.MAX_SAFE_INTEGER,
    });
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
const input = (
  resource: string,
  uid: string,
  start: string,
  etag: string | null = null,
) => {
  const ics = eventIcs(uid, start);
  return { resource, uid, etag, ics, ...externalEventSeriesBounds(ics)! };
};

describe("applyExternalCalendar", () => {
  const calendar = {
    sourceId: "source",
    calendarKey: "/cal/work/",
    name: "Work",
    color: "#ff0000",
    ownerEmails: [],
  };

  it("mirrors the source and rewrites nothing when it is unchanged", () => {
    const db = createDB();
    const a = input("a.ics", "a", "20261110T100000Z", "1");
    const b = input("b.ics", "b", "20261111T100000Z", "1");
    syncDispatch(
      db,
      applyExternalCalendar({
        ...calendar,
        removed: [],
        events: [a, b],
      }),
    );
    expect(selectSync(db, { selector: allEvents, args: {} })).toHaveLength(2);
    expect(
      selectSync(db, {
        selector: externalEventResources,
        args: { sourceId: "source", calendarKey: "/cal/work/" },
      }),
    ).toEqual(
      new Map([
        ["a.ics", { etag: "1", seriesEnd: a.seriesEnd }],
        ["b.ics", { etag: "1", seriesEnd: b.seriesEnd }],
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
        removed: [],
        events: [a],
      }),
    );
    expect(writes).toBe(0);

    const changedA = input("a.ics", "a", "20261110T120000Z", "2");
    syncDispatch(
      db,
      applyExternalCalendar({
        ...calendar,
        name: "Work (renamed)",
        removed: ["b.ics"],
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

  it("keeps an event's id by UID when its resource path changes", () => {
    const db = createDB();
    syncDispatch(
      db,
      applyExternalCalendar({
        ...calendar,
        removed: [],
        events: [input("old.ics", "a", "20261110T100000Z", "1")],
      }),
    );
    const [before] = selectSync(db, { selector: allEvents, args: {} });

    syncDispatch(
      db,
      applyExternalCalendar({
        ...calendar,
        removed: ["old.ics"],
        events: [input("new.ics", "a", "20261111T100000Z", "1")],
      }),
    );
    const events = selectSync(db, { selector: allEvents, args: {} });
    expect(events.map((e) => [e.id, e.resource])).toEqual([
      [before!.id, "new.ics"],
    ]);
  });

  it("keeps the stored resource when two resources share a UID", () => {
    const db = createDB();
    syncDispatch(
      db,
      applyExternalCalendar({
        ...calendar,
        removed: [],
        events: [
          input("a.ics", "a", "20261110T100000Z", "1"),
          input("b.ics", "a", "20261111T100000Z", "1"),
        ],
      }),
    );
    expect(
      selectSync(db, { selector: allEvents, args: {} }).map((e) => e.resource),
    ).toEqual(["a.ics"]);

    let writes = 0;
    db.afterUpsert(function* () {
      writes += 1;
      yield* noop();
    });
    syncDispatch(
      db,
      applyExternalCalendar({
        ...calendar,
        removed: [],
        events: [input("b.ics", "a", "20261111T100000Z", "1")],
      }),
    );
    expect(writes).toBe(0);
  });

  it("removes calendars that are no longer kept, with their events", () => {
    const db = createDB();
    for (const calendarKey of ["/cal/work/", "/cal/home/"]) {
      syncDispatch(
        db,
        applyExternalCalendar({
          ...calendar,
          calendarKey,
          removed: [],
          events: [input("a.ics", "a", "20261110T100000Z")],
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
        removed: [],
        events: [input("a.ics", "a", "20261110T100000Z")],
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
