import { FocusKey, focusManager, focusSlice } from "@/states/FocusManager";
import { createContext, useContext, useEffect, useMemo } from "react";
import { useAppStore } from "./state";
import { padStart } from "es-toolkit/compat";

export const ParentListContext = createContext<FocusKey | undefined>(undefined);

export const useRegisterFocusColumn = (key: FocusKey, priority: string) => {
  const store = useAppStore();
  const paddedPriority = padStart(priority, 7, "0");

  const item = useMemo(() => {
    return focusManager.buildColumn(key, paddedPriority);
  }, [key, paddedPriority]);

  useEffect(() => {
    focusManager.registerColumn(item);

    return () => {
      focusManager.unregister(item.key);
    };
  }, [item, store]);

  return item;
};

export const useRegisterFocusItem = (itemKey: FocusKey, priority: string) => {
  const paddedPriority = padStart(priority, 7, "0");

  const parentListKey = useContext(ParentListContext);
  const store = useAppStore();

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
  }, [item, store]);

  return item;
};
