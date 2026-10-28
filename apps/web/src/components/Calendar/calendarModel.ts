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

export const calendarViews = ["day", "week", "month", "plan"] as const;
export type CalendarView = (typeof calendarViews)[number];

const weekOptions = { weekStartsOn: 1 } as const;
const planDays = 14;

export const minutesInDay = 24 * 60;
export const snapMinutes = 15;
// Timed tasks without a duration still need a visible block.
export const defaultBlockMinutes = 30;

// One appearance of a Task on a calendar day. Projected events are template
// occurrences that will be generated later; they are not real Tasks yet.
export type CalendarEvent = {
  key: string;
  taskId: string;
  focusKey: string;
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
  const range = isSameYear(first, last)
    ? `${format(first, "MMM d")} – ${format(last, "MMM d")}`
    : `${format(first, "MMM d yyyy")} – ${format(last, "MMM d yyyy")}`;
  if (view === "week") return `${range}, ${format(last, "yyyy")}`;

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

export type BlockLayout = { column: number; columns: number };

// Places overlapping timed events side by side. Events that transitively
// overlap form a cluster sharing one column count.
export function layoutTimedEvents(
  events: CalendarEvent[],
): Map<string, BlockLayout> {
  const items = events
    .filter((e) => e.time !== null)
    .map((e) => {
      const start = timeToMinutes(e.time!);
      return {
        key: e.key,
        start,
        end: Math.min(minutesInDay, start + blockMinutes(e)),
      };
    })
    .sort((a, b) => a.start - b.start || b.end - a.end);

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
