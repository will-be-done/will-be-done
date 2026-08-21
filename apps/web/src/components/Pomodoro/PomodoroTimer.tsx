import { useEffect, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import {
  filledFocusDots,
  FOCUS_ROUNDS_UNTIL_LONG_BREAK,
  formatMmSs,
  modeLabel,
  progress,
  remainingMs,
  type PomodoroMode,
} from "./pomodoro";
import { usePomodoroStore } from "./pomodoroStore";

const MODES: PomodoroMode[] = ["focus", "shortBreak", "longBreak"];
const RING_SIZE = 288;
const RING_STROKE = 9;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function playCompleteChime() {
  const AudioContextCtor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextCtor) return;

  const ctx = new AudioContextCtor();
  const now = ctx.currentTime;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(880, now);
  oscillator.frequency.setValueAtTime(660, now + 0.12);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.4);
  oscillator.onended = () => void ctx.close();
}

export const PomodoroTimer = ({
  currentTaskTitle,
}: {
  currentTaskTitle?: string;
}) => {
  const durations = usePomodoroStore((s) => s.durations);
  const session = usePomodoroStore((s) => s.session);
  const setDuration = usePomodoroStore((s) => s.setDuration);
  const setMode = usePomodoroStore((s) => s.setMode);
  const start = usePomodoroStore((s) => s.start);
  const pause = usePomodoroStore((s) => s.pause);
  const reset = usePomodoroStore((s) => s.reset);
  const complete = usePomodoroStore((s) => s.complete);
  const notes = usePomodoroStore((s) => s.notes);
  const setNotes = usePomodoroStore((s) => s.setNotes);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (session.status !== "running") return;
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [session.status]);

  const remaining = remainingMs(session, durations, now);
  const ratio = progress(session, durations, now);
  const filledDots = filledFocusDots(session);
  const isRunning = session.status === "running";

  useEffect(() => {
    if (session.status === "running" && remaining === 0) {
      complete();
      playCompleteChime();
    }
  }, [complete, remaining, session.status]);

  useEffect(() => {
    if (session.status === "idle") {
      document.title = "Will Be Done";
      return;
    }
    document.title = `${formatMmSs(remaining)} · ${modeLabel[session.mode]}`;
  }, [remaining, session.mode, session.status]);

  useEffect(() => {
    return () => {
      document.title = "Will Be Done";
    };
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col items-stretch justify-start gap-8 overflow-hidden px-6 py-8">
      <div className="flex flex-col items-center gap-8">
        <div className="flex rounded-full bg-panel-2 p-1">
          {MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setMode(mode)}
              className={cn(
                "cursor-pointer rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                session.mode === mode
                  ? "bg-accent text-white"
                  : "text-content-tinted hover:text-content",
              )}
            >
              {modeLabel[mode]}
            </button>
          ))}
        </div>

        <div className="relative" style={{ width: RING_SIZE, height: RING_SIZE }}>
          <svg
            width={RING_SIZE}
            height={RING_SIZE}
            viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
            className="-rotate-90"
            aria-hidden
          >
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              fill="none"
              className="stroke-ring"
              strokeWidth={RING_STROKE}
            />
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              fill="none"
              className="stroke-accent"
              strokeWidth={RING_STROKE}
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={RING_CIRCUMFERENCE * (1 - ratio)}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-6xl font-semibold tabular-nums tracking-tight text-content">
              {formatMmSs(remaining)}
            </div>
            <div className="mt-1 text-sm text-content-tinted">
              {modeLabel[session.mode]}
            </div>
          </div>
        </div>

        {currentTaskTitle ? (
          <div className="max-w-full truncate rounded-full bg-panel px-4 py-1.5 text-sm text-content-tinted ring-1 ring-border">
            {currentTaskTitle}
          </div>
        ) : (
          <div className="text-sm text-content-tinted/70">
            Select a task to focus on
          </div>
        )}

        <div className="flex items-center gap-2">
          {Array.from({ length: FOCUS_ROUNDS_UNTIL_LONG_BREAK }, (_, i) => (
            <span
              key={i}
              className={cn(
                "size-2.5 rounded-full",
                i < filledDots ? "bg-accent" : "bg-ring",
              )}
            />
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Reset timer"
            onClick={reset}
            className="flex size-10 cursor-pointer items-center justify-center rounded-full text-content-tinted ring-1 ring-border hover:bg-overlay hover:text-content"
          >
            <RotateCcw className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => (isRunning ? pause() : start())}
            className="flex h-12 min-w-32 cursor-pointer items-center justify-center gap-2 rounded-full bg-accent px-6 text-sm font-semibold text-white hover:bg-accent-hover"
          >
            {isRunning ? (
              <>
                <Pause className="size-4" />
                Pause
              </>
            ) : (
              <>
                <Play className="size-4" />
                Start
              </>
            )}
          </button>
        </div>
      </div>

      <div className="grid w-full grid-cols-3 gap-4">
        {MODES.map((mode) => (
          <label key={mode} className="flex flex-col gap-1.5">
            <span className="text-xs text-content-tinted">
              {modeLabel[mode]}
            </span>
            <input
              type="number"
              min={1}
              max={120}
              value={durations[mode]}
              onChange={(e) => setDuration(mode, Number(e.target.value))}
              className="w-full rounded-md border border-ring bg-panel px-3 py-2 text-base tabular-nums text-content outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/40"
              aria-label={`${modeLabel[mode]} minutes`}
            />
          </label>
        ))}
      </div>

      <label className="flex min-h-0 w-full flex-1 flex-col gap-1.5">
        <span className="text-xs text-content-tinted">Notes</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Write notes for this session"
          className="min-h-32 w-full flex-1 resize-none rounded-md border border-ring bg-panel px-3 py-2 text-base leading-6 text-content outline-none placeholder:text-content-tinted/50 focus:border-accent/60 focus:ring-2 focus:ring-accent/40"
        />
      </label>
    </div>
  );
};
