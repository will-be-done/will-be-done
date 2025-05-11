import { create } from "zustand";

type EventsStore = {
  exceptDailyListIds: string[];
  exceptProjectIds: string[];
  setExceptDailyListIds: (value: string[]) => void;
  setExceptProjectIds: (value: string[]) => void;
};

export const useSuggestionsStore = create<EventsStore>((set) => ({
  exceptDailyListIds: [],
  exceptProjectIds: [],
  setExceptDailyListIds: (value: string[]) =>
    set({ exceptDailyListIds: value }),
  setExceptProjectIds: (value: string[]) => set({ exceptProjectIds: value }),
}));
