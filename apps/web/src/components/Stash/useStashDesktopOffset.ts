import { useIsMobile } from "@/hooks/use-mobile.ts";
import {
  getStashOpenWidth,
  STASH_BUTTON_WIDTH,
  useStashOpen,
  useStashSize,
} from "@/components/DaysBoard/StashStore.ts";

export const useStashDesktopOffset = () => {
  const isMobile = useIsMobile();
  const isOpen = useStashOpen((s) => s.isOpen);
  const width = useStashSize((s) => s.width);

  if (isMobile) {
    return 0;
  }

  return isOpen ? getStashOpenWidth(width) : STASH_BUTTON_WIDTH;
};
