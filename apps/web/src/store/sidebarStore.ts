import { create } from "zustand";
import { persist } from "zustand/middleware";

const MIN_WIDTH = 180;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 256;

type SidebarStore = {
  width: number;
  setWidth: (width: number) => void;
};

export const useSidebarStore = create<SidebarStore>()(
  persist(
    (set) => ({
      width: DEFAULT_WIDTH,
      setWidth: (width) =>
        set({ width: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width)) }),
    }),
    { name: "sidebar-width" },
  ),
);

export { MIN_WIDTH, MAX_WIDTH };
