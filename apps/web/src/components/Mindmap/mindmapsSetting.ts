import { create } from "zustand";
import { persist } from "zustand/middleware";
import { isDemoMode } from "@/lib/demoMode.ts";

// Per device. Hides the maps tab only; mindmap links still open. The demo
// shows its sample maps.
export const useMindmapsEnabled = create<{
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}>()(
  persist(
    (set) => ({
      enabled: isDemoMode(),
      setEnabled: (enabled) => set({ enabled }),
    }),
    { name: "mindmaps-enabled" },
  ),
);
