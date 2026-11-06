import { create } from "zustand";
import type { DailyEntry } from "@will-be-done/slices/space";
import type { TaskCreationLocation } from "@/lib/analytics";

// Values that override the page defaults, e.g. the calendar slot clicked.
export type QuickAddRequest = {
  date?: Date;
  time?: string | null;
  location?: TaskCreationLocation;
  // Runs once the task is written; the entry is set when it was scheduled.
  onCreated?: (entry: DailyEntry | undefined) => void;
};

export const useQuickAdd = create<{ request: QuickAddRequest | null }>(() => ({
  request: null,
}));

export const openQuickAdd = (request: QuickAddRequest = {}) =>
  useQuickAdd.setState({ request });

export const closeQuickAdd = () => useQuickAdd.setState({ request: null });
