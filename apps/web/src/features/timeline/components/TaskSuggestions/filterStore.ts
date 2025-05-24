import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {Task} from "@/store/models.ts";

type FilterStore = {
  horizons: Task["horizon"][];
  setHorizons: (value: Task["horizon"][]) => void;
  collapsedProjectIds: string[];
  setCollapsedProjectIds: (value: string[]) => void;
  toggleCollapsedProjectId: (id: string) => void;
  isProjectCollapsed: (id: string) => boolean;
};

export const useFilterStore = create<FilterStore>()(
  persist(
    (set, get) => ({
      horizons: ["someday", "week", "month", "year"],
      setHorizons: (value: Task["horizon"][]) => set({ horizons: value }),
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
