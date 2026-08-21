export type PomodoroMode = "focus" | "shortBreak" | "longBreak";

export type PomodoroDurations = {
  focus: number;
  shortBreak: number;
  longBreak: number;
};

export type PomodoroStatus = "idle" | "running" | "paused";

export type PomodoroSession = {
  mode: PomodoroMode;
  status: PomodoroStatus;
  startedAt: number | null;
  elapsedMs: number;
  completedFocusCount: number;
};

export const defaultDurations: PomodoroDurations = {
  focus: 25,
  shortBreak: 5,
  longBreak: 15,
};

export const idleSession = (): PomodoroSession => ({
  mode: "focus",
  status: "idle",
  startedAt: null,
  elapsedMs: 0,
  completedFocusCount: 0,
});

export const FOCUS_ROUNDS_UNTIL_LONG_BREAK = 4;
export const MIN_MINUTES = 1;
export const MAX_MINUTES = 120;

export const modeLabel: Record<PomodoroMode, string> = {
  focus: "Focus",
  shortBreak: "Short break",
  longBreak: "Long break",
};

export function clampMinutes(value: number): number {
  if (!Number.isFinite(value)) return MIN_MINUTES;
  return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Math.round(value)));
}

export function durationMs(
  mode: PomodoroMode,
  durations: PomodoroDurations,
): number {
  return clampMinutes(durations[mode]) * 60 * 1000;
}

export function remainingMs(
  session: PomodoroSession,
  durations: PomodoroDurations,
  now: number,
): number {
  const runningElapsed =
    session.status === "running" && session.startedAt != null
      ? Math.max(0, now - session.startedAt)
      : 0;
  return Math.max(
    0,
    durationMs(session.mode, durations) - session.elapsedMs - runningElapsed,
  );
}

export function progress(
  session: PomodoroSession,
  durations: PomodoroDurations,
  now: number,
): number {
  const total = durationMs(session.mode, durations);
  if (total <= 0) return 1;
  return 1 - remainingMs(session, durations, now) / total;
}

export function formatMmSs(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function nextMode(
  mode: PomodoroMode,
  completedFocusCount: number,
): PomodoroMode {
  if (mode !== "focus") return "focus";
  return completedFocusCount % FOCUS_ROUNDS_UNTIL_LONG_BREAK === 0
    ? "longBreak"
    : "shortBreak";
}

export function filledFocusDots(session: PomodoroSession): number {
  const roundInCycle =
    session.completedFocusCount % FOCUS_ROUNDS_UNTIL_LONG_BREAK;
  if (
    session.mode === "longBreak" &&
    roundInCycle === 0 &&
    session.completedFocusCount > 0
  ) {
    return FOCUS_ROUNDS_UNTIL_LONG_BREAK;
  }
  return roundInCycle;
}

export function startSession(
  session: PomodoroSession,
  now: number,
): PomodoroSession {
  if (session.status === "running") return session;
  return { ...session, status: "running", startedAt: now };
}

export function pauseSession(
  session: PomodoroSession,
  now: number,
): PomodoroSession {
  if (session.status !== "running" || session.startedAt == null) {
    return { ...session, status: "paused", startedAt: null };
  }
  return {
    ...session,
    status: "paused",
    startedAt: null,
    elapsedMs: session.elapsedMs + Math.max(0, now - session.startedAt),
  };
}

export function resetSession(session: PomodoroSession): PomodoroSession {
  return {
    ...session,
    status: "idle",
    startedAt: null,
    elapsedMs: 0,
  };
}

export function switchMode(
  session: PomodoroSession,
  mode: PomodoroMode,
): PomodoroSession {
  return {
    ...session,
    mode,
    status: "idle",
    startedAt: null,
    elapsedMs: 0,
  };
}

export function completeSession(session: PomodoroSession): PomodoroSession {
  const completedFocusCount =
    session.mode === "focus"
      ? session.completedFocusCount + 1
      : session.completedFocusCount;
  return {
    mode: nextMode(session.mode, completedFocusCount),
    status: "idle",
    startedAt: null,
    elapsedMs: 0,
    completedFocusCount,
  };
}
