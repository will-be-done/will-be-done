import { useAppSelector } from "@/hooks/state";
import { taskBoxesSlice } from "@/models/models2";
import { parseColumnKey } from "@/states/FocusManager";

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
