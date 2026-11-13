import { create } from "zustand";

export const useSearchOpen = create<{ isOpen: boolean }>(() => ({
  isOpen: false,
}));

export const openSearch = () => useSearchOpen.setState({ isOpen: true });

export const closeSearch = () => useSearchOpen.setState({ isOpen: false });
