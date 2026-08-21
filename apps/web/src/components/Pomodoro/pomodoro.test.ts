import { describe, expect, it } from "vitest";
import {
  clampMinutes,
  completeSession,
  defaultDurations,
  durationMs,
  filledFocusDots,
  formatMmSs,
  idleSession,
  nextMode,
  pauseSession,
  progress,
  remainingMs,
  resetSession,
  startSession,
  switchMode,
} from "./pomodoro";

const durations = defaultDurations;

describe("clampMinutes", () => {
  it("keeps values in 1..120", () => {
    expect(clampMinutes(0)).toBe(1);
    expect(clampMinutes(25)).toBe(25);
    expect(clampMinutes(200)).toBe(120);
    expect(clampMinutes(Number.NaN)).toBe(1);
  });
});

describe("remainingMs", () => {
  it("returns the full duration when idle", () => {
    expect(remainingMs(idleSession(), durations, 0)).toBe(25 * 60 * 1000);
  });

  it("subtracts running time from the current mode", () => {
    const session = startSession(idleSession(), 1_000);
    expect(remainingMs(session, durations, 1_000 + 10_000)).toBe(
      25 * 60 * 1000 - 10_000,
    );
  });

  it("keeps elapsed time after a pause", () => {
    const running = startSession(idleSession(), 1_000);
    const paused = pauseSession(running, 1_000 + 5_000);
    expect(remainingMs(paused, durations, 1_000 + 60_000)).toBe(
      25 * 60 * 1000 - 5_000,
    );
  });

  it("never goes below zero", () => {
    const session = startSession(idleSession(), 0);
    expect(remainingMs(session, durations, 60 * 60 * 1000)).toBe(0);
  });
});

describe("formatMmSs", () => {
  it("ceils remaining milliseconds into mm:ss", () => {
    expect(formatMmSs(0)).toBe("0:00");
    expect(formatMmSs(1)).toBe("0:01");
    expect(formatMmSs(61_000)).toBe("1:01");
    expect(formatMmSs(25 * 60 * 1000)).toBe("25:00");
  });
});

describe("progress", () => {
  it("is 0 at the start and 1 when finished", () => {
    expect(progress(idleSession(), durations, 0)).toBe(0);
    const session = startSession(idleSession(), 0);
    expect(progress(session, durations, durationMs("focus", durations))).toBe(
      1,
    );
  });
});

describe("session transitions", () => {
  it("starts, pauses, and resets without losing the mode", () => {
    const started = startSession(idleSession(), 10);
    expect(started.status).toBe("running");
    const paused = pauseSession(started, 20);
    expect(paused.status).toBe("paused");
    expect(paused.elapsedMs).toBe(10);
    expect(resetSession(paused)).toMatchObject({
      mode: "focus",
      status: "idle",
      elapsedMs: 0,
      startedAt: null,
    });
  });

  it("switching mode clears the current countdown", () => {
    const started = startSession(idleSession(), 0);
    expect(switchMode(started, "shortBreak")).toMatchObject({
      mode: "shortBreak",
      status: "idle",
      elapsedMs: 0,
      startedAt: null,
    });
  });
});

describe("completeSession", () => {
  it("goes to a short break after a focus round", () => {
    const next = completeSession(idleSession());
    expect(next.mode).toBe("shortBreak");
    expect(next.completedFocusCount).toBe(1);
    expect(next.status).toBe("idle");
  });

  it("goes to a long break after four focus rounds", () => {
    let session = idleSession();
    for (let i = 0; i < 4; i++) {
      session = completeSession({ ...session, mode: "focus" });
    }
    expect(session.mode).toBe("longBreak");
    expect(session.completedFocusCount).toBe(4);
  });

  it("returns to focus after a break", () => {
    expect(completeSession(switchMode(idleSession(), "shortBreak")).mode).toBe(
      "focus",
    );
    expect(completeSession(switchMode(idleSession(), "longBreak")).mode).toBe(
      "focus",
    );
  });
});

describe("nextMode", () => {
  it("uses a long break only on multiples of four focus rounds", () => {
    expect(nextMode("focus", 1)).toBe("shortBreak");
    expect(nextMode("focus", 4)).toBe("longBreak");
    expect(nextMode("shortBreak", 4)).toBe("focus");
  });
});

describe("filledFocusDots", () => {
  it("fills one dot per completed focus in the current cycle", () => {
    expect(filledFocusDots({ ...idleSession(), completedFocusCount: 1 })).toBe(
      1,
    );
    expect(filledFocusDots({ ...idleSession(), completedFocusCount: 3 })).toBe(
      3,
    );
  });

  it("keeps four dots filled during the long break", () => {
    expect(
      filledFocusDots({
        ...idleSession(),
        mode: "longBreak",
        completedFocusCount: 4,
      }),
    ).toBe(4);
  });
});
