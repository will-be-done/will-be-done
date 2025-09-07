import { PropsWithChildren, useEffect, useMemo } from "react";
import { ParentListContext, useRegisterFocusItem } from "../hooks/useLists.ts";
import { padStart } from "es-toolkit/compat";
import { FocusKey, focusManager } from "@/store2/slices/focusSlice.ts";

export const ColumnListProvider = ({
  focusKey,
  priority,
  children,
}: PropsWithChildren<{
  focusKey: FocusKey;
  priority: string;
}>) => {
  const paddedPriority = padStart(priority, 7, "0");

  const item = useMemo(() => {
    return focusManager.buildColumn(focusKey, paddedPriority);
  }, [focusKey, paddedPriority]);

  useEffect(() => {
    focusManager.registerColumn(item);
    return () => {
      focusManager.unregister(item.key);
    };
  }, [item]);

  return <ParentListContext value={focusKey}>{children}</ParentListContext>;
};

const ParentListItemProviderBody = ({
  focusKey,
  priority,
  children,
}: PropsWithChildren<{
  focusKey: FocusKey;
  priority: string;
}>) => {
  const paddedPriority = padStart(priority, 7, "0");

  useRegisterFocusItem(focusKey, paddedPriority);

  return <ParentListContext value={focusKey}>{children}</ParentListContext>;
};

export const ParentListItemProvider = ({
  focusKey,
  priority,
  children,
  disabled,
}: PropsWithChildren<{
  focusKey: FocusKey;
  priority: string;
  disabled?: boolean;
}>) => {
  if (disabled) {
    return <>{children}</>;
  }

  return (
    <ParentListItemProviderBody focusKey={focusKey} priority={priority}>
      {children}
    </ParentListItemProviderBody>
  );
};
