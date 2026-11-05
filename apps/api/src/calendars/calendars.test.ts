import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";
import {
  createAction,
  createSelector,
  DB,
  execSync,
  selectFrom,
  selectSync,
  SubscribableDB,
  syncDispatch,
  upsert,
} from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import {
  externalCalendarsTable,
  externalEventsTable,
  registeredSpaceSyncableTables,
} from "@will-be-done/slices/space";
import { dbIdTrait } from "@will-be-done/slices/traits";
import * as databases from "../db/db";
import { spaceDBConfig } from "../db/configs";
import {
  CalendarFetchError,
  guardedFetch,
  isPrivateAddress,
  mayShareCredentials,
} from "./guardedFetch";
import { syncDueCalendarSources } from "./scheduler";
import {
  addCalendarSource,
  removeCalendarSource,
  setCalendarEnabled,
  syncCalendarSource,
  type CalendarConfig,
} from "./service";
import { calendarSourceById } from "./sources";
import { calendarSourcesTable } from "./tables";
import { decryptSecret, encryptSecret } from "./secrets";

const selector = createSelector();
const allEvents = selector({
  name: "calendarTestEvents",
  args: {},
  handler: function* () {
    return yield* selectFrom(externalEventsTable, "byIds");
  },
});
const allCalendars = selector({
  name: "calendarTestCalendars",
  args: {},
  handler: function* () {
    return yield* selectFrom(externalCalendarsTable, "byIds");
  },
});

const config: CalendarConfig = {
  encryptionKey: "k".repeat(32),
  allowPrivateNetworks: true,
  syncIntervalMs: 15 * 60_000,
};

const vevent = (uid: string, summary: string, start: string) =>
  [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    "DTSTAMP:20260101T000000Z",
    `SUMMARY:${summary}`,
    `DTSTART:${start}`,
    "DURATION:PT1H",
    "END:VEVENT",
  ].join("\r\n");

const vcalendar = (...events: string[]) =>
  [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//test//EN",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");

const ics = (uid: string, summary: string, start: string) =>
  vcalendar(vevent(uid, summary, start));

const xml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\r/g, "&#13;");

type FakeEvent = { etag: string; ics: string };
const davState = {
  events: new Map<string, FakeEvent>(),
  multigetHrefs: [] as string[][],
  feed: "",
  foreignAuth: [] as string[],
};

const multistatus = (responses: string[]) =>
  new Response(
    `<?xml version="1.0"?><D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:A="http://apple.com/ns/ical/">${responses.join("")}</D:multistatus>`,
    { status: 207, headers: { "content-type": "application/xml" } },
  );
const response = (href: string, props: string) =>
  `<D:response><D:href>${href}</D:href><D:propstat><D:prop>${props}</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`;

let server: ReturnType<typeof Bun.serve>;
let baseUrl = "";

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/feed.ics") {
        return new Response(davState.feed, {
          headers: { "content-type": "text/calendar" },
        });
      }
      if (url.pathname === "/redirect-elsewhere") {
        return Response.redirect(`http://localhost:${url.port}/echo-auth`, 302);
      }
      if (url.pathname === "/echo-auth") {
        return new Response(request.headers.get("authorization") ?? "none");
      }
      if (url.pathname === "/big") return new Response("x".repeat(2048));
      if (url.pathname === "/foreign-principal/") {
        davState.foreignAuth.push(
          request.headers.get("authorization") ?? "none",
        );
        return new Response("no", { status: 401 });
      }

      if (
        request.headers.get("authorization") !== `Basic ${btoa("me:secret")}`
      ) {
        return new Response("no", { status: 401 });
      }
      const body = await request.text();
      if (url.pathname === "/.well-known/caldav") {
        return new Response(null, {
          status: 301,
          headers: { location: "/dav/" },
        });
      }
      if (url.pathname === "/hijacked/") {
        return multistatus([
          response(
            "/hijacked/",
            `<D:current-user-principal><D:href>http://localhost:${url.port}/foreign-principal/</D:href></D:current-user-principal>`,
          ),
        ]);
      }
      if (url.pathname === "/dav/") {
        return multistatus([
          response(
            "/dav/",
            "<D:current-user-principal><D:href>/dav/principals/me/</D:href></D:current-user-principal><D:resourcetype><D:collection/></D:resourcetype>",
          ),
        ]);
      }
      if (url.pathname === "/dav/principals/me/") {
        return multistatus([
          response(
            "/dav/principals/me/",
            "<C:calendar-home-set><D:href>/dav/calendars/me/</D:href></C:calendar-home-set>",
          ),
        ]);
      }
      if (url.pathname === "/dav/calendars/me/") {
        return multistatus([
          response(
            "/dav/calendars/me/",
            "<D:resourcetype><D:collection/></D:resourcetype>",
          ),
          response(
            "/dav/calendars/me/work/",
            '<D:resourcetype><D:collection/><C:calendar/></D:resourcetype><D:displayname>Work</D:displayname><A:calendar-color>#FF8800FF</A:calendar-color><C:supported-calendar-component-set><C:comp name="VEVENT"/></C:supported-calendar-component-set>',
          ),
          response(
            "/dav/calendars/me/todos/",
            '<D:resourcetype><D:collection/><C:calendar/></D:resourcetype><D:displayname>Todos</D:displayname><C:supported-calendar-component-set><C:comp name="VTODO"/></C:supported-calendar-component-set>',
          ),
        ]);
      }
      if (
        url.pathname === "/dav/calendars/me/work/" &&
        request.method === "REPORT"
      ) {
        if (body.includes("calendar-multiget")) {
          const hrefs = [...body.matchAll(/<d:href>([^<]+)<\/d:href>/g)].map(
            (m) => m[1]!,
          );
          davState.multigetHrefs.push(hrefs);
          return multistatus(
            hrefs.flatMap((href) => {
              const event = davState.events.get(href);
              return event
                ? [
                    response(
                      href,
                      `<D:getetag>${event.etag}</D:getetag><C:calendar-data>${xml(event.ics)}</C:calendar-data>`,
                    ),
                  ]
                : [];
            }),
          );
        }
        return multistatus(
          [...davState.events].map(([href, event]) =>
            response(href, `<D:getetag>${event.etag}</D:getetag>`),
          ),
        );
      }
      return new Response("not found", { status: 404 });
    },
  });
  baseUrl = `http://127.0.0.1:${server.port}`;
});

afterAll(() => {
  void server.stop(true);
});

const setup = () => {
  const mainDB = new DB(new BptreeInmemDriver());
  execSync(mainDB.loadTables([calendarSourcesTable]));
  const spaceDb = new SubscribableDB(
    new DB(new BptreeInmemDriver(), {
      traits: [dbIdTrait("space", "a0000000-0000-4000-8000-000000000001")],
    }),
  );
  execSync(spaceDb.loadTables(registeredSpaceSyncableTables));
  spyOn(databases, "getHyperDB").mockResolvedValue({
    db: spaceDb,
    dbConfig: spaceDBConfig("space-1"),
    nextClock: Object.assign(() => "", { observe: () => {} }),
    clientId: "server",
  } as never);
  return { mainDB, spaceDb };
};

const source = (mainDB: DB, id: string) => {
  const row = selectSync(mainDB, {
    selector: calendarSourceById,
    args: { id },
  });
  if (!row) throw new Error("missing source");
  return row;
};

afterEach(() => {
  mock.restore();
  davState.events.clear();
  davState.multigetHrefs = [];
  davState.foreignAuth = [];
});

const replaceSecret = (mainDB: DB, id: string, password: string) => {
  const sealed = encryptSecret(
    JSON.stringify({ url: `${baseUrl}/`, username: "me", password }),
    config.encryptionKey,
  );
  const replace = createAction()({
    name: "replaceSourceSecretForTest",
    args: {},
    handler: function* () {
      yield* upsert(calendarSourcesTable, [
        { ...source(mainDB, id), secret: sealed },
      ]);
    },
  });
  syncDispatch(mainDB, replace({}));
};

describe("CalDAV sources", () => {
  test("discovers event calendars and mirrors them incrementally", async () => {
    const { mainDB, spaceDb } = setup();
    davState.events.set("/dav/calendars/me/work/a.ics", {
      etag: '"1"',
      ics: ics("a", "Planning & review", "20991110T100000Z"),
    });
    davState.events.set("/dav/calendars/me/work/b.ics", {
      etag: '"1"',
      ics: ics("b", "Lunch", "20991111T120000Z"),
    });

    const id = await addCalendarSource(mainDB, config, {
      userId: "user",
      spaceId: "space-1",
      kind: "caldav",
      secret: { url: `${baseUrl}/`, username: "me", password: "secret" },
    });

    expect(source(mainDB, id)).toMatchObject({ status: "ok", lastError: null });
    expect(
      JSON.parse(
        decryptSecret(source(mainDB, id).secret, config.encryptionKey),
      ),
    ).toEqual({ url: `${baseUrl}/`, username: "me", password: "secret" });
    expect(
      selectSync(spaceDb, { selector: allCalendars, args: {} }),
    ).toMatchObject([{ name: "Work", color: "#ff8800", sourceId: id }]);
    const events = selectSync(spaceDb, { selector: allEvents, args: {} });
    expect(events.map((e) => e.resource).sort()).toEqual([
      "/dav/calendars/me/work/a.ics",
      "/dav/calendars/me/work/b.ics",
    ]);
    expect(events.find((e) => e.resource.endsWith("a.ics"))?.ics).toContain(
      "SUMMARY:Planning & review",
    );

    davState.multigetHrefs = [];
    davState.events.set("/dav/calendars/me/work/a.ics", {
      etag: '"2"',
      ics: ics("a", "Planning moved", "20991110T140000Z"),
    });
    davState.events.delete("/dav/calendars/me/work/b.ics");
    await syncCalendarSource(mainDB, id, config);

    expect(davState.multigetHrefs).toEqual([["/dav/calendars/me/work/a.ics"]]);
    const updated = selectSync(spaceDb, { selector: allEvents, args: {} });
    expect(updated).toHaveLength(1);
    expect(updated[0]).toMatchObject({ etag: '"2"' });
    expect(updated[0]!.ics).toContain("Planning moved");

    davState.multigetHrefs = [];
    await syncCalendarSource(mainDB, id, config);
    expect(davState.multigetHrefs).toEqual([]);

    const workKey = `${baseUrl}/dav/calendars/me/work/`;
    await setCalendarEnabled(
      mainDB,
      config,
      source(mainDB, id),
      workKey,
      false,
    );
    expect(selectSync(spaceDb, { selector: allCalendars, args: {} })).toEqual(
      [],
    );
    expect(selectSync(spaceDb, { selector: allEvents, args: {} })).toEqual([]);

    await setCalendarEnabled(mainDB, config, source(mainDB, id), workKey, true);
    expect(selectSync(spaceDb, { selector: allEvents, args: {} })).toHaveLength(
      1,
    );

    await removeCalendarSource(mainDB, source(mainDB, id));
    expect(
      selectSync(mainDB, { selector: calendarSourceById, args: { id } }),
    ).toBeUndefined();
    expect(selectSync(spaceDb, { selector: allEvents, args: {} })).toEqual([]);
    expect(selectSync(spaceDb, { selector: allCalendars, args: {} })).toEqual(
      [],
    );
  });

  test("rejects wrong credentials before saving the source", async () => {
    const { mainDB } = setup();
    expect(
      addCalendarSource(mainDB, config, {
        userId: "user",
        spaceId: "space-1",
        kind: "caldav",
        secret: { url: `${baseUrl}/`, username: "me", password: "wrong" },
      }),
    ).rejects.toThrow("rejected the username or password");
  });

  test("records a failing source and retries it on the next interval", async () => {
    const { mainDB } = setup();
    const id = await addCalendarSource(mainDB, config, {
      userId: "user",
      spaceId: "space-1",
      kind: "caldav",
      secret: { url: `${baseUrl}/`, username: "me", password: "secret" },
    });
    replaceSecret(mainDB, id, "old");

    const before = Date.now();
    await syncCalendarSource(mainDB, id, config);
    const failed = source(mainDB, id);
    expect(failed.status).toBe("error");
    expect(failed.lastError).toContain("rejected the username or password");
    expect(failed.nextSyncAt).toBeGreaterThanOrEqual(
      before + config.syncIntervalMs,
    );
  });
});

describe("CalDAV source safety", () => {
  test("does not send the password to a host found during discovery", async () => {
    const { mainDB } = setup();
    const error = await addCalendarSource(mainDB, config, {
      userId: "user",
      spaceId: "space-1",
      kind: "caldav",
      secret: {
        url: `${baseUrl}/hijacked/`,
        username: "me",
        password: "secret",
      },
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CalendarFetchError);
    expect(davState.foreignAuth).toEqual(["none"]);
  });

  test("hides an unticked calendar even when the server fails", async () => {
    const { mainDB, spaceDb } = setup();
    davState.events.set("/dav/calendars/me/work/a.ics", {
      etag: '"1"',
      ics: ics("a", "A", "20991110T100000Z"),
    });
    const id = await addCalendarSource(mainDB, config, {
      userId: "user",
      spaceId: "space-1",
      kind: "caldav",
      secret: { url: `${baseUrl}/`, username: "me", password: "secret" },
    });
    expect(selectSync(spaceDb, { selector: allEvents, args: {} })).toHaveLength(
      1,
    );

    replaceSecret(mainDB, id, "revoked");
    await setCalendarEnabled(
      mainDB,
      config,
      source(mainDB, id),
      `${baseUrl}/dav/calendars/me/work/`,
      false,
    );
    expect(source(mainDB, id).status).toBe("error");
    expect(selectSync(spaceDb, { selector: allEvents, args: {} })).toEqual([]);
    expect(selectSync(spaceDb, { selector: allCalendars, args: {} })).toEqual(
      [],
    );
  });

  test("drops an event whose update can no longer be stored", async () => {
    const { mainDB, spaceDb } = setup();
    davState.events.set("/dav/calendars/me/work/a.ics", {
      etag: '"1"',
      ics: ics("a", "A", "20991110T100000Z"),
    });
    const id = await addCalendarSource(mainDB, config, {
      userId: "user",
      spaceId: "space-1",
      kind: "caldav",
      secret: { url: `${baseUrl}/`, username: "me", password: "secret" },
    });

    davState.events.set("/dav/calendars/me/work/a.ics", {
      etag: '"2"',
      ics: ics("a", "A".repeat(300 * 1024), "20991110T100000Z"),
    });
    await syncCalendarSource(mainDB, id, config);
    expect(selectSync(spaceDb, { selector: allEvents, args: {} })).toEqual([]);
  });
});

describe("ICS sources", () => {
  test("stores one row per event UID with its timezone", async () => {
    const { mainDB, spaceDb } = setup();
    davState.feed = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Google Inc//Google Calendar 70.9054//EN",
      "X-WR-CALNAME:Personal",
      "BEGIN:VTIMEZONE",
      "TZID:Europe/Berlin",
      "BEGIN:STANDARD",
      "TZOFFSETFROM:+0200",
      "TZOFFSETTO:+0100",
      "DTSTART:19701025T030000",
      "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
      "END:STANDARD",
      "END:VTIMEZONE",
      "BEGIN:VEVENT",
      "UID:weekly",
      "DTSTAMP:20260101T000000Z",
      "SUMMARY:Weekly",
      "DTSTART;TZID=Europe/Berlin:20991104T090000",
      "DURATION:PT1H",
      "RRULE:FREQ=WEEKLY",
      "ATTACH:https://example.com/big.pdf",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:weekly",
      "DTSTAMP:20260101T000000Z",
      "RECURRENCE-ID;TZID=Europe/Berlin:20991111T090000",
      "SUMMARY:Weekly (moved)",
      "DTSTART;TZID=Europe/Berlin:20991111T100000",
      "DURATION:PT1H",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:old",
      "DTSTAMP:20260101T000000Z",
      "SUMMARY:Long ago",
      "DTSTART:20100101T100000Z",
      "DURATION:PT1H",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const id = await addCalendarSource(mainDB, config, {
      userId: "user",
      spaceId: "space-1",
      kind: "ics",
      secret: { url: `${baseUrl}/feed.ics` },
    });

    expect(source(mainDB, id)).toMatchObject({
      name: "Personal",
      status: "ok",
    });
    const events = selectSync(spaceDb, { selector: allEvents, args: {} });
    expect(events.map((e) => e.resource)).toEqual(["weekly"]);
    expect(events[0]!.ics).toContain("BEGIN:VTIMEZONE");
    expect(events[0]!.ics).toContain("RECURRENCE-ID");
    expect(events[0]!.ics).not.toContain("ATTACH");
    expect(events[0]!.seriesEnd).toBe(Number.MAX_SAFE_INTEGER);
  });

  test("rejects an address that is not a calendar", async () => {
    const { mainDB } = setup();
    davState.feed = "<html>nope</html>";
    expect(
      addCalendarSource(mainDB, config, {
        userId: "user",
        spaceId: "space-1",
        kind: "ics",
        secret: { url: `${baseUrl}/feed.ics` },
      }),
    ).rejects.toThrow("did not return an iCalendar feed");
  });
});

describe("syncDueCalendarSources", () => {
  test("syncs due sources of loaded spaces only", async () => {
    const { mainDB, spaceDb } = setup();
    davState.feed = ics("a", "A", "20991110T100000Z");
    const id = await addCalendarSource(mainDB, config, {
      userId: "user",
      spaceId: "space-1",
      kind: "ics",
      secret: { url: `${baseUrl}/feed.ics` },
    });
    davState.feed = vcalendar(
      vevent("a", "A", "20991110T100000Z"),
      vevent("b", "B", "20991111T100000Z"),
    );
    const due = source(mainDB, id).nextSyncAt;

    spyOn(databases, "getLoadedHyperDBs").mockReturnValue([]);
    await syncDueCalendarSources(mainDB, config, due);
    expect(selectSync(spaceDb, { selector: allEvents, args: {} })).toHaveLength(
      1,
    );

    spyOn(databases, "getLoadedHyperDBs").mockReturnValue([
      { database: "space-space-1", dbType: "space", db: spaceDb },
    ]);
    await syncDueCalendarSources(mainDB, config, due - 1);
    expect(selectSync(spaceDb, { selector: allEvents, args: {} })).toHaveLength(
      1,
    );

    await syncDueCalendarSources(mainDB, config, due);
    expect(selectSync(spaceDb, { selector: allEvents, args: {} })).toHaveLength(
      2,
    );
  });
});

describe("guardedFetch", () => {
  test.each([
    ["127.0.0.1", true],
    ["10.1.2.3", true],
    ["172.20.0.1", true],
    ["192.168.1.1", true],
    ["169.254.169.254", true],
    ["100.64.0.1", true],
    ["::1", true],
    ["fd00::1", true],
    ["fe80::1", true],
    ["::ffff:127.0.0.1", true],
    // How URL parsing normalizes [::ffff:127.0.0.1].
    ["::ffff:7f00:1", true],
    ["::7f00:1", true],
    ["0.0.0.0", true],
    ["8.8.8.8", false],
    ["2606:4700::1111", false],
  ])("%s private: %s", (ip, expected) => {
    expect(isPrivateAddress(ip)).toBe(expected);
  });

  test("refuses private hosts unless allowed", async () => {
    expect(
      guardedFetch(`${baseUrl}/big`, {}, { allowPrivateNetworks: false }),
    ).rejects.toThrow("private network address");
    expect(
      guardedFetch(
        `http://[::ffff:127.0.0.1]:${server.port}/big`,
        {},
        { allowPrivateNetworks: false },
      ),
    ).rejects.toThrow("private network address");
    // Resolved names are checked by the lookup the connection itself uses.
    expect(
      guardedFetch(
        `http://localhost:${server.port}/big`,
        {},
        { allowPrivateNetworks: false },
      ),
    ).rejects.toThrow("private network address");
    expect(
      guardedFetch("file:///etc/passwd", {}, { allowPrivateNetworks: true }),
    ).rejects.toBeInstanceOf(CalendarFetchError);
  });

  test("caps the response size", async () => {
    expect(
      guardedFetch(
        `${baseUrl}/big`,
        {},
        { allowPrivateNetworks: true, maxBytes: 1024 },
      ),
    ).rejects.toThrow("too large");
  });

  test("drops credentials when redirected to another site", async () => {
    const result = await guardedFetch(
      `${baseUrl}/redirect-elsewhere`,
      { authorization: "Basic abc" },
      { allowPrivateNetworks: true },
    );
    expect(result.body).toBe("none");
  });

  test.each([
    ["https://caldav.icloud.com/", "https://p52-caldav.icloud.com/1/", true],
    ["https://dav.example.com/", "https://dav.example.com:8443/", true],
    ["https://calendar.example.co.uk/", "https://attacker.co.uk/", false],
    ["https://me.github.io/", "https://attacker.github.io/", false],
    ["https://dav.example.com/", "http://dav.example.com/", false],
    ["http://10.0.0.5/", "http://10.0.0.6/", false],
  ])("credentials from %s to %s: %s", (from, to, expected) => {
    expect(mayShareCredentials(new URL(from), new URL(to))).toBe(expected);
  });
});
