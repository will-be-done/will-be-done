import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { Task } from "@/store/slices/tasksSlice.ts";

type FilterStore = {
  horizons: Task["horizon"][];
  setHorizons: (value: Task["horizon"][]) => void;
  getPreferredHorizon: () => Task["horizon"];
  collapsedProjectIds: string[];
  setCollapsedProjectIds: (value: string[]) => void;
  toggleCollapsedProjectId: (id: string) => void;
  isProjectCollapsed: (id: string) => boolean;
};

const horizonPreferOrder = ["week", "month", "year", "someday"] as const;
export const useFilterStore = create<FilterStore>()(
  persist(
    (set, get) => ({
      horizons: ["someday", "week", "month", "year"],
      setHorizons: (value: Task["horizon"][]) => set({ horizons: value }),
      getPreferredHorizon: () =>
        horizonPreferOrder.find((h) => get().horizons.includes(h)) || "week",
      collapsedProjectIds: [],
      setCollapsedProjectIds: (value: string[]) =>
        set({ collapsedProjectIds: value }),
      toggleCollapsedProjectId: (id: string) =>
        set((state) => ({
          collapsedProjectIds: state.collapsedProjectIds.includes(id)
            ? state.collapsedProjectIds.filter((i) => i !== id)
            : [...state.collapsedProjectIds, id],
        })),
      isProjectCollapsed: (id: string) =>
        get().collapsedProjectIds.includes(id),
    }),
    {
      name: "suggestions-filters-storage",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
