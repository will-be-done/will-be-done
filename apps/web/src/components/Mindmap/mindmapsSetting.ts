import { create } from "zustand";
import { persist } from "zustand/middleware";

// Per device. Hides the maps tab only; mindmap links still open.
export const useMindmapsEnabled = create<{
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}>()(
  persist(
    (set) => ({
      enabled: false,
      setEnabled: (enabled) => set({ enabled }),
    }),
    { name: "mindmaps-enabled" },
  ),
);
