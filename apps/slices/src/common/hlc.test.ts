import { describe, expect, it } from "vitest";
import {
  canonicalizeHlc,
  compareHlc,
  formatHlc,
  nextHlc,
  parseHlc,
} from "./hlc";

describe("hybrid logical clock", () => {
  it("canonicalizes legacy timestamps without losing actor suffixes", () => {
    expect(canonicalizeHlc("100-0002-actor-with-dashes")).toBe(
      "0000000000000100-00000002-actor-with-dashes",
    );
  });

  it("orders physical, logical, and actor components", () => {
    const a = formatHlc({ physical: 100, logical: 1, actorId: "a" });
    const b = formatHlc({ physical: 100, logical: 2, actorId: "a" });
    const c = formatHlc({ physical: 100, logical: 2, actorId: "b" });
    expect(compareHlc(a, b)).toBeLessThan(0);
    expect(compareHlc(b, c)).toBeLessThan(0);
  });

  it("ticks after remote time even when the wall clock is behind", () => {
    const remote = formatHlc({ physical: 200, logical: 5, actorId: "remote" });
    const timestamp = nextHlc({
      actorId: "local",
      now: 100,
      observed: [remote],
    });
    expect(parseHlc(timestamp)).toEqual({
      physical: 200,
      logical: 6,
      actorId: "local",
    });
  });

  it("remains monotonic when wall time moves backwards", () => {
    const local = formatHlc({ physical: 200, logical: 5, actorId: "local" });
    expect(parseHlc(nextHlc({ actorId: "local", now: 100, local }))).toEqual({
      physical: 200,
      logical: 6,
      actorId: "local",
    });
  });

  it("moves physical time forward when the logical field overflows", () => {
    const local = formatHlc({
      physical: 200,
      logical: 99_999_999,
      actorId: "local",
    });
    expect(parseHlc(nextHlc({ actorId: "local", now: 100, local }))).toEqual({
      physical: 201,
      logical: 0,
      actorId: "local",
    });
  });
});
