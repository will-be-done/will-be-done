import { create } from "zustand";
import type { TaskCreationLocation } from "@/lib/analytics";

// Values that override the page defaults, e.g. the calendar slot clicked.
type QuickAddRequest = {
  date?: Date;
  time?: string | null;
  location?: TaskCreationLocation;
};

export const useQuickAdd = create<{ request: QuickAddRequest | null }>(() => ({
  request: null,
}));

export const openQuickAdd = (request: QuickAddRequest = {}) =>
  useQuickAdd.setState({ request });

export const closeQuickAdd = () => useQuickAdd.setState({ request: null });
