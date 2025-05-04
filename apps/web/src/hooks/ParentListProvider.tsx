import { PropsWithChildren, useEffect, useMemo } from "react";
import { ParentListContext, useRegisterFocusItem } from "./useLists";
import { FocusKey, focusManager, focusSlice } from "@/states/FocusManager";
import { useAppStore } from "./state";
import { padStart } from "es-toolkit/compat";

export const ColumnListProvider = ({
  focusKey,
  priority,
  children,
}: PropsWithChildren<{
  focusKey: FocusKey;
  priority: string;
}>) => {
  const store = useAppStore();
  const paddedPriority = padStart(priority, 7, "0");

  const item = useMemo(() => {
    return focusManager.buildColumn(focusKey, paddedPriority);
  }, [focusKey, paddedPriority]);

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
};

export const ParentListItemProvider = ({
  focusKey,
  priority,
  children,
}: PropsWithChildren<{ focusKey: FocusKey; priority: string }>) => {
  const paddedPriority = padStart(priority, 7, "0");

  useRegisterFocusItem(focusKey, paddedPriority);

  return (
    <ParentListContext.Provider value={focusKey}>
      {children}
    </ParentListContext.Provider>
  );
};
