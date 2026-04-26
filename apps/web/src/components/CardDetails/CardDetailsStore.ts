import { createJSONStorage, persist } from "zustand/middleware";
import { create } from "zustand";

const DEFAULT_WIDTH = 288;
const MIN_WIDTH = 240;
const MAX_WIDTH = 380;

export const useCardDetailsOpen = create<{
  isOpen: boolean;
  toggle: () => void;
  setOpen: (v: boolean) => void;
}>()(
  persist(
    (set) => ({
      isOpen: true,
      toggle: () => set((s) => ({ isOpen: !s.isOpen })),
      setOpen: (v: boolean) => set({ isOpen: v }),
    }),
    {
      name: "card-details-open",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

export const useCardDetailsSize = create<{
  width: number;
  setWidth: (value: number) => void;
}>()(
  persist(
    (set) => ({
      width: DEFAULT_WIDTH,
      setWidth: (value: number) => {
        set({
          width: Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, value)),
        });
      },
    }),
    {
      name: "card-details-size",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
