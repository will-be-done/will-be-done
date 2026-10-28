import { describe, expect, it } from "vitest";
import { formatDuration, parseDuration, parseTaskTime } from "./taskTime";

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
