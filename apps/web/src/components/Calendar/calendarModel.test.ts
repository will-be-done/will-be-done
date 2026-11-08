import { describe, expect, it } from "vitest";
import { format } from "date-fns";
import type { FocusKey } from "@/store/focusSlice.ts";
import {
  adjacentTime,
  type CalendarDirection,
  type CalendarEvent,
  type CalendarView,
  calendarNeighbor,
  calendarTitle,
  layoutSpans,
  shiftAnchor,
  shownDayEvents,
  sortDayEvents,
  timedEventSpan,
  visibleDates,
} from "./calendarModel";

const event = (
  key: string,
  time: string | null,
  durationMinutes: number | null = null,
  isDone = false,
): CalendarEvent => ({
  key,
  taskId: key,
  focusKey: key as FocusKey,
  date: "2026-10-28",
  title: key,
  nature: undefined,
  time,
  durationMinutes,
  isDone,
  isProjected: false,
  templateId: null,
});

const dmy = (dates: Date[]) => dates.map((d) => format(d, "yyyy-MM-dd"));
const anchor = new Date(2026, 9, 28);

describe("calendar model", () => {
  it("computes the visible dates of each view", () => {
    expect(dmy(visibleDates("day", anchor))).toEqual(["2026-10-28"]);
    expect(dmy(visibleDates("week", anchor))).toEqual([
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
    ]);
    const month = dmy(visibleDates("month", anchor));
    expect(month).toHaveLength(35);
    expect(month[0]).toBe("2026-09-28");
    expect(month.at(-1)).toBe("2026-11-01");
    const plan = dmy(visibleDates("plan", anchor));
    expect(plan).toHaveLength(14);
    expect(plan.at(-1)).toBe("2026-11-10");
  });

  it("navigates by the view's period", () => {
    expect(format(shiftAnchor("day", anchor, 1), "yyyy-MM-dd")).toBe(
      "2026-10-29",
    );
    expect(format(shiftAnchor("month", anchor, -1), "yyyy-MM-dd")).toBe(
      "2026-09-28",
    );
    expect(format(shiftAnchor("plan", anchor, 1), "yyyy-MM-dd")).toBe(
      "2026-11-04",
    );
  });

  it("titles the plan view relative to today", () => {
    expect(calendarTitle("plan", anchor, anchor)).toBe(
      "Next 14 days · Oct 28 – Nov 10",
    );
    expect(calendarTitle("month", anchor, anchor)).toBe("October 2026");
  });

  it("titles weeks with the year once, or both years across a boundary", () => {
    expect(calendarTitle("week", anchor, anchor)).toBe("Oct 26 – Nov 1, 2026");
    const newYearsEve = new Date(2026, 11, 31);
    expect(calendarTitle("week", newYearsEve, newYearsEve)).toBe(
      "Dec 28 2026 – Jan 3 2027",
    );
  });

  it("sorts timed before untimed and done last", () => {
    const sorted = sortDayEvents([
      event("untimed-1", null),
      event("done", "08:00", null, true),
      event("late", "14:00"),
      event("early", "09:00"),
      event("untimed-2", null),
    ]);
    expect(sorted.map((e) => e.key)).toEqual([
      "early",
      "late",
      "untimed-1",
      "untimed-2",
      "done",
    ]);
  });

  it("lays out overlapping events side by side", () => {
    const layout = layoutSpans([
      ...[
        event("a", "09:00", 60),
        event("b", "09:30", 60),
        event("c", "10:00", 30),
        event("d", "12:00", 30),
        event("e", "14:00", 15),
        event("f", "14:15", 15),
      ].map(timedEventSpan),
      // An external event shares columns with the tasks it overlaps.
      { key: "meeting", start: 16 * 60, end: 17 * 60 },
      timedEventSpan(event("g", "16:30", 60)),
    ]);
    expect(Object.fromEntries(layout)).toEqual({
      a: { column: 0, columns: 2 },
      b: { column: 1, columns: 2 },
      // a ends at 10:00, so c reuses its column.
      c: { column: 0, columns: 2 },
      d: { column: 0, columns: 1 },
      // e is drawn taller than 15 minutes, so f sits beside it.
      e: { column: 0, columns: 2 },
      f: { column: 1, columns: 2 },
      meeting: { column: 0, columns: 2 },
      g: { column: 1, columns: 2 },
    });
  });

  it("lists a day's events as each view shows them", () => {
    const day = sortDayEvents([
      event("untimed", null),
      event("a", "09:00"),
      event("b", "10:00"),
      event("c", "11:00"),
    ]);
    const keys = (view: CalendarView) =>
      shownDayEvents(view, day).map((e) => e.key);
    expect(keys("week")).toEqual(["untimed", "a", "b", "c"]);
    // Two chips and "+2 more".
    expect(keys("month")).toEqual(["a", "b"]);
    // An external event takes the first chip.
    expect(shownDayEvents("month", day, 1).map((e) => e.key)).toEqual(["a"]);
    expect(keys("plan")).toEqual(["a", "b", "c", "untimed"]);

    // The time grid draws done tasks at their time, and a longer block
    // takes the left column.
    const grid = sortDayEvents([
      event("done-8", "08:00", null, true),
      event("todo-10", "10:00"),
      event("short-9", "09:00", 15),
      event("long-9", "09:00", 60),
    ]);
    expect(shownDayEvents("week", grid).map((e) => e.key)).toEqual([
      "done-8",
      "long-9",
      "short-9",
      "todo-10",
    ]);
  });

  it("moves focus between calendar events", () => {
    const days = (count: number, filled: Record<number, CalendarEvent[]>) =>
      Array.from({ length: count }, (_, i) => filled[i] ?? []);
    const next = (
      view: CalendarView,
      grid: CalendarEvent[][],
      key: string,
      direction: CalendarDirection,
    ) => calendarNeighbor(view, grid, key, direction)?.key;

    const week = days(7, {
      0: [event("mon-allday", null), event("mon-9", "09:00")],
      3: [event("thu-allday", null), event("thu-8", "08:00")],
      4: [event("fri-14", "14:00"), event("fri-20", "20:00")],
    });
    expect(next("week", week, "mon-allday", "down")).toBe("mon-9");
    expect(next("week", week, "mon-9", "down")).toBeUndefined();
    // Skips empty days and keeps to the all-day row or the nearest time.
    expect(next("week", week, "mon-allday", "right")).toBe("thu-allday");
    expect(next("week", week, "mon-9", "right")).toBe("thu-8");
    expect(next("week", week, "thu-8", "right")).toBe("fri-14");
    expect(next("week", week, "fri-20", "left")).toBe("thu-8");
    expect(next("week", week, "fri-20", "right")).toBeUndefined();

    const month = days(35, {
      2: [event("a1", null), event("a2", null)],
      16: [event("b1", null), event("b2", null)],
      17: [event("c1", null)],
    });
    // Off the end of a cell, up and down go a week at a time.
    expect(next("month", month, "a2", "down")).toBe("b1");
    expect(next("month", month, "b1", "up")).toBe("a2");
    expect(next("month", month, "b2", "down")).toBeUndefined();
    expect(next("month", month, "b2", "right")).toBe("c1");
    expect(next("month", month, "a1", "left")).toBeUndefined();
  });

  it("times a task added after or before an event", () => {
    expect(adjacentTime(event("a", "09:00", 45), "after")).toBe("09:45");
    // No duration draws a 30 minute block.
    expect(adjacentTime(event("a", "09:00"), "after")).toBe("09:30");
    expect(adjacentTime(event("a", "09:00", 45), "before")).toBe("08:30");
    expect(adjacentTime(event("a", "00:10"), "before")).toBe("00:00");
    expect(adjacentTime(event("a", "23:30", 60), "after")).toBe("23:45");
    expect(adjacentTime(event("a", null), "after")).toBeNull();
  });
});
