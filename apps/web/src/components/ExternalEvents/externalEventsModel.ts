import { addDays, startOfDay } from "date-fns";
import {
  getDMY,
  type ExternalEventOccurrence,
} from "@will-be-done/slices/space";

const minutesInDay = 24 * 60;

// An external event occurrence as it appears on one local day.
export type DayExternalEvent = {
  key: string;
  occurrence: ExternalEventOccurrence;
  // All-day events, and timed ones covering the whole day.
  allDay: boolean;
  // Minutes from local midnight, clipped to the day.
  startMinutes: number;
  endMinutes: number;
};

const minutesOf = (ms: number) => {
  const date = new Date(ms);
  return date.getHours() * 60 + date.getMinutes();
};

// Groups occurrences by local "yyyy-MM-dd"; multi-day events appear on each
// day they touch. All-day events come first, then timed ones by start.
export function externalEventsByDay(
  occurrences: ExternalEventOccurrence[],
  days: Date[],
): Map<string, DayExternalEvent[]> {
  const result = new Map<string, DayExternalEvent[]>();
  for (const day of days) {
    const dayStart = startOfDay(day).getTime();
    const dayEnd = startOfDay(addDays(day, 1)).getTime();
    const date = getDMY(day);
    const events: DayExternalEvent[] = [];
    for (const occurrence of occurrences) {
      const { startMs, endMs } = occurrence;
      const touches =
        startMs < dayEnd &&
        (endMs > dayStart || (endMs === startMs && startMs >= dayStart));
      if (!touches) continue;
      const allDay =
        occurrence.allDay || (startMs <= dayStart && endMs >= dayEnd);
      events.push({
        key: `${occurrence.key}:${date}`,
        occurrence,
        allDay,
        startMinutes: allDay || startMs <= dayStart ? 0 : minutesOf(startMs),
        endMinutes: allDay || endMs >= dayEnd ? minutesInDay : minutesOf(endMs),
      });
    }
    events.sort(
      (a, b) =>
        Number(b.allDay) - Number(a.allDay) ||
        a.startMinutes - b.startMinutes ||
        b.endMinutes - a.endMinutes,
    );
    result.set(date, events);
  }
  return result;
}

const clockFormat = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

export const formatEventStart = (event: DayExternalEvent) =>
  clockFormat.format(event.occurrence.startMs);

export const formatEventTime = (event: DayExternalEvent) =>
  event.allDay
    ? "All day"
    : `${clockFormat.format(event.occurrence.startMs)} – ${clockFormat.format(
        event.occurrence.endMs,
      )}`;

export const eventTooltip = (event: DayExternalEvent) =>
  [
    event.occurrence.title || "Untitled event",
    formatEventTime(event),
    event.occurrence.location,
    event.occurrence.calendarName,
  ]
    .filter(Boolean)
    .join("\n");

const fallbackColor = "rgb(148 163 184)";

export const externalEventClass =
  "select-none rounded-md border-l-[3px] bg-white/[0.04] text-left text-content-tinted cursor-default";

export const externalEventStyle = (event: DayExternalEvent) => ({
  borderLeftColor: event.occurrence.color ?? fallbackColor,
});
