import { describe, expect, it, vi } from "vitest";
import {
  formatDuration,
  formatTaskTime,
  parseDuration,
  parseTaskTime,
} from "./taskTime";

describe("parseDuration", () => {
  it.each([
    ["90", 90],
    ["45m", 45],
    ["45 min", 45],
    ["45 minutes", 45],
    ["2h", 120],
    ["2 hours", 120],
    ["1.5h", 90],
    ["1,5h", 90],
    ["1h 30m", 90],
    ["1h30", 90],
    ["1H30M", 90],
    ["1:30", 90],
    [" 20m ", 20],
  ])("parses %j as %i minutes", (input, minutes) => {
    expect(parseDuration(input)).toBe(minutes);
  });

  it.each(["", "abc", "0", "0m", "1:75", "h", "-5", "200h"])(
    "rejects %j",
    (input) => {
      expect(parseDuration(input)).toBeNull();
    },
  );

  it("parses its own formatted output", () => {
    for (const minutes of [5, 60, 95, 600]) {
      expect(parseDuration(formatDuration(minutes))).toBe(minutes);
    }
  });
});

describe("parseTaskTime", () => {
  it.each([
    ["930", "09:30"],
    ["0930", "09:30"],
    ["1430", "14:30"],
    ["14:30", "14:30"],
    ["9.30", "09:30"],
    ["9", "09:00"],
    ["0", "00:00"],
    ["2pm", "14:00"],
    ["2:30 pm", "14:30"],
    ["2:30 PM", "14:30"],
    ["230p", "14:30"],
    ["11 a.m.", "11:00"],
    ["12am", "00:00"],
    ["12pm", "12:00"],
    [" 23:59 ", "23:59"],
  ])("parses %j as %s", (input, time) => {
    expect(parseTaskTime(input)).toBe(time);
  });

  it.each(["", "24:00", "9:60", "13pm", "0am", "abc", "12345", "9:5"])(
    "rejects %j",
    (input) => {
      expect(parseTaskTime(input)).toBeNull();
    },
  );
});

describe("formatTaskTime", () => {
  it("keeps the stored hour and minute regardless of local time zone", () => {
    const expected = (hour: number, minute: number) =>
      new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "UTC",
      }).format(Date.UTC(2000, 0, 1, hour, minute));

    expect(formatTaskTime("00:54")).toBe(expected(0, 54));
    expect(formatTaskTime("02:30")).toBe(expected(2, 30));
    expect(formatTaskTime("23:59")).toBe(expected(23, 59));
  });

  it("shows times in a skipped DST hour as stored", () => {
    const previousTZ = process.env.TZ;
    process.env.TZ = "America/New_York";
    // 2026-03-08 is spring-forward day there; 02:00-02:59 does not exist.
    vi.useFakeTimers({ now: new Date("2026-03-08T12:00:00Z") });
    try {
      expect(formatTaskTime("02:30")).toBe(
        new Intl.DateTimeFormat(undefined, {
          hour: "numeric",
          minute: "2-digit",
          timeZone: "UTC",
        }).format(Date.UTC(2000, 0, 1, 2, 30)),
      );
    } finally {
      vi.useRealTimers();
      process.env.TZ = previousTZ;
    }
  });
});
