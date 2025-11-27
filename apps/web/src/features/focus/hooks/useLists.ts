import { createContext, use, useEffect, useMemo } from "react";
import { padStart } from "es-toolkit/compat";
import { FocusKey, focusManager } from "@/store2/slices/focusSlice.ts";

export const ParentListContext = createContext<FocusKey | undefined>(undefined);

export const useRegisterFocusItem = (itemKey: FocusKey, priority: string) => {
  const paddedPriority = padStart(priority, 7, "0");

  const parentListKey = use(ParentListContext);

  const item = useMemo(() => {
    if (!parentListKey) {
      throw new Error("Parent list not found");
    }

    return focusManager.buildItem(parentListKey, itemKey, paddedPriority);
  }, [itemKey, parentListKey, paddedPriority]);

  useEffect(() => {
    focusManager.registerItem(item);
    return () => {
      focusManager.unregister(item.key);
    };
  }, [item]);

  return item;
};
