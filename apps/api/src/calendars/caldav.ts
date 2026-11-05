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
type DavResponse = { href: string; props: DavProps };

const MULTIGET_BATCH = 100;

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

export function parseMultistatus(xml: string): DavResponse[] {
  const doc = parser.parse(xml) as {
    multistatus?: { response?: Record<string, unknown>[] };
  };
  return (doc.multistatus?.response ?? []).flatMap((response) => {
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
    return [{ href: decodeURIComponentSafe(href), props }];
  });
}

const decodeURIComponentSafe = (href: string) => {
  try {
    return decodeURI(href);
  } catch {
    return href;
  }
};

const hrefOf = (value: unknown) => {
  if (value && typeof value === "object" && "href" in value) {
    return text((value as { href: unknown }).href);
  }
  return null;
};

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
    return { responses: parseMultistatus(response.body), url: response.url };
  }

  private propfind(url: string, depth: "0" | "1", props: string) {
    return this.request(
      "PROPFIND",
      url,
      depth,
      `<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/"><d:prop>${props}</d:prop></d:propfind>`,
    );
  }

  private async findCalendarHome(): Promise<string> {
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
          "<d:current-user-principal/><c:calendar-home-set/><d:resourcetype/>",
        );
        const props = responses[0]?.props ?? {};
        if (isCalendar(props)) return url;
        const home = hrefOf(props["calendar-home-set"]);
        if (home) return new URL(home, url).href;
        const principal = hrefOf(props["current-user-principal"]);
        if (!principal) continue;
        const principalUrl = new URL(principal, url).href;
        const found = await this.propfind(
          principalUrl,
          "0",
          "<c:calendar-home-set/>",
        );
        const principalHome = hrefOf(
          found.responses[0]?.props["calendar-home-set"],
        );
        if (principalHome) return new URL(principalHome, found.url).href;
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

  async discoverCalendars(): Promise<DiscoveredCalendar[]> {
    const home = await this.findCalendarHome();
    const { responses, url } = await this.propfind(
      home,
      "1",
      "<d:resourcetype/><d:displayname/><a:calendar-color/><c:supported-calendar-component-set/>",
    );
    return responses
      .filter(({ props }) => isCalendar(props) && supportsEvents(props))
      .map(({ href, props }) => {
        const key = new URL(href, url).href;
        return {
          key,
          name: text(props.displayname)?.trim() || calendarNameFromUrl(key),
          color: normalizeColor(text(props["calendar-color"])),
        };
      });
  }

  // ETags of every event resource with an occurrence after `fromMs`.
  async listEventEtags(
    calendarUrl: string,
    fromMs: number,
  ): Promise<Map<string, string>> {
    const start = new Date(fromMs)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
    const { responses } = await this.request(
      "REPORT",
      calendarUrl,
      "1",
      `<?xml version="1.0" encoding="utf-8"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${start}"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`,
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
