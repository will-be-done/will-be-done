import { describe, expect, it } from "vitest";
import type { ExternalEventOccurrence } from "@will-be-done/slices/space";
import { externalEventsByDay } from "./externalEventsModel";

const occurrence = (
  key: string,
  start: Date,
  end: Date,
  allDay = false,
): ExternalEventOccurrence => ({
  key,
  eventId: key,
  recurrenceKey: "",
  calendarId: "calendar",
  calendarName: "Work",
  color: null,
  title: key,
  location: null,
  allDay,
  startMs: start.getTime(),
  endMs: end.getTime(),
  status: "confirmed",
  free: false,
  response: null,
});

const days = [new Date(2026, 10, 10), new Date(2026, 10, 11)];

const summary = (map: ReturnType<typeof externalEventsByDay>) =>
  Object.fromEntries(
    [...map].map(([date, events]) => [
      date,
      events.map((e) => [
        e.occurrence.key,
        e.allDay,
        e.startMinutes,
        e.endMinutes,
      ]),
    ]),
  );

describe("externalEventsByDay", () => {
  it("splits events across the local days they touch", () => {
    const byDay = externalEventsByDay(
      [
        occurrence(
          "standup",
          new Date(2026, 10, 10, 9, 0),
          new Date(2026, 10, 10, 9, 30),
        ),
        // Ends exactly at midnight: not on the next day.
        occurrence(
          "evening",
          new Date(2026, 10, 10, 22, 0),
          new Date(2026, 10, 11, 0, 0),
        ),
        occurrence(
          "overnight",
          new Date(2026, 10, 10, 23, 0),
          new Date(2026, 10, 11, 1, 30),
        ),
        occurrence(
          "trip",
          new Date(2026, 10, 10),
          new Date(2026, 10, 12),
          true,
        ),
        // Covers the whole first day without being all-day.
        occurrence(
          "conference",
          new Date(2026, 10, 9, 18, 0),
          new Date(2026, 10, 11, 12, 0),
        ),
      ],
      days,
    );

    expect(summary(byDay)).toEqual({
      "2026-11-10": [
        ["trip", true, 0, 1440],
        ["conference", true, 0, 1440],
        ["standup", false, 540, 570],
        ["evening", false, 1320, 1440],
        ["overnight", false, 1380, 1440],
      ],
      "2026-11-11": [
        ["trip", true, 0, 1440],
        ["conference", false, 0, 720],
        ["overnight", false, 0, 90],
      ],
    });
  });
});
