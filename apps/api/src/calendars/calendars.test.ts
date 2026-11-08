/* eslint-disable @typescript-eslint/await-thenable -- Bun's rejects matchers
   are thenable at runtime, despite their current type declaration. */
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  mock,
  setSystemTime,
  spyOn,
  test,
} from "bun:test";
import { type AddressInfo, createServer } from "node:net";
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
  externalEventSeriesBounds,
  externalEventsTable,
  registeredSpaceSyncableTables,
} from "@will-be-done/slices/space";
import { dbIdTrait } from "@will-be-done/slices/traits";
import {
  deleteSpace,
  spacesTable,
  spacesTableType,
} from "@will-be-done/slices/user";
import { Context, Effect } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";
import * as databases from "../db/db";
import { MainDatabase } from "../db/mainDatabase";
import {
  CalendarFetchError,
  type CalendarHttpOptions,
  guardedHttpClient,
  isPrivateAddress,
  mayShareCredentials,
  responseText,
  sendCalendarRequest,
} from "./http";
import { type CalendarServices, syncDueCalendarSources } from "./scheduler";
import {
  addCalendarSource,
  CalendarConfig,
  removeCalendarSource,
  setCalendarEnabled,
  setCalendarSyncWindow,
  syncCalendarSource,
  type CalendarSettings,
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

const config: CalendarSettings = {
  encryptionKey: "k".repeat(32),
  allowPrivateNetworks: true,
  syncIntervalMs: 15 * 60_000,
};

const run = <A, E>(
  mainDB: DB,
  effect: Effect.Effect<A, E, CalendarServices>,
  http: Partial<CalendarHttpOptions> = {},
) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provideContext(
        Context.make(MainDatabase, mainDB).pipe(
          Context.add(CalendarConfig, config),
          Context.add(
            HttpClient.HttpClient,
            guardedHttpClient({ ...config, ...http }),
          ),
        ),
      ),
    ),
  );

// What connecting does, with the first sync awaited instead of forked.
const addAndSync = (input: Parameters<typeof addCalendarSource>[0]) =>
  addCalendarSource(input).pipe(Effect.tap(syncCalendarSource));

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
  feedEtag: null as string | null,
  foreignAuth: [] as string[],
  // RFC 6578: a token is a position in `changeLog`; off unless a test opts in.
  syncSupport: false,
  changeLog: [] as string[],
  syncPageSize: Infinity,
  reports: [] as string[],
  // Held requests to /held.ics wait for this; /feed.ics requests are reported.
  heldFeed: Promise.resolve(),
  onFeedRequest: () => {},
};

const putEvent = (href: string, event: FakeEvent) => {
  davState.events.set(href, event);
  davState.changeLog.push(href);
};
const deleteEvent = (href: string) => {
  davState.events.delete(href);
  davState.changeLog.push(href);
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
      if (url.pathname === "/held.ics") {
        await davState.heldFeed;
        return new Response(davState.feed, {
          headers: { "content-type": "text/calendar" },
        });
      }
      if (url.pathname === "/feed.ics") {
        davState.onFeedRequest();
        if (
          davState.feedEtag &&
          request.headers.get("if-none-match") === davState.feedEtag
        ) {
          return new Response(null, { status: 304 });
        }
        return new Response(davState.feed, {
          headers: {
            "content-type": "text/calendar",
            ...(davState.feedEtag ? { etag: davState.feedEtag } : {}),
          },
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
            "<C:calendar-home-set><D:href>/dav/calendars/me/</D:href></C:calendar-home-set><C:calendar-user-address-set><D:href>mailto:Me@Example.com</D:href><D:href>/dav/principals/me/</D:href></C:calendar-user-address-set>",
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
            `<D:resourcetype><D:collection/><C:calendar/></D:resourcetype><D:displayname>Work</D:displayname><A:calendar-color>#FF8800FF</A:calendar-color><C:supported-calendar-component-set><C:comp name="VEVENT"/></C:supported-calendar-component-set>${davState.syncSupport ? `<D:sync-token>v${davState.changeLog.length}</D:sync-token>` : ""}`,
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
        if (body.includes("sync-collection")) {
          davState.reports.push("sync");
          const from = Number(/<d:sync-token>v(\d+)</.exec(body)?.[1] ?? NaN);
          if (!davState.syncSupport || !(from <= davState.changeLog.length)) {
            return new Response(
              '<?xml version="1.0"?><D:error xmlns:D="DAV:"><D:valid-sync-token/></D:error>',
              { status: 403 },
            );
          }
          const to = Math.min(
            davState.changeLog.length,
            from + davState.syncPageSize,
          );
          const hrefs = [...new Set(davState.changeLog.slice(from, to))];
          return multistatus([
            ...hrefs.map((href) => {
              const event = davState.events.get(href);
              return event
                ? response(href, `<D:getetag>${event.etag}</D:getetag>`)
                : `<D:response><D:href>${href}</D:href><D:status>HTTP/1.1 404 Not Found</D:status></D:response>`;
            }),
            ...(to < davState.changeLog.length
              ? [
                  "<D:response><D:href>/dav/calendars/me/work/</D:href><D:status>HTTP/1.1 507 Insufficient Storage</D:status></D:response>",
                ]
              : []),
            `<D:sync-token>v${to}</D:sync-token>`,
          ]);
        }
        if (body.includes("calendar-multiget")) {
          davState.reports.push("multiget");
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
        davState.reports.push("listing");
        const start =
          /time-range start="(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z"/.exec(
            body,
          );
        const fromMs = start
          ? Date.UTC(
              Number(start[1]),
              Number(start[2]) - 1,
              Number(start[3]),
              Number(start[4]),
              Number(start[5]),
              Number(start[6]),
            )
          : -Infinity;
        return multistatus(
          [...davState.events]
            .filter(
              ([, event]) =>
                (externalEventSeriesBounds(event.ics)?.seriesEnd ?? 0) >=
                fromMs,
            )
            .map(([href, event]) =>
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
  const userDb = new DB(new BptreeInmemDriver());
  execSync(userDb.loadTables([spacesTable]));
  syncDispatch(
    userDb,
    createAction()({
      name: "insertSpaceForTest",
      args: {},
      handler: function* () {
        yield* upsert(spacesTable, [
          {
            id: "space-1",
            type: spacesTableType,
            name: "Space",
            createdAt: "",
            updatedAt: "",
          },
        ]);
      },
    })({}),
  );
  spyOn(databases, "getHyperDB").mockImplementation(
    async (dbConfig) =>
      ({
        db: dbConfig.dbType === "user" ? userDb : spaceDb,
        dbConfig,
        nextClock: Object.assign(() => "", { observe: () => {} }),
        clientId: "server",
      }) as never,
  );
  return { mainDB, spaceDb, userDb };
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
  setSystemTime();
  davState.events.clear();
  davState.multigetHrefs = [];
  davState.foreignAuth = [];
  davState.feedEtag = null;
  davState.syncSupport = false;
  davState.changeLog = [];
  davState.syncPageSize = Infinity;
  davState.reports = [];
  davState.heldFeed = Promise.resolve();
  davState.onFeedRequest = () => {};
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

    const id = await run(
      mainDB,
      addAndSync({
        userId: "user",
        spaceId: "space-1",
        kind: "caldav",
        secret: { url: `${baseUrl}/`, username: "me", password: "secret" },
      }),
    );

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
    await run(mainDB, syncCalendarSource(id));

    expect(davState.multigetHrefs).toEqual([["/dav/calendars/me/work/a.ics"]]);
    const updated = selectSync(spaceDb, { selector: allEvents, args: {} });
    expect(updated).toHaveLength(1);
    expect(updated[0]).toMatchObject({ etag: '"2"' });
    expect(updated[0]!.ics).toContain("Planning moved");

    davState.multigetHrefs = [];
    await run(mainDB, syncCalendarSource(id));
    expect(davState.multigetHrefs).toEqual([]);

    const workKey = `${baseUrl}/dav/calendars/me/work/`;
    await run(mainDB, setCalendarEnabled(source(mainDB, id), workKey, false));
    expect(selectSync(spaceDb, { selector: allCalendars, args: {} })).toEqual(
      [],
    );
    expect(selectSync(spaceDb, { selector: allEvents, args: {} })).toEqual([]);

    await run(mainDB, setCalendarEnabled(source(mainDB, id), workKey, true));
    expect(selectSync(spaceDb, { selector: allEvents, args: {} })).toHaveLength(
      1,
    );

    await run(mainDB, removeCalendarSource(source(mainDB, id)));
    expect(
      selectSync(mainDB, { selector: calendarSourceById, args: { id } }),
    ).toBeUndefined();
    expect(selectSync(spaceDb, { selector: allEvents, args: {} })).toEqual([]);
    expect(selectSync(spaceDb, { selector: allCalendars, args: {} })).toEqual(
      [],
    );
  });

  test("reconnecting an account keeps its source, event ids and unticked calendars", async () => {
    const { mainDB, spaceDb } = setup();
    davState.events.set("/dav/calendars/me/work/a.ics", {
      etag: '"1"',
      ics: ics("a", "A", "20991110T100000Z"),
    });
    const connect = () =>
      run(
        mainDB,
        addAndSync({
          userId: "user",
          spaceId: "space-1",
          kind: "caldav",
          secret: { url: `${baseUrl}/`, username: "me", password: "secret" },
        }),
      );
    const id = await connect();
    const eventIds = () =>
      selectSync(spaceDb, { selector: allEvents, args: {} }).map((e) => e.id);
    const [eventId] = eventIds();

    replaceSecret(mainDB, id, "revoked");
    await run(mainDB, syncCalendarSource(id));
    expect(source(mainDB, id).status).toBe("error");

    expect(await connect()).toBe(id);
    expect(source(mainDB, id).status).toBe("ok");
    expect(eventIds()).toEqual([eventId]);

    const workKey = `${baseUrl}/dav/calendars/me/work/`;
    await run(mainDB, setCalendarSyncWindow(source(mainDB, id), "all"));
    await run(mainDB, setCalendarEnabled(source(mainDB, id), workKey, false));
    await connect();
    expect(JSON.parse(source(mainDB, id).disabledCalendarKeys)).toEqual([
      workKey,
    ]);
    expect(source(mainDB, id).syncWindow).toBe("all");
    expect(eventIds()).toEqual([]);
  });

  test("follows changes through sync-collection", async () => {
    const { mainDB, spaceDb } = setup();
    davState.syncSupport = true;
    const href = (name: string) => `/dav/calendars/me/work/${name}.ics`;
    putEvent(href("a"), {
      etag: '"1"',
      ics: ics("a", "A", "20991110T100000Z"),
    });
    putEvent(href("b"), {
      etag: '"1"',
      ics: ics("b", "B", "20991111T100000Z"),
    });

    const id = await run(
      mainDB,
      addAndSync({
        userId: "user",
        spaceId: "space-1",
        kind: "caldav",
        secret: { url: `${baseUrl}/`, username: "me", password: "secret" },
      }),
    );
    expect(davState.reports).toEqual(["listing", "multiget"]);
    expect(
      selectSync(spaceDb, { selector: allCalendars, args: {} }),
    ).toMatchObject([{ ownerEmails: JSON.stringify(["me@example.com"]) }]);
    const summaries = () =>
      selectSync(spaceDb, { selector: allEvents, args: {} })
        .map((e) => /SUMMARY:(.*)/.exec(e.ics)?.[1])
        .sort();

    const sync = async () => {
      davState.reports = [];
      davState.multigetHrefs = [];
      await run(mainDB, syncCalendarSource(id));
      expect(source(mainDB, id).status).toBe("ok");
    };

    await sync();
    expect(davState.reports).toEqual([]);

    putEvent(href("a"), {
      etag: '"2"',
      ics: ics("a", "A2", "20991110T100000Z"),
    });
    deleteEvent(href("b"));
    await sync();
    expect(davState.reports).toEqual(["sync", "multiget"]);
    expect(davState.multigetHrefs).toEqual([[href("a")]]);
    expect(summaries()).toEqual(["A2"]);

    davState.syncPageSize = 1;
    putEvent(href("c"), {
      etag: '"1"',
      ics: ics("c", "C", "20991112T100000Z"),
    });
    putEvent(href("d"), {
      etag: '"1"',
      ics: ics("d", "D", "20991113T100000Z"),
    });
    await sync();
    expect(davState.reports).toEqual(["sync", "sync", "multiget"]);
    expect(summaries()).toEqual(["A2", "C", "D"]);

    // A server that forgot its history refuses the token.
    davState.syncPageSize = Infinity;
    davState.changeLog = [];
    deleteEvent(href("d"));
    await sync();
    expect(davState.reports).toEqual(["sync", "listing"]);
    expect(summaries()).toEqual(["A2", "C"]);

    await sync();
    expect(davState.reports).toEqual([]);
  });

  test("keeps both of two calendar toggles made at once", async () => {
    const { mainDB } = setup();
    const id = await run(
      mainDB,
      addAndSync({
        userId: "user",
        spaceId: "space-1",
        kind: "caldav",
        secret: { url: `${baseUrl}/`, username: "me", password: "secret" },
      }),
    );
    const snapshot = source(mainDB, id);
    await Promise.all([
      run(mainDB, setCalendarEnabled(snapshot, "first", false)),
      run(mainDB, setCalendarEnabled(snapshot, "second", false)),
    ]);
    expect(
      (JSON.parse(source(mainDB, id).disabledCalendarKeys) as string[]).sort(),
    ).toEqual(["first", "second"]);
  });

  test("a sync queued while removing a source writes nothing", async () => {
    const { mainDB, spaceDb } = setup();
    davState.events.set("/dav/calendars/me/work/a.ics", {
      etag: '"1"',
      ics: ics("a", "A", "20991110T100000Z"),
    });
    const id = await run(
      mainDB,
      addAndSync({
        userId: "user",
        spaceId: "space-1",
        kind: "caldav",
        secret: { url: `${baseUrl}/`, username: "me", password: "secret" },
      }),
    );

    const running = run(mainDB, syncCalendarSource(id));
    const removal = run(mainDB, removeCalendarSource(source(mainDB, id)));
    const queued = run(mainDB, syncCalendarSource(id));
    await Promise.all([running, removal, queued]);

    expect(selectSync(spaceDb, { selector: allEvents, args: {} })).toEqual([]);
    expect(selectSync(spaceDb, { selector: allCalendars, args: {} })).toEqual(
      [],
    );
  });

  test("a source whose space was deleted removes itself on its next sync", async () => {
    const { mainDB, userDb } = setup();
    const id = await run(
      mainDB,
      addAndSync({
        userId: "user",
        spaceId: "space-1",
        kind: "caldav",
        secret: { url: `${baseUrl}/`, username: "me", password: "secret" },
      }),
    );
    syncDispatch(userDb, deleteSpace({ id: "space-1" }));

    await run(mainDB, syncCalendarSource(id));
    expect(
      selectSync(mainDB, { selector: calendarSourceById, args: { id } }),
    ).toBeUndefined();
  });

  test("rejects wrong credentials before saving the source", async () => {
    const { mainDB } = setup();
    await expect(
      run(
        mainDB,
        addAndSync({
          userId: "user",
          spaceId: "space-1",
          kind: "caldav",
          secret: { url: `${baseUrl}/`, username: "me", password: "wrong" },
        }),
      ),
    ).rejects.toThrow("rejected the username or password");
  });

  test("records a failing source and retries it on the next interval", async () => {
    const { mainDB } = setup();
    const id = await run(
      mainDB,
      addAndSync({
        userId: "user",
        spaceId: "space-1",
        kind: "caldav",
        secret: { url: `${baseUrl}/`, username: "me", password: "secret" },
      }),
    );
    replaceSecret(mainDB, id, "old");

    const before = Date.now();
    await run(mainDB, syncCalendarSource(id));
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
    const error = await run(
      mainDB,
      addAndSync({
        userId: "user",
        spaceId: "space-1",
        kind: "caldav",
        secret: {
          url: `${baseUrl}/hijacked/`,
          username: "me",
          password: "secret",
        },
      }),
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CalendarFetchError);
    expect(davState.foreignAuth).toEqual(["none"]);
  });

  test("hides an unticked calendar even when the server fails", async () => {
    const { mainDB, spaceDb } = setup();
    davState.events.set("/dav/calendars/me/work/a.ics", {
      etag: '"1"',
      ics: ics("a", "A", "20991110T100000Z"),
    });
    const id = await run(
      mainDB,
      addAndSync({
        userId: "user",
        spaceId: "space-1",
        kind: "caldav",
        secret: { url: `${baseUrl}/`, username: "me", password: "secret" },
      }),
    );
    expect(selectSync(spaceDb, { selector: allEvents, args: {} })).toHaveLength(
      1,
    );

    replaceSecret(mainDB, id, "revoked");
    await run(
      mainDB,
      setCalendarEnabled(
        source(mainDB, id),
        `${baseUrl}/dav/calendars/me/work/`,
        false,
      ),
    );
    expect(source(mainDB, id).status).toBe("error");
    expect(selectSync(spaceDb, { selector: allEvents, args: {} })).toEqual([]);
    expect(selectSync(spaceDb, { selector: allCalendars, args: {} })).toEqual(
      [],
    );
  });

  test("splits a multiget answered too large and drops only an oversized event", async () => {
    const { mainDB, spaceDb } = setup();
    const href = (name: string) => `/dav/calendars/me/work/${name}.ics`;
    for (const name of ["a", "b", "c", "d"]) {
      davState.events.set(href(name), {
        etag: '"1"',
        ics: ics(name, name.repeat(600), "20991110T100000Z"),
      });
    }
    davState.events.set(href("huge"), {
      etag: '"1"',
      ics: ics("huge", "h".repeat(5000), "20991110T100000Z"),
    });
    const id = await run(
      mainDB,
      addAndSync({
        userId: "user",
        spaceId: "space-1",
        kind: "caldav",
        secret: { url: `${baseUrl}/`, username: "me", password: "secret" },
      }),
      { maxBytes: 4000 },
    );
    expect(source(mainDB, id).status).toBe("ok");
    expect(
      selectSync(spaceDb, { selector: allEvents, args: {} })
        .map((e) => e.resource)
        .sort(),
    ).toEqual([href("a"), href("b"), href("c"), href("d")]);
  });

  test("drops an event whose update can no longer be stored", async () => {
    const { mainDB, spaceDb } = setup();
    davState.events.set("/dav/calendars/me/work/a.ics", {
      etag: '"1"',
      ics: ics("a", "A", "20991110T100000Z"),
    });
    const id = await run(
      mainDB,
      addAndSync({
        userId: "user",
        spaceId: "space-1",
        kind: "caldav",
        secret: { url: `${baseUrl}/`, username: "me", password: "secret" },
      }),
    );

    davState.events.set("/dav/calendars/me/work/a.ics", {
      etag: '"2"',
      ics: ics("a", "A".repeat(300 * 1024), "20991110T100000Z"),
    });
    await run(mainDB, syncCalendarSource(id));
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

    const id = await run(
      mainDB,
      addAndSync({
        userId: "user",
        spaceId: "space-1",
        kind: "ics",
        secret: { url: `${baseUrl}/feed.ics` },
      }),
    );

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

  test("skips a feed the server reports unchanged", async () => {
    const { mainDB, spaceDb } = setup();
    davState.feed = ics("a", "A", "20991110T100000Z");
    davState.feedEtag = '"1"';
    const id = await run(
      mainDB,
      addAndSync({
        userId: "user",
        spaceId: "space-1",
        kind: "ics",
        secret: { url: `${baseUrl}/feed.ics` },
      }),
    );
    const summary = () =>
      selectSync(spaceDb, { selector: allEvents, args: {} }).map(
        (e) => /SUMMARY:(.*)/.exec(e.ics)?.[1],
      );
    expect(summary()).toEqual(["A"]);

    // Same ETag: the body is not read again.
    davState.feed = ics("a", "A2", "20991110T100000Z");
    await run(mainDB, syncCalendarSource(id));
    expect(source(mainDB, id).status).toBe("ok");
    expect(summary()).toEqual(["A"]);

    davState.feedEtag = '"2"';
    await run(mainDB, syncCalendarSource(id));
    expect(summary()).toEqual(["A2"]);
  });

  test("rejects an address that is not a calendar", async () => {
    const { mainDB } = setup();
    davState.feed = "<html>nope</html>";
    await expect(
      run(
        mainDB,
        addAndSync({
          userId: "user",
          spaceId: "space-1",
          kind: "ics",
          secret: { url: `${baseUrl}/feed.ics` },
        }),
      ),
    ).rejects.toThrow("did not return an iCalendar feed");
  });
});

describe("sync window", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const utc = (ms: number) =>
    new Date(ms)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const resources = (spaceDb: SubscribableDB) =>
    selectSync(spaceDb, { selector: allEvents, args: {} })
      .map((e) => e.resource)
      .sort();

  test("mirrors only as far back as the source's window", async () => {
    const { mainDB, spaceDb } = setup();
    davState.syncSupport = true;
    const href = (name: string) => `/dav/calendars/me/work/${name}.ics`;
    putEvent(href("soon"), {
      etag: '"1"',
      ics: ics("soon", "Soon", "20991110T100000Z"),
    });
    putEvent(href("old"), {
      etag: '"1"',
      ics: ics("old", "Long ago", "20100101T100000Z"),
    });
    putEvent(href("recent"), {
      etag: '"1"',
      ics: ics("recent", "Recent", utc(Date.now() - 20 * DAY)),
    });

    const id = await run(
      mainDB,
      addAndSync({
        userId: "user",
        spaceId: "space-1",
        kind: "caldav",
        secret: { url: `${baseUrl}/`, username: "me", password: "secret" },
      }),
    );
    expect(resources(spaceDb)).toEqual([href("recent"), href("soon")]);

    // Widening re-lists even though the calendar's token has not moved.
    await run(mainDB, setCalendarSyncWindow(source(mainDB, id), "all"));
    expect(resources(spaceDb)).toEqual([
      href("old"),
      href("recent"),
      href("soon"),
    ]);

    await run(mainDB, setCalendarSyncWindow(source(mainDB, id), "1-month"));
    expect(resources(spaceDb)).toEqual([href("recent"), href("soon")]);

    // An event that ages out of the window goes without a full listing.
    setSystemTime(new Date(Date.now() + 15 * DAY));
    davState.reports = [];
    await run(mainDB, syncCalendarSource(id));
    expect(davState.reports).toEqual([]);
    expect(resources(spaceDb)).toEqual([href("soon")]);
  });

  test("drops an aged-out event from a feed the server reports unchanged", async () => {
    const { mainDB, spaceDb } = setup();
    davState.feed = vcalendar(
      vevent("soon", "Soon", "20991110T100000Z"),
      vevent("recent", "Recent", utc(Date.now() - 20 * DAY)),
    );
    davState.feedEtag = '"1"';
    const id = await run(
      mainDB,
      addAndSync({
        userId: "user",
        spaceId: "space-1",
        kind: "ics",
        secret: { url: `${baseUrl}/feed.ics` },
      }),
    );
    expect(resources(spaceDb)).toEqual(["recent", "soon"]);

    setSystemTime(new Date(Date.now() + 15 * DAY));
    await run(mainDB, syncCalendarSource(id));
    expect(source(mainDB, id).status).toBe("ok");
    expect(resources(spaceDb)).toEqual(["soon"]);
  });

  test("re-reads an unchanged feed when the window widens", async () => {
    const { mainDB, spaceDb } = setup();
    davState.feed = vcalendar(
      vevent("soon", "Soon", "20991110T100000Z"),
      vevent("old", "Long ago", "20100101T100000Z"),
    );
    davState.feedEtag = '"1"';
    const id = await run(
      mainDB,
      addAndSync({
        userId: "user",
        spaceId: "space-1",
        kind: "ics",
        secret: { url: `${baseUrl}/feed.ics` },
      }),
    );
    expect(resources(spaceDb)).toEqual(["soon"]);

    await run(mainDB, setCalendarSyncWindow(source(mainDB, id), "all"));
    expect(resources(spaceDb)).toEqual(["old", "soon"]);
  });
});

describe("syncDueCalendarSources", () => {
  test("syncs due sources of loaded spaces only", async () => {
    const { mainDB, spaceDb } = setup();
    davState.feed = ics("a", "A", "20991110T100000Z");
    const id = await run(
      mainDB,
      addAndSync({
        userId: "user",
        spaceId: "space-1",
        kind: "ics",
        secret: { url: `${baseUrl}/feed.ics` },
      }),
    );
    davState.feed = vcalendar(
      vevent("a", "A", "20991110T100000Z"),
      vevent("b", "B", "20991111T100000Z"),
    );
    const due = source(mainDB, id).nextSyncAt;

    spyOn(databases, "getLoadedHyperDBs").mockReturnValue([]);
    await run(mainDB, syncDueCalendarSources(due));
    expect(selectSync(spaceDb, { selector: allEvents, args: {} })).toHaveLength(
      1,
    );

    spyOn(databases, "getLoadedHyperDBs").mockReturnValue([
      { database: "space-space-1", dbType: "space", db: spaceDb },
    ]);
    await run(mainDB, syncDueCalendarSources(due - 1));
    expect(selectSync(spaceDb, { selector: allEvents, args: {} })).toHaveLength(
      1,
    );

    await run(mainDB, syncDueCalendarSources(due));
    expect(selectSync(spaceDb, { selector: allEvents, args: {} })).toHaveLength(
      2,
    );
  });

  test("a slow source does not hold up the others", async () => {
    const { mainDB, spaceDb } = setup();
    davState.feed = ics("a", "A", "20991110T100000Z");
    const connect = (path: string) =>
      run(
        mainDB,
        addAndSync({
          userId: "user",
          spaceId: "space-1",
          kind: "ics",
          secret: { url: `${baseUrl}${path}` },
        }),
      );
    await connect("/held.ics");
    await connect("/feed.ics");
    spyOn(databases, "getLoadedHyperDBs").mockReturnValue([
      { database: "space-space-1", dbType: "space", db: spaceDb },
    ]);

    let release = () => {};
    davState.heldFeed = new Promise((resolve) => {
      release = resolve;
    });
    const feedRequested = new Promise<void>((resolve) => {
      davState.onFeedRequest = resolve;
    });
    const pass = run(mainDB, syncDueCalendarSources(Infinity));
    await feedRequested;
    release();
    await pass;
  });
});

describe("guarded calendar HTTP", () => {
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

  const send = (
    url: string,
    options: CalendarHttpOptions,
    authorization?: string,
  ) =>
    Effect.runPromise(
      sendCalendarRequest(HttpClientRequest.get(url), authorization).pipe(
        Effect.flatMap(responseText),
        Effect.provideService(
          HttpClient.HttpClient,
          guardedHttpClient(options),
        ),
      ),
    );

  test("refuses private hosts unless allowed", async () => {
    const blocked = { allowPrivateNetworks: false };
    await expect(send(`${baseUrl}/big`, blocked)).rejects.toThrow(
      "private network address",
    );
    await expect(
      send(`http://[::ffff:127.0.0.1]:${server.port}/big`, blocked),
    ).rejects.toThrow("private network address");
    // Resolved names are checked by the lookup the connection itself uses.
    await expect(
      send(`http://localhost:${server.port}/big`, blocked),
    ).rejects.toThrow("private network address");
    await expect(
      send("file:///etc/passwd", { allowPrivateNetworks: true }),
    ).rejects.toBeInstanceOf(CalendarFetchError);
  });

  test("caps the response size", async () => {
    await expect(
      send(`${baseUrl}/big`, { allowPrivateNetworks: true, maxBytes: 1024 }),
    ).rejects.toThrow("too large");
  });

  test("fails a response cut off mid-body without waiting for the timeout", async () => {
    const dropping = createServer((socket) => {
      socket.once("data", () => {
        socket.write("HTTP/1.1 200 OK\r\ncontent-length: 100\r\n\r\npartial");
        socket.destroy();
      });
    });
    await new Promise<void>((resolve) =>
      dropping.listen(0, "127.0.0.1", resolve),
    );
    const { port } = dropping.address() as AddressInfo;
    try {
      await expect(
        send(`http://127.0.0.1:${port}/`, { allowPrivateNetworks: true }),
      ).rejects.toThrow("Lost the connection");
    } finally {
      dropping.close();
    }
  });

  test("drops credentials when redirected to another site", async () => {
    expect(
      await send(
        `${baseUrl}/redirect-elsewhere`,
        { allowPrivateNetworks: true },
        "Basic abc",
      ),
    ).toBe("none");
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
