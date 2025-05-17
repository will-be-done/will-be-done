import { Task } from "@/models/models2";
import { create } from "zustand";

type FilterStore = {
  horizons: Task["horizon"][];
  setHorizons: (value: Task["horizon"][]) => void;
};

export const useFilterStore = create<FilterStore>((set) => ({
  horizons: ["someday", "week", "month", "year"],
  setHorizons: (value: Task["horizon"][]) => set({ horizons: value }),
}));
