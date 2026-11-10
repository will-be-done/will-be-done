import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  isSameYear,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import type { TaskNature } from "@will-be-done/slices/space";
import type { FocusKey } from "@/store/focusSlice.ts";

export const calendarViews = ["day", "week", "month", "plan"] as const;
export type CalendarView = (typeof calendarViews)[number];

const weekOptions = { weekStartsOn: 1 } as const;
const planDays = 14;

export const minutesInDay = 24 * 60;
export const snapMinutes = 15;
// Timed tasks without a duration still need a visible block.
export const defaultBlockMinutes = 30;
// Shorter blocks are drawn this tall so a line of text fits (20px at the time
// grid's 48px hour); overlap layout uses the drawn height too.
export const minBlockMinutes = 25;

// One appearance of a Task on a calendar day. Projected events are template
// occurrences that will be generated later; they are not real Tasks yet.
export type CalendarEvent = {
  briefDescription?: string;
  projectSectionId?: string;
  key: string;
  taskId: string;
  focusKey: FocusKey;
  date: string;
  title: string;
  nature: TaskNature;
  time: string | null;
  durationMinutes: number | null;
  isDone: boolean;
  isProjected: boolean;
  // Set on projected events whose template carries a time (daily or coarser
  // rules). Moving or resizing them edits the template, i.e. every upcoming
  // occurrence.
  templateId: string | null;
};

// Projected events only move when their template has a time to edit.
export const isDraggable = (event: CalendarEvent) =>
  !event.isProjected || event.templateId !== null;

export function visibleDates(view: CalendarView, anchor: Date): Date[] {
  let from: Date;
  let to: Date;
  if (view === "day") {
    from = to = anchor;
  } else if (view === "week") {
    from = startOfWeek(anchor, weekOptions);
    to = endOfWeek(anchor, weekOptions);
  } else if (view === "month") {
    from = startOfWeek(startOfMonth(anchor), weekOptions);
    to = endOfWeek(endOfMonth(anchor), weekOptions);
  } else {
    from = anchor;
    to = addDays(anchor, planDays - 1);
  }

  return Array.from(
    { length: differenceInCalendarDays(to, from) + 1 },
    (_, i) => addDays(from, i),
  );
}

export function shiftAnchor(
  view: CalendarView,
  anchor: Date,
  direction: 1 | -1,
): Date {
  if (view === "day") return addDays(anchor, direction);
  if (view === "month") return addMonths(anchor, direction);
  return addDays(anchor, 7 * direction);
}

export function calendarTitle(
  view: CalendarView,
  anchor: Date,
  today: Date,
): string {
  if (view === "day") return format(anchor, "EEEE, MMM d yyyy");
  if (view === "month") return format(anchor, "MMMM yyyy");

  const dates = visibleDates(view, anchor);
  const first = dates[0]!;
  const last = dates[dates.length - 1]!;
  const sameYear = isSameYear(first, last);
  const range = sameYear
    ? `${format(first, "MMM d")} – ${format(last, "MMM d")}`
    : `${format(first, "MMM d yyyy")} – ${format(last, "MMM d yyyy")}`;
  if (view === "week") {
    return sameYear ? `${range}, ${format(last, "yyyy")}` : range;
  }

  const startsToday = differenceInCalendarDays(first, today) === 0;
  return `${startsToday ? "Next 14 days" : "14 days"} · ${range}`;
}

export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours! * 60 + minutes!;
}

export function minutesToTime(minutes: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

export function snapToGrid(minutes: number): number {
  return Math.round(minutes / snapMinutes) * snapMinutes;
}

export function blockMinutes(event: CalendarEvent): number {
  return event.durationMinutes ?? defaultBlockMinutes;
}

// Start time for a task added right after or before an event: after starts
// when it ends, before ends when it starts. Untimed events add untimed tasks.
export function adjacentTime(
  event: CalendarEvent,
  position: "before" | "after",
): string | null {
  if (event.time === null) return null;
  const start = timeToMinutes(event.time);
  return minutesToTime(
    position === "after"
      ? Math.min(start + blockMinutes(event), minutesInDay - snapMinutes)
      : Math.max(start - defaultBlockMinutes, 0),
  );
}

// Timed first by time, then untimed in list order; done tasks sink.
export function sortDayEvents(events: CalendarEvent[]): CalendarEvent[] {
  const rank = (e: CalendarEvent) =>
    (e.isDone ? minutesInDay * 2 : 0) +
    (e.time === null ? minutesInDay : timeToMinutes(e.time));
  return events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => rank(a.event) - rank(b.event) || a.index - b.index)
    .map(({ event }) => event);
}

export const monthChipLimit = 3;

// Chips a month cell shows out of `total`, leaving room for "+N more".
const monthSlots = (total: number) =>
  total > monthChipLimit ? monthChipLimit - 1 : total;

// External events a month cell shows; they come before its tasks.
export const shownMonthExternalCount = (
  externalCount: number,
  eventCount: number,
) => Math.min(externalCount, monthSlots(externalCount + eventCount));

// A day's events in on-screen order: the time grid shows its all-day row
// above the timed blocks, which sit at their time whether done or not, longer
// first as in layoutSpans. A full month cell cuts off before "+N more",
// after `externalCount` external events.
export function shownDayEvents(
  view: CalendarView,
  events: CalendarEvent[],
  externalCount = 0,
): CalendarEvent[] {
  if (view === "day" || view === "week") {
    const timed = events
      .filter((e) => e.time !== null)
      .sort(
        (a, b) =>
          timeToMinutes(a.time!) - timeToMinutes(b.time!) ||
          blockMinutes(b) - blockMinutes(a),
      );
    return [...events.filter((e) => e.time === null), ...timed];
  }
  if (view === "month") {
    return events.slice(
      0,
      monthSlots(events.length + externalCount) -
        shownMonthExternalCount(externalCount, events.length),
    );
  }
  return events;
}

export type CalendarDirection = "left" | "right" | "up" | "down";

// The event h/j/k/l focuses next. `days` holds each visible day's
// shownDayEvents. Up and down walk the day, and in month and plan cells go on
// to the same weekday a week away. Left and right skip empty days and land on
// the event nearest in time (time grid) or row (day cells).
export function calendarNeighbor(
  view: CalendarView,
  days: CalendarEvent[][],
  focusKey: string,
  direction: CalendarDirection,
): CalendarEvent | undefined {
  const dayIndex = days.findIndex((events) =>
    events.some((e) => e.focusKey === focusKey),
  );
  if (dayIndex === -1) return undefined;
  const events = days[dayIndex]!;
  const index = events.findIndex((e) => e.focusKey === focusKey);
  const isTimeGrid = view === "day" || view === "week";

  const scan = (
    step: number,
    pick: (day: CalendarEvent[]) => CalendarEvent,
  ) => {
    for (let i = dayIndex + step; i >= 0 && i < days.length; i += step) {
      const day = days[i]!;
      if (day.length > 0) return pick(day);
    }
    return undefined;
  };

  if (direction === "up" || direction === "down") {
    const step = direction === "up" ? -1 : 1;
    const next = events[index + step];
    if (next || isTimeGrid) return next;
    return scan(7 * step, (day) => day[step === -1 ? day.length - 1 : 0]!);
  }

  // Timed blocks sort after the all-day row, by time.
  const position = (day: CalendarEvent[], i: number) => {
    const time = day[i]!.time;
    return isTimeGrid && time !== null ? minutesInDay + timeToMinutes(time) : i;
  };
  const from = position(events, index);
  return scan(direction === "left" ? -1 : 1, (day) => {
    let best = 0;
    for (let i = 1; i < day.length; i++) {
      if (
        Math.abs(position(day, i) - from) < Math.abs(position(day, best) - from)
      ) {
        best = i;
      }
    }
    return day[best]!;
  });
}

export type BlockLayout = { column: number; columns: number };
export type TimedSpan = { key: string; start: number; end: number };

// A timed task's span as drawn, in minutes from midnight.
export const timedEventSpan = (event: CalendarEvent): TimedSpan => {
  const start = timeToMinutes(event.time!);
  return {
    key: event.key,
    start,
    end: Math.min(
      minutesInDay,
      start + Math.max(blockMinutes(event), minBlockMinutes),
    ),
  };
};

// Places overlapping spans side by side. Spans that transitively overlap form
// a cluster sharing one column count.
export function layoutSpans(spans: TimedSpan[]): Map<string, BlockLayout> {
  const items = [...spans].sort((a, b) => a.start - b.start || b.end - a.end);

  const result = new Map<string, BlockLayout>();
  let cluster: { key: string; column: number }[] = [];
  let columnEnds: number[] = [];
  let clusterEnd = -1;

  const flush = () => {
    for (const { key, column } of cluster) {
      result.set(key, { column, columns: columnEnds.length });
    }
    cluster = [];
    columnEnds = [];
  };

  for (const item of items) {
    if (item.start >= clusterEnd) flush();
    let column = columnEnds.findIndex((end) => end <= item.start);
    if (column === -1) column = columnEnds.length;
    columnEnds[column] = item.end;
    cluster.push({ key: item.key, column });
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  flush();

  return result;
}
