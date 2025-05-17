import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type SuggestionsStore = {
  exceptDailyListIds: string[];
  exceptProjectIds: string[];
  setExceptDailyListIds: (value: string[]) => void;
  setExceptProjectIds: (value: string[]) => void;
};

export const useSuggestionsStore = create<SuggestionsStore>()(
  persist(
    (set) => ({
      exceptDailyListIds: [],
      exceptProjectIds: [],
      setExceptDailyListIds: (value: string[]) =>
        set({ exceptDailyListIds: value }),
      setExceptProjectIds: (value: string[]) =>
        set({ exceptProjectIds: value }),
    }),
    {
      name: "suggestions-storage",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
