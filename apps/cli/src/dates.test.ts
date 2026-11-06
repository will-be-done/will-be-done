import { describe, expect, test } from "bun:test";
import { addDays, humanDate, parseDate } from "./dates.ts";

describe("parseDate", () => {
  test.each([
    ["today", "2026-11-06"],
    ["Tomorrow", "2026-11-07"],
    ["2026-12-31", "2026-12-31"],
    ["2028-02-29", "2028-02-29"],
    ["2026-02-30", undefined],
    ["2026-13-01", undefined],
    ["next week", undefined],
  ])("%s", (input, expected) => {
    expect(parseDate(input, "2026-11-06")).toBe(expected);
  });
});

test("addDays crosses month and year boundaries", () => {
  expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
});

test("humanDate", () => {
  expect(humanDate("2026-11-06", "2026-11-06")).toBe("Today");
  expect(humanDate("2026-11-07", "2026-11-06")).toBe("Tomorrow");
  expect(humanDate("2026-11-03", "2026-11-06")).toBe("Nov 3");
});
