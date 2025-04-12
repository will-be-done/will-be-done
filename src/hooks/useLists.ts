import { listsManager } from "@/states/ListsManager";
import { useEffect } from "react";

export const useRegisterListColumn = (columnName: string, priority: string) => {
  useEffect(() => {
    listsManager.registerColumn(columnName, priority);
    return () => {
      listsManager.unregisterItemOrColumn(columnName);
    };
  }, [columnName, priority]);
};

export const useRegisterListItem = (
  columnName: string,
  itemId: string,
  priority: string,
) => {
  useEffect(() => {
    listsManager.registerItem(columnName, itemId, priority);
    return () => {
      listsManager.unregisterItemOrColumn(itemId);
    };
  }, [columnName, itemId, priority]);
};
