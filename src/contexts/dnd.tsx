import { createContext, useContext } from "react";

import invariant from "tiny-invariant";

import type { CleanupFn } from "@atlaskit/pragmatic-drag-and-drop/types";
import { DailyList } from "../models/models";

export type BoardContextValue = {
  getLists: () => DailyList[];

  reorderCard: (args: {
    listId: string;
    taskId: string;
    startIndex: number;
    finishIndex: number;
  }) => void;

  moveCard: (args: {
    fromListId: string;
    toListId: string;
    itemIndexInStartColumn: number;
    itemIndexInFinishColumn?: number;
  }) => void;

  registerCard: (args: {
    listId: string;
    cardId: string;
    entry: {
      element: HTMLElement;
    };
  }) => CleanupFn;

  registerList: (args: {
    listId: string;
    entry: {
      element: HTMLElement;
    };
  }) => CleanupFn;

  instanceId: symbol;
};

export const BoardContext = createContext<BoardContextValue | null>(null);

export function useBoardContext(): BoardContextValue {
  const value = useContext(BoardContext);
  invariant(value, "cannot find BoardContext provider");
  return value;
}
