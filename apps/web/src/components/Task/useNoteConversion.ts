import { useCallback, useMemo } from "react";
import { uuidv7 } from "uuidv7";
import { useAsyncDispatch } from "@will-be-done/hyperdb/react";
import {
  convertNoteToTask,
  convertTaskToNote,
  type Item,
  noteType,
  taskType,
} from "@will-be-done/slices/space";
import { buildFocusKey, useFocusStore } from "@/store/focusSlice.ts";
import { useUndoToast } from "@/store/undo";

// Conversions replace the row with `next`. A view showing the item is told
// before `run` deletes the old row, so it can switch to the new row in the same
// render.
export type ReplaceItem = (
  next: { id: string; type: Item["type"] },
  run: () => Promise<unknown>,
) => void;

export const runDirectly: ReplaceItem = (_next, run) => void run();

export function useNoteConversion(replaceItem: ReplaceItem = runDirectly) {
  const dispatch = useAsyncDispatch();
  const withUndo = useUndoToast();

  const toNote = useCallback(
    (taskId: string) => {
      const id = uuidv7();
      replaceItem({ id, type: noteType }, async () => {
        const note = await withUndo(
          () => dispatch(convertTaskToNote({ taskId, id })),
          () => replaceItem({ id: taskId, type: taskType }, async () => {}),
        );
        useFocusStore.getState().focusByKey(buildFocusKey(note.id, note.type));
      });
    },
    [dispatch, withUndo, replaceItem],
  );

  const toTask = useCallback(
    (noteId: string) => {
      const id = uuidv7();
      replaceItem({ id, type: taskType }, async () => {
        const task = await withUndo(
          () => dispatch(convertNoteToTask({ noteId, id })),
          () => replaceItem({ id: noteId, type: noteType }, async () => {}),
        );
        useFocusStore.getState().focusByKey(buildFocusKey(task.id, task.type));
      });
    },
    [dispatch, withUndo, replaceItem],
  );

  return useMemo(() => ({ toNote, toTask }), [toNote, toTask]);
}
