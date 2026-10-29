import { Clock, Repeat } from "lucide-react";
import {
  type TaskTemplateOccurrence,
  taskTemplateType,
} from "@will-be-done/slices/space";
import { cn } from "@/lib/utils.ts";
import { formatDuration, formatTaskTime } from "@/lib/taskTime.ts";
import { buildFocusKey, useFocusStore } from "@/store/focusSlice.ts";

// A grayed, read-only preview of a Task that a template will generate later.
// Focusing it shows the template in item details.
export const ProjectedTaskCard = ({
  occurrence,
  onAddTask,
}: {
  occurrence: TaskTemplateOccurrence;
  // Adds a task to the occurrence's day, like "o" on a real task.
  onAddTask: () => void;
}) => {
  const { template } = occurrence;
  // The template id keeps item details working; the occurrence id keeps keys
  // unique when a template occurs several times in view (even on one day).
  const focusKey = buildFocusKey(template.id, taskTemplateType, occurrence.id);
  const isFocused = useFocusStore(
    (s) => !s.isFocusDisabled && s.focusItemKey === focusKey,
  );

  return (
    <div
      data-focusable-key={focusKey}
      data-occurrence-date={occurrence.date}
      // Keyboard moves and drops must skip it: it is not a real list item.
      data-ignore-drop
      tabIndex={0}
      title={template.title}
      onClick={() => useFocusStore.getState().focusByKey(focusKey, true)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.code === "KeyO") {
          e.preventDefault();
          onAddTask();
        }
      }}
      className={cn(
        "cursor-default select-none rounded-lg border border-dashed px-2 py-2 text-sm text-content-tinted/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent whitespace-break-spaces [overflow-wrap:anywhere]",
        isFocused
          ? "border-accent"
          : "border-content-tinted/25 hover:border-content-tinted/40",
      )}
    >
      <div className="font-medium">{template.title}</div>
      <div className="mt-1 flex items-center gap-1.5 text-xs tabular-nums">
        <Repeat className="size-3" />
        {occurrence.time && (
          <span className="flex items-center gap-0.5">
            <Clock className="size-2.5" />
            {formatTaskTime(occurrence.time)}
          </span>
        )}
        {template.durationMinutes && (
          <span>{formatDuration(template.durationMinutes)}</span>
        )}
      </div>
    </div>
  );
};
