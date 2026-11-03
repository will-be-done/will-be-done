import { useCallback } from "react";
import { useAsyncDispatch, useSelectAsync } from "@will-be-done/hyperdb/react";
import {
  convertNoteToTask,
  convertTaskToNote,
  taskHasNoteIncompatibleData,
} from "@will-be-done/slices/space";
import { buildFocusKey, useFocusStore } from "@/store/focusSlice.ts";

export function useNoteConversion(onItemIdChange?: (itemId: string) => void) {
  const dispatch = useAsyncDispatch();
  const select = useSelectAsync();

  const toNote = useCallback(
    async (taskId: string) => {
      const losesData = await select({
        selector: taskHasNoteIncompatibleData,
        args: { taskId },
      });
      if (
        losesData &&
        !window.confirm(
          "Convert to note? Its schedule, stash entry and checklist will be removed.",
        )
      ) {
        return;
      }

      const note = await dispatch(convertTaskToNote({ taskId }));
      useFocusStore.getState().focusByKey(buildFocusKey(note.id, note.type));
      onItemIdChange?.(note.id);
    },
    [dispatch, select, onItemIdChange],
  );

  const toTask = useCallback(
    async (noteId: string) => {
      const task = await dispatch(convertNoteToTask({ noteId }));
      useFocusStore.getState().focusByKey(buildFocusKey(task.id, task.type));
      onItemIdChange?.(task.id);
    },
    [dispatch, onItemIdChange],
  );

  return { toNote, toTask };
}
