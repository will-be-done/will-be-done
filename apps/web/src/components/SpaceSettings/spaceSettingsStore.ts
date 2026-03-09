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
  closeSettings: () => set({ open: false, spaceName: "" }),
  openSettings: (spaceName: string) => set({ open: true, spaceName }),
}));
