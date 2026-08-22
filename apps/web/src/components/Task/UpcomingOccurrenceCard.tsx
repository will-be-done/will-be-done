import { CircleDashed, Clock, Timer } from "lucide-react";
import {
  taskTemplateType,
  type UpcomingTemplateOccurrence,
} from "@will-be-done/slices/space";
import { buildFocusKey, useFocusStore } from "@/store/focusSlice.ts";
import { formatClockMinutes } from "@/components/TimePicker/TimePicker.tsx";
import { formatPlannedClock } from "@/components/Task/PlannedDurationPicker.tsx";
import { cn } from "@/lib/utils.ts";

export function UpcomingOccurrenceCard({
  occurrence,
}: {
  occurrence: UpcomingTemplateOccurrence;
}) {
  return (
    <button
      type="button"
      onClick={() =>
        useFocusStore
          .getState()
          .focusByKey(
            buildFocusKey(occurrence.templateId, taskTemplateType),
            true,
          )
      }
      className={cn(
        "w-full overflow-hidden rounded-lg text-left text-sm ring-1 ring-dashed ring-ring",
        "bg-panel text-content opacity-60 hover:opacity-85 transition-opacity",
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5 px-2 py-2 font-medium">
        <CircleDashed className="size-3.5 shrink-0 text-content-tinted" />
        <span className="truncate">{occurrence.title || "Untitled"}</span>
      </div>
      <div
        className={cn(
          "flex items-center justify-between rounded-b-lg px-2 py-1.5 text-xs",
          occurrence.nature === "red"
            ? "bg-nature-red text-nature-red-content"
            : occurrence.nature === "green"
              ? "bg-nature-green text-nature-green-content"
              : "bg-panel-tinted text-content-tinted",
        )}
      >
        <div className="min-w-0 truncate">{occurrence.sectionTitle}</div>
        <div className="flex shrink-0 items-center gap-1.5 leading-none">
          {occurrence.startsAtMinutes != null && (
            <span className="flex h-4 items-center gap-0.5 tabular-nums">
              <Clock className="size-3 shrink-0" />
              {formatClockMinutes(occurrence.startsAtMinutes)}
            </span>
          )}
          <span className="flex h-4 items-center gap-0.5 tabular-nums">
            <Timer className="size-3 shrink-0" />
            {formatPlannedClock(occurrence.durationMinutes)}
          </span>
        </div>
        <div className="min-w-0 truncate text-right">
          {occurrence.projectIcon} {occurrence.projectTitle}
        </div>
      </div>
    </button>
  );
}
