import { describe, expect, it } from "vitest";
import { getDMY, parseDMY } from "./utils";

function withTZ(tz: string, fn: () => void) {
  const original = process.env.TZ;
  process.env.TZ = tz;
  try {
    fn();
  } finally {
    if (original === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = original;
    }
  }
}

describe("getDMY / parseDMY", () => {
  it("round-trips a local date through getDMY and parseDMY across timezones", () => {
    for (const tz of [
      "UTC",
      "America/Los_Angeles",
      "America/New_York",
      "Asia/Kolkata",
      "Pacific/Kiritimati",
    ]) {
      withTZ(tz, () => {
        const original = new Date(2026, 8, 10, 15, 30); // local: Sep 10 2026, 15:30
        const dmy = getDMY(original);
        expect(dmy).toBe("2026-09-10");

        const parsed = parseDMY(dmy);
        expect(parsed.getFullYear()).toBe(2026);
        expect(parsed.getMonth()).toBe(8);
        expect(parsed.getDate()).toBe(10);
      });
    }
  });

  it("parses a yyyy-MM-dd string to local midnight of that calendar day", () => {
    withTZ("America/Los_Angeles", () => {
      const parsed = parseDMY("2026-09-10");
      expect(parsed.getFullYear()).toBe(2026);
      expect(parsed.getMonth()).toBe(8);
      expect(parsed.getDate()).toBe(10);
      expect(parsed.getHours()).toBe(0);
    });
  });

  it("regression: differs from the naive `new Date(dmyString)` conversion in timezones behind UTC", () => {
    // `new Date("2026-09-10")` parses as UTC midnight, which lands on the
    // previous local calendar day west of UTC. This is the bug parseDMY
    // exists to avoid: it must always resolve to the 10th, never the 9th.
    withTZ("America/Los_Angeles", () => {
      const dmy = "2026-09-10";

      const naive = new Date(dmy);
      expect(naive.getDate()).toBe(9);

      const parsed = parseDMY(dmy);
      expect(parsed.getDate()).toBe(10);
      expect(parsed.getDate()).not.toBe(naive.getDate());
    });
  });
});
