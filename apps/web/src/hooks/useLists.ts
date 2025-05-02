import { FocusKey, focusManager, focusSlice } from "@/states/FocusManager";
import { createContext, useContext, useEffect, useMemo } from "react";
import { useAppStore } from "./state";

export const ParentListContext = createContext<FocusKey | undefined>(undefined);

export const useRegisterFocusColumn = (key: FocusKey, priority: string) => {
  const store = useAppStore();

  const item = useMemo(() => {
    return focusManager.buildColumn(key, priority);
  }, [key, priority]);

  useEffect(() => {
    focusManager.registerColumn(item);

    return () => {
      focusManager.unregister(item.key);
    };
  }, [item, store]);

  return item;
};

export const useRegisterFocusItem = (itemKey: FocusKey, priority: string) => {
  const parentListKey = useContext(ParentListContext);
  const store = useAppStore();

  const item = useMemo(() => {
    if (!parentListKey) {
      throw new Error("Parent list not found");
    }

    return focusManager.buildItem(parentListKey, itemKey, priority);
  }, [itemKey, parentListKey, priority]);

  useEffect(() => {
    focusManager.registerItem(item);
    return () => {
      focusManager.unregister(item.key);
    };
  }, [item, store]);

  return item;
};
