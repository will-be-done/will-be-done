import { create } from "zustand";

type SpaceSettingsStore = {
  open: boolean;
  spaceName: string;
  openSettings: (spaceName: string) => void;
  closeSettings: () => void;
};

export const useSpaceSettingsStore = create<SpaceSettingsStore>((set) => ({
  open: false,
  spaceName: "",
  openSettings: (spaceName) => set({ open: true, spaceName }),
  closeSettings: () => set({ open: false }),
}));
