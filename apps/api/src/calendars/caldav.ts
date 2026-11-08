import { XMLParser } from "fast-xml-parser";
import {
  CalendarFetchError,
  guardedFetch,
  type GuardedFetchOptions,
  mayShareCredentials,
} from "./guardedFetch";
import type { DiscoveredCalendar } from "./tables";

export type CalDavAccount = {
  url: string;
  username: string;
  password: string;
};

type DavProps = Record<string, unknown>;
type DavResponse = { href: string; status: string | null; props: DavProps };

const MULTIGET_BATCH = 100;
// Each round of a truncated (507) sync-collection report continues the last.
const MAX_SYNC_ROUNDS = 50;

export type DiscoveredCollection = DiscoveredCalendar & {
  // RFC 6578 collection version; null when the server has no sync support.
  syncToken: string | null;
};

const parser = new XMLParser({
  removeNSPrefix: true,
  ignoreAttributes: false,
  parseTagValue: false,
  htmlEntities: true,
  isArray: (name) => ["response", "propstat", "comp", "href"].includes(name),
});

const text = (value: unknown): string | null => {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return text(value[0]);
  if (value && typeof value === "object" && "#text" in value) {
    return String((value as { "#text": unknown })["#text"]);
  }
  return null;
};

const escapeXml = (value: string) =>
  value.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);

export function parseMultistatus(xml: string): {
  responses: DavResponse[];
  syncToken: string | null;
} {
  const doc = parser.parse(xml) as {
    multistatus?: {
      response?: Record<string, unknown>[];
      "sync-token"?: unknown;
    };
  };
  const responses = (doc.multistatus?.response ?? []).flatMap((response) => {
    const href = text(response.href);
    if (!href) return [];
    const props: DavProps = {};
    for (const propstat of (response.propstat ?? []) as {
      status?: unknown;
      prop?: DavProps;
    }[]) {
      if (!/\s2\d\d\s/.test(` ${text(propstat.status) ?? ""} `)) continue;
      Object.assign(props, propstat.prop ?? {});
    }
    return [
      {
        href: decodeURIComponentSafe(href),
        status: text(response.status),
        props,
      },
    ];
  });
  return { responses, syncToken: text(doc.multistatus?.["sync-token"]) };
}

const hasStatus = (status: string | null, code: number) =>
  status !== null && ` ${status} `.includes(` ${code} `);

const samePath = (a: string, b: string) =>
  a.replace(/\/+$/, "") === b.replace(/\/+$/, "");

const decodeURIComponentSafe = (href: string) => {
  try {
    return decodeURI(href);
  } catch {
    return href;
  }
};

const hrefsOf = (value: unknown): string[] => {
  if (value && typeof value === "object" && "href" in value) {
    const hrefs = (value as { href: unknown }).href;
    return (Array.isArray(hrefs) ? hrefs : [hrefs]).flatMap(
      (href) => text(href) ?? [],
    );
  }
  return [];
};

const hrefOf = (value: unknown) => hrefsOf(value)[0] ?? null;

// The account's own addresses, to find its replies to invitations.
const ownerEmailsOf = (props: DavProps) =>
  hrefsOf(props["calendar-user-address-set"]).flatMap((href) => {
    const match = /^mailto:(.+)$/i.exec(href.trim());
    return match ? [match[1]!.toLowerCase()] : [];
  });

export class CalDavClient {
  private readonly authorization: string;

  constructor(
    private readonly account: CalDavAccount,
    private readonly fetchOptions: GuardedFetchOptions,
  ) {
    this.authorization = `Basic ${Buffer.from(
      `${account.username}:${account.password}`,
    ).toString("base64")}`;
  }

  private async request(
    method: string,
    url: string,
    depth: "0" | "1",
    body: string,
  ) {
    // Discovery follows server-provided links; only those near the account
    // URL get the password.
    const trusted = mayShareCredentials(
      new URL(this.account.url),
      new URL(url),
    );
    const response = await guardedFetch(
      url,
      {
        method,
        headers: { depth, "content-type": "application/xml; charset=utf-8" },
        body,
        ...(trusted ? { authorization: this.authorization } : {}),
      },
      this.fetchOptions,
    );
    if (response.status === 401 || response.status === 403) {
      throw new CalendarFetchError(
        "The server rejected the username or password",
        response.status,
      );
    }
    if (response.status !== 207) {
      throw new CalendarFetchError(
        `${method} ${new URL(url).pathname} failed with HTTP ${response.status}`,
        response.status,
      );
    }
    return { ...parseMultistatus(response.body), url: response.url };
  }

  private propfind(url: string, depth: "0" | "1", props: string) {
    return this.request(
      "PROPFIND",
      url,
      depth,
      `<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/"><d:prop>${props}</d:prop></d:propfind>`,
    );
  }

  private async findCalendarHome(): Promise<{
    home: string;
    ownerEmails: string[];
  }> {
    const candidates = [
      this.account.url,
      new URL("/.well-known/caldav", this.account.url).href,
    ];
    let lastError: unknown = null;
    for (const candidate of candidates) {
      try {
        const { responses, url } = await this.propfind(
          candidate,
          "0",
          "<d:current-user-principal/><c:calendar-home-set/><c:calendar-user-address-set/><d:resourcetype/>",
        );
        const props = responses[0]?.props ?? {};
        if (isCalendar(props)) return { home: url, ownerEmails: [] };
        const home = hrefOf(props["calendar-home-set"]);
        if (home) {
          return {
            home: new URL(home, url).href,
            ownerEmails: ownerEmailsOf(props),
          };
        }
        const principal = hrefOf(props["current-user-principal"]);
        if (!principal) continue;
        const principalUrl = new URL(principal, url).href;
        const found = await this.propfind(
          principalUrl,
          "0",
          "<c:calendar-home-set/><c:calendar-user-address-set/>",
        );
        const principalProps = found.responses[0]?.props ?? {};
        const principalHome = hrefOf(principalProps["calendar-home-set"]);
        if (principalHome) {
          return {
            home: new URL(principalHome, found.url).href,
            ownerEmails: ownerEmailsOf(principalProps),
          };
        }
      } catch (error) {
        if (error instanceof CalendarFetchError && error.status === 401) {
          throw error;
        }
        lastError = error;
      }
    }
    if (lastError instanceof Error) throw lastError;
    throw new CalendarFetchError("No CalDAV calendars found at this address");
  }

  async discoverCalendars(): Promise<{
    calendars: DiscoveredCollection[];
    ownerEmails: string[];
  }> {
    const { home, ownerEmails } = await this.findCalendarHome();
    const { responses, url } = await this.propfind(
      home,
      "1",
      "<d:resourcetype/><d:displayname/><a:calendar-color/><c:supported-calendar-component-set/><d:sync-token/>",
    );
    const calendars = responses
      .filter(({ props }) => isCalendar(props) && supportsEvents(props))
      .map(({ href, props }) => {
        const key = new URL(href, url).href;
        return {
          key,
          name: text(props.displayname)?.trim() || calendarNameFromUrl(key),
          color: normalizeColor(text(props["calendar-color"])),
          syncToken: text(props["sync-token"]),
        };
      });
    const username = this.account.username.trim().toLowerCase();
    if (ownerEmails.length === 0 && username.includes("@")) {
      ownerEmails.push(username);
    }
    return { calendars, ownerEmails };
  }

  // Resources changed since `syncToken` (RFC 6578), mapped to their new ETag,
  // or to null when deleted. Throws CalendarFetchError with the HTTP status
  // when the server refuses the token.
  async changesSince(
    calendarUrl: string,
    syncToken: string,
  ): Promise<{ changes: Map<string, string | null>; syncToken: string }> {
    const calendarPath = new URL(calendarUrl).pathname;
    const changes = new Map<string, string | null>();
    let token = syncToken;
    for (let round = 0; round < MAX_SYNC_ROUNDS; round += 1) {
      const result = await this.request(
        "REPORT",
        calendarUrl,
        "0",
        `<?xml version="1.0" encoding="utf-8"?><d:sync-collection xmlns:d="DAV:"><d:sync-token>${escapeXml(token)}</d:sync-token><d:sync-level>1</d:sync-level><d:prop><d:getetag/></d:prop></d:sync-collection>`,
      );
      if (!result.syncToken) {
        throw new CalendarFetchError("The server sent no sync token");
      }
      token = result.syncToken;
      let truncated = false;
      for (const { href, status, props } of result.responses) {
        const path = new URL(href, calendarUrl).pathname;
        if (samePath(path, calendarPath)) {
          truncated ||= hasStatus(status, 507);
          continue;
        }
        changes.set(
          path,
          hasStatus(status, 404) ? null : (text(props.getetag) ?? ""),
        );
      }
      if (!truncated) return { changes, syncToken: token };
    }
    throw new CalendarFetchError("The calendar has too many changes to sync");
  }

  // ETags of every event resource with an occurrence after `fromMs`, or of
  // every event resource when it is null.
  async listEventEtags(
    calendarUrl: string,
    fromMs: number | null,
  ): Promise<Map<string, string>> {
    const timeRange =
      fromMs === null
        ? ""
        : `<c:time-range start="${new Date(fromMs)
            .toISOString()
            .replace(/[-:]/g, "")
            .replace(/\.\d{3}/, "")}"/>`;
    const { responses } = await this.request(
      "REPORT",
      calendarUrl,
      "1",
      `<?xml version="1.0" encoding="utf-8"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT">${timeRange}</c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`,
    );
    const calendarPath = new URL(calendarUrl).pathname;
    const etags = new Map<string, string>();
    for (const { href, props } of responses) {
      const path = new URL(href, calendarUrl).pathname;
      const etag = text(props.getetag);
      if (path === calendarPath || !etag) continue;
      etags.set(path, etag);
    }
    return etags;
  }

  async fetchEvents(
    calendarUrl: string,
    paths: string[],
  ): Promise<{ resource: string; etag: string; ics: string }[]> {
    const result: { resource: string; etag: string; ics: string }[] = [];
    for (let i = 0; i < paths.length; i += MULTIGET_BATCH) {
      const hrefs = paths
        .slice(i, i + MULTIGET_BATCH)
        .map((path) => `<d:href>${escapeXml(path)}</d:href>`)
        .join("");
      const { responses } = await this.request(
        "REPORT",
        calendarUrl,
        "1",
        `<?xml version="1.0" encoding="utf-8"?><c:calendar-multiget xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data/></d:prop>${hrefs}</c:calendar-multiget>`,
      );
      for (const { href, props } of responses) {
        const etag = text(props.getetag);
        const ics = text(props["calendar-data"]);
        if (!etag || !ics) continue;
        result.push({
          resource: new URL(href, calendarUrl).pathname,
          etag,
          ics,
        });
      }
    }
    return result;
  }
}

const isCalendar = (props: DavProps) => {
  const type = props.resourcetype;
  return !!type && typeof type === "object" && "calendar" in type;
};

const supportsEvents = (props: DavProps) => {
  const set = props["supported-calendar-component-set"] as
    | { comp?: { "@_name"?: string }[] }
    | undefined;
  if (!set?.comp) return true;
  return set.comp.some((comp) => comp["@_name"]?.toUpperCase() === "VEVENT");
};

const calendarNameFromUrl = (url: string) =>
  decodeURIComponentSafe(
    new URL(url).pathname.split("/").filter(Boolean).at(-1) ?? "Calendar",
  );

// Apple sends #RRGGBBAA; CSS accepts it, but keep the common #RRGGBB form.
export const normalizeColor = (color: string | null) => {
  const match = color?.trim().match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
  return match ? `#${match[1]!.toLowerCase()}` : null;
};
