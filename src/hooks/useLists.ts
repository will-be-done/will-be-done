import { FocusItem, FocusKey, focusManager } from "@/states/FocusManager";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

export const ParentListContext = createContext<FocusKey | undefined>(undefined);

export const useRegisterFocusColumn = (key: FocusKey, priority: string) => {
  const item = useMemo(() => {
    return focusManager.registerColumn(key, priority);
  }, [key, priority]);

  useEffect(() => {
    focusManager.registerColumn(key, priority);

    return () => {
      focusManager.unregister(key);
    };
  }, [key, priority]);

  return item;
};

export const useRegisterFocusItem = (itemKey: FocusKey, priority: string) => {
  const parentListKey = useContext(ParentListContext);

  const item = useMemo(() => {
    if (!parentListKey) {
      throw new Error("Parent list not found");
    }

    return focusManager.buildFocusItem(parentListKey, itemKey, priority);
  }, [itemKey, parentListKey, priority]);

  useEffect(() => {
    focusManager.registerColumnItem(item);
    return () => {
      focusManager.unregister(item.key);
    };
  }, [item, parentListKey]);

  return item;
};
