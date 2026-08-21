import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  clampMinutes,
  completeSession,
  defaultDurations,
  idleSession,
  pauseSession,
  resetSession,
  startSession,
  switchMode,
  type PomodoroDurations,
  type PomodoroMode,
  type PomodoroSession,
} from "./pomodoro";

type PomodoroStore = {
  durations: PomodoroDurations;
  session: PomodoroSession;
  selectedTaskId: string | null;
  notes: string;
  setDuration: (mode: PomodoroMode, minutes: number) => void;
  setMode: (mode: PomodoroMode) => void;
  selectTask: (id: string | null) => void;
  setNotes: (notes: string) => void;
  start: (now?: number) => void;
  pause: (now?: number) => void;
  reset: () => void;
  complete: () => void;
};

export const usePomodoroStore = create<PomodoroStore>()(
  persist(
    (set) => ({
      durations: defaultDurations,
      session: idleSession(),
      selectedTaskId: null,
      notes: "",
      setDuration: (mode, minutes) =>
        set((state) => ({
          durations: {
            ...state.durations,
            [mode]: clampMinutes(minutes),
          },
        })),
      setMode: (mode) =>
        set((state) => ({
          session: switchMode(state.session, mode),
        })),
      selectTask: (id) => set({ selectedTaskId: id }),
      setNotes: (notes) => set({ notes }),
      start: (now = Date.now()) =>
        set((state) => ({
          session: startSession(state.session, now),
        })),
      pause: (now = Date.now()) =>
        set((state) => ({
          session: pauseSession(state.session, now),
        })),
      reset: () =>
        set((state) => ({
          session: resetSession(state.session),
        })),
      complete: () =>
        set((state) => ({
          session: completeSession(state.session),
        })),
    }),
    {
      name: "pomodoro",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        durations: state.durations,
        notes: state.notes,
      }),
    },
  ),
);
