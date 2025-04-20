import { PropsWithChildren, useEffect } from "react";
import { ParentListContext, useRegisterFocusItem } from "./useLists";
import { FocusKey, focusManager } from "@/states/FocusManager";
import { observer } from "mobx-react-lite";

export const ColumnListProvider = observer(
  ({
    focusKey,
    priority,
    children,
  }: PropsWithChildren<{
    focusKey: FocusKey;
    priority: string;
  }>) => {
    useEffect(() => {
      focusManager.registerColumn(focusKey, priority);
      return () => {
        focusManager.unregister(focusKey);
      };
    }, [focusKey, priority]);

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
