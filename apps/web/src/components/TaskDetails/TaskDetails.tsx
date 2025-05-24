import { useAppSelector } from "@/hooks/stateHooks.ts";
import { parseColumnKey } from "@/store/slices/focusSlice.ts";
import {taskBoxesSlice} from "@/store/slices/taskBoxesSlice.ts";

export const TaskDetails = () => {
  const currentFocusKey = useAppSelector((state) => state.focus.focusItemKey);
  const { id } = currentFocusKey ? parseColumnKey(currentFocusKey) : {};
  const task = useAppSelector((state) =>
    taskBoxesSlice.taskOfModelIdOrDefault(state, id || ""),
  );

  const lastToggledAt = new Date(task.lastToggledAt);
  const createdAt = new Date(task.createdAt);

  return (
    <div>
      <h1 className="whitespace-break-spaces [overflow-wrap:anywhere]">
        {task.title}
      </h1>

      <div className="mt-4">
        Last toggled at: {lastToggledAt.toLocaleString()}
      </div>
      <div>Created at: {createdAt.toLocaleString()}</div>
    </div>
  );
};
