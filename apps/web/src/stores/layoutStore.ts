import { create } from "zustand";
import { persist } from "zustand/middleware";

interface LayoutState {
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      sidebarWidth: 20,
      setSidebarWidth: (width) => set({ sidebarWidth: width }),
    }),
    {
      name: "layout-storage",
    }
  )
);
