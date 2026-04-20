import { createJSONStorage, persist } from "zustand/middleware";
import { create } from "zustand";

export const STASH_BUTTON_WIDTH = 32;
const DEFAULT_STASH_WIDTH = 400;
const MIN_STASH_WIDTH = 280;
const MAX_STASH_WIDTH = 720;

export const getStashOpenWidth = (stashWidth: number) =>
  stashWidth + STASH_BUTTON_WIDTH;

export const useStashSize = create<{
  width: number;
  setWidth: (value: number) => void;
}>()(
  persist(
    (set) => ({
      width: DEFAULT_STASH_WIDTH,
      setWidth: (value: number) => {
        set({
          width: Math.max(MIN_STASH_WIDTH, Math.min(MAX_STASH_WIDTH, value)),
        });
      },
    }),
    {
      name: "stash-size",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

export const useStashOpen = create<{
  isOpen: boolean;
  toggle: () => void;
  setOpen: (v: boolean) => void;
}>()(
  persist(
    (set) => ({
      isOpen: false,
      toggle: () => set((s) => ({ isOpen: !s.isOpen })),
      setOpen: (v: boolean) => set({ isOpen: v }),
    }),
    {
      name: "stash-open",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
