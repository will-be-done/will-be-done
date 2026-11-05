import { createHash } from "node:crypto";
import ICAL from "ical.js";
import { externalEventSeriesBounds } from "@will-be-done/slices/space";

// One event row must fit comfortably in a 1 MiB sync chunk.
export const MAX_EVENT_ICS_BYTES = 256 * 1024;

const TIME_PROPERTIES = [
  "dtstart",
  "dtend",
  "exdate",
  "rdate",
  "recurrence-id",
];

const newCalendar = () => {
  const calendar = new ICAL.Component("vcalendar");
  calendar.addPropertyWithValue("version", "2.0");
  calendar.addPropertyWithValue("prodid", "-//Will Be Done//Calendar//EN");
  return calendar;
};

const referencedTzids = (events: ICAL.Component[]) => {
  const tzids = new Set<string>();
  for (const event of events) {
    for (const name of TIME_PROPERTIES) {
      for (const prop of event.getAllProperties(name)) {
        const tzid = prop.getParameter("tzid");
        if (typeof tzid === "string") tzids.add(tzid);
      }
    }
  }
  return tzids;
};

const withTimezones = (
  events: ICAL.Component[],
  timezones: ICAL.Component[],
) => {
  const calendar = newCalendar();
  const tzids = referencedTzids(events);
  for (const timezone of timezones) {
    if (tzids.has(String(timezone.getFirstPropertyValue("tzid")))) {
      calendar.addSubcomponent(timezone);
    }
  }
  for (const event of events) {
    event.removeAllProperties("attach");
    calendar.addSubcomponent(event);
  }
  return calendar.toString();
};

export type FeedCalendar = {
  name: string | null;
  color: string | null;
  events: { uid: string; ics: string }[];
};

// Splits a subscription feed into one VCALENDAR per event UID.
export function splitIcsFeed(text: string): FeedCalendar {
  const root = new ICAL.Component(ICAL.parse(text));
  const calendar =
    root.name === "vcalendar"
      ? root
      : (root.getFirstSubcomponent("vcalendar") ?? root);
  const timezones = calendar.getAllSubcomponents("vtimezone");
  const byUid = new Map<string, ICAL.Component[]>();
  for (const event of calendar.getAllSubcomponents("vevent")) {
    const uid =
      String(event.getFirstPropertyValue("uid") ?? "") ||
      createHash("sha1").update(event.toString()).digest("hex");
    byUid.set(uid, [...(byUid.get(uid) ?? []), event]);
  }

  return {
    name: stringProperty(calendar, "x-wr-calname"),
    color: stringProperty(calendar, "x-apple-calendar-color"),
    events: [...byUid].map(([uid, events]) => ({
      uid,
      ics: withTimezones(events, timezones),
    })),
  };
}

const stringProperty = (component: ICAL.Component, name: string) => {
  const value = component.getFirstPropertyValue(name);
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

// Readies one CalDAV resource for storage: drops attachments, enforces the
// size cap and computes bounds. Null when it should not be stored.
export function prepareEventIcs(ics: string, notBeforeMs: number) {
  let normalized = ics;
  if (/^ATTACH[;:]/im.test(ics)) {
    try {
      const root = new ICAL.Component(ICAL.parse(ics));
      for (const event of root.getAllSubcomponents("vevent")) {
        event.removeAllProperties("attach");
      }
      normalized = root.toString();
    } catch {
      return null;
    }
  }
  if (Buffer.byteLength(normalized) > MAX_EVENT_ICS_BYTES) return null;
  const bounds = externalEventSeriesBounds(normalized);
  if (!bounds || bounds.seriesEnd < notBeforeMs) return null;
  return { ics: normalized, ...bounds };
}
