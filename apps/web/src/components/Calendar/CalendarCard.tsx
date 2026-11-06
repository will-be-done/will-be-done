import { Repeat } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { formatDuration, formatTaskTime } from "@/lib/taskTime.ts";
import { useFocusStore } from "@/store/focusSlice.ts";
import { useItemDetailsOpen } from "@/components/ItemDetails/ItemDetailsStore.ts";
import { type CalendarEvent, isDraggable } from "./calendarModel";
import { cardClass } from "./styles";
import { type DragCommit, startCalendarDrag } from "./calendarDrag";

// "chip" is a single line (month), "card" stacks title and time (plan and
// the all-day row).
export const CalendarCard = ({
  event,
  variant,
  inTimeView = false,
  onCommit,
}: {
  event: CalendarEvent;
  variant: "chip" | "card";
  // Template occurrences can only be retimed from the day and week views.
  inTimeView?: boolean;
  onCommit: DragCommit;
}) => {
  const isFocused = useFocusStore((s) => s.focusItemKey === event.focusKey);
  const canDrag = isDraggable(event) && (!event.isProjected || inTimeView);
  const meta = [
    event.time && formatTaskTime(event.time),
    event.durationMinutes && formatDuration(event.durationMinutes),
  ].filter(Boolean);

  return (
    <div
      role="button"
      tabIndex={0}
      data-focusable-key={event.focusKey}
      onClick={() => useItemDetailsOpen.getState().setOpen(true)}
      onPointerDown={(e) => {
        if (canDrag) startCalendarDrag(e, event, "move", onCommit);
      }}
      title={event.title}
      className={cn(
        cardClass(event, isFocused, canDrag),
        "w-full min-w-0 shrink-0",
        variant === "chip" ? "px-1.5 py-0.5 text-xs" : "px-2 py-1 text-[13px]",
      )}
    >
      {variant === "chip" ? (
        <div className="flex min-w-0 gap-1">
          {event.time && (
            <span className="shrink-0 tabular-nums text-content-tinted">
              {formatTaskTime(event.time)}
            </span>
          )}
          <span className={cn("truncate", event.isDone && "line-through")}>
            {event.title}
          </span>
        </div>
      ) : (
        <>
          <div className={cn("truncate", event.isDone && "line-through")}>
            {event.title}
          </div>
          {(meta.length > 0 || event.isProjected) && (
            <div className="flex items-center gap-1.5 text-xs tabular-nums text-content-tinted">
              {event.isProjected && <Repeat className="h-3 w-3" />}
              {meta.join(" · ")}
            </div>
          )}
        </>
      )}
    </div>
  );
};
