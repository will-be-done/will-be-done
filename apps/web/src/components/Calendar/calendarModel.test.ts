import { describe, expect, it } from "vitest";
import { format } from "date-fns";
import {
  type CalendarEvent,
  calendarTitle,
  layoutTimedEvents,
  shiftAnchor,
  sortDayEvents,
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
  focusKey: key,
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
    const layout = layoutTimedEvents([
      event("a", "09:00", 60),
      event("b", "09:30", 60),
      event("c", "10:00", 30),
      event("d", "12:00", 30),
      event("untimed", null),
    ]);
    expect(Object.fromEntries(layout)).toEqual({
      a: { column: 0, columns: 2 },
      b: { column: 1, columns: 2 },
      // a ends at 10:00, so c reuses its column.
      c: { column: 0, columns: 2 },
      d: { column: 0, columns: 1 },
    });
  });
});
