import { describe, expect, it } from "vitest";
import {
  canonicalizeHlc,
  compareHlc,
  createHlcClock,
  formatHlc,
  nextHlc,
  parseHlc,
} from "./hlc";

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

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

  it.each([
    ["ahead", TWO_HOURS_MS],
    ["behind", -TWO_HOURS_MS],
  ])("calibrates a wall clock that is two hours %s", (_direction, drift) => {
    const serverTimeMs = 1_700_000_000_000;
    let monotonicTimeMs = 10;
    const clock = createHlcClock("client", null, {
      wallTime: () => serverTimeMs + drift,
      monotonicTime: () => monotonicTimeMs,
    });

    clock.calibrate(serverTimeMs);
    monotonicTimeMs += 25;

    expect(parseHlc(clock())).toEqual({
      physical: serverTimeMs + 25,
      logical: 0,
      actorId: "client",
    });
  });

  it("uses monotonic elapsed time after wall-clock correction", () => {
    const serverTimeMs = 1_700_000_000_000;
    let wallTimeMs = serverTimeMs + TWO_HOURS_MS;
    let monotonicTimeMs = 0;
    const clock = createHlcClock("client", null, {
      wallTime: () => wallTimeMs,
      monotonicTime: () => monotonicTimeMs,
    });

    clock.calibrate(serverTimeMs);
    monotonicTimeMs = 10;
    const beforeCorrection = clock();
    wallTimeMs = serverTimeMs;
    monotonicTimeMs = 20;
    const afterCorrection = clock();

    expect(parseHlc(afterCorrection).physical).toBe(serverTimeMs + 20);
    expect(compareHlc(afterCorrection, beforeCorrection)).toBeGreaterThan(0);
  });

  it("continues after a persisted high-water mark on restart", () => {
    const serverTimeMs = 1_700_000_000_000;
    let monotonicTimeMs = 0;
    const first = createHlcClock("first", null, {
      wallTime: () => serverTimeMs,
      monotonicTime: () => monotonicTimeMs,
    });
    first.calibrate(serverTimeMs);
    monotonicTimeMs = 10;
    const persisted = first();

    const restarted = createHlcClock("restarted", persisted, {
      wallTime: () => serverTimeMs - TWO_HOURS_MS,
      monotonicTime: () => 0,
    });

    expect(compareHlc(restarted(), persisted)).toBeGreaterThan(0);
  });

  it("orders disconnected edits by calibrated elapsed server time", () => {
    const serverTimeMs = 1_700_000_000_000;
    let firstElapsedMs = 100;
    let secondElapsedMs = 200;
    const first = createHlcClock("ahead-client", null, {
      wallTime: () => serverTimeMs + TWO_HOURS_MS,
      monotonicTime: () => firstElapsedMs,
    });
    const second = createHlcClock("behind-client", null, {
      wallTime: () => serverTimeMs - TWO_HOURS_MS,
      monotonicTime: () => secondElapsedMs,
    });
    first.calibrate(serverTimeMs);
    second.calibrate(serverTimeMs);
    firstElapsedMs += 100;
    secondElapsedMs += 200;

    expect(compareHlc(second(), first())).toBeGreaterThan(0);
  });
});
