import { useCallback, useMemo } from "react";
import { useAsyncDispatch } from "@will-be-done/hyperdb/react";
import {
  convertNoteToTask,
  convertTaskToNote,
} from "@will-be-done/slices/space";
import { buildFocusKey, useFocusStore } from "@/store/focusSlice.ts";
import { useUndoToast } from "@/store/undo";

export function useNoteConversion(onItemIdChange?: (itemId: string) => void) {
  const dispatch = useAsyncDispatch();
  const withUndo = useUndoToast();

  const toNote = useCallback(
    async (taskId: string) => {
      const note = await withUndo(() =>
        dispatch(convertTaskToNote({ taskId })),
      );
      useFocusStore.getState().focusByKey(buildFocusKey(note.id, note.type));
      onItemIdChange?.(note.id);
    },
    [dispatch, withUndo, onItemIdChange],
  );

  const toTask = useCallback(
    async (noteId: string) => {
      const task = await withUndo(() =>
        dispatch(convertNoteToTask({ noteId })),
      );
      useFocusStore.getState().focusByKey(buildFocusKey(task.id, task.type));
      onItemIdChange?.(task.id);
    },
    [dispatch, withUndo, onItemIdChange],
  );

  return useMemo(() => ({ toNote, toTask }), [toNote, toTask]);
}
