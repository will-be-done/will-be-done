import { PropsWithChildren, useEffect, useMemo } from "react";
import { ParentListContext, useRegisterFocusItem } from "./useLists";
import { FocusKey, focusManager, focusSlice } from "@/states/FocusManager";
import { observer } from "mobx-react-lite";
import { useAppStore } from "./state";

export const ColumnListProvider = observer(
  ({
    focusKey,
    priority,
    children,
  }: PropsWithChildren<{
    focusKey: FocusKey;
    priority: string;
  }>) => {
    const store = useAppStore();

    const item = useMemo(() => {
      return focusManager.buildColumn(focusKey, priority);
    }, [focusKey, priority]);

    useEffect(() => {
      focusManager.registerColumn(item);
      return () => {
        focusManager.unregister(item.key);
      };
    }, [item, store]);

    return (
      <ParentListContext.Provider value={focusKey}>
        {children}
      </ParentListContext.Provider>
    );
  },
);

export const ParentListItemProvider = observer(
  ({
    focusKey,
    priority,
    children,
  }: PropsWithChildren<{ focusKey: FocusKey; priority: string }>) => {
    useRegisterFocusItem(focusKey, priority);

    return (
      <ParentListContext.Provider value={focusKey}>
        {children}
      </ParentListContext.Provider>
    );
  },
);
