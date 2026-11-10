import { Repeat } from "lucide-react";
import { BriefDescription } from "@/components/Task/BriefDescription";
import { cn } from "@/lib/utils.ts";
import { formatDuration, formatTaskTime } from "@/lib/taskTime.ts";
import { useFocusStore } from "@/store/focusSlice.ts";
import { useItemDetailsOpen } from "@/components/ItemDetails/ItemDetailsStore.ts";
import { type CalendarEvent, isDraggable } from "./calendarModel";
import { cardClass } from "./styles";
import { useProjectCardAppearance } from "@/components/ProjectView/useProjectCardStyle";
import { ProjectCardBody } from "@/components/Task/ProjectCardBody";
import {
  type DragCommit,
  holdTouchScroll,
  startCalendarDrag,
} from "./calendarDrag";

// "chip" is compact (month); "card" has more padding (plan and all-day).
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
  const { style: projectStyle, project } = useProjectCardAppearance(
    event.projectSectionId,
  );
  const canDrag = isDraggable(event) && (!event.isProjected || inTimeView);
  const meta = [
    event.time && formatTaskTime(event.time),
    event.durationMinutes && formatDuration(event.durationMinutes),
  ].filter(Boolean);

  return (
    <div
      ref={canDrag ? holdTouchScroll : undefined}
      role="button"
      tabIndex={0}
      data-focusable-key={event.focusKey}
      onClick={() => useItemDetailsOpen.getState().setOpen(true)}
      onPointerDown={(e) => {
        if (canDrag) startCalendarDrag(e, event, "move", onCommit);
      }}
      title={event.title}
      style={projectStyle}
      className={cn(
        cardClass(event, isFocused, canDrag),
        "flex w-full min-w-0 shrink-0 flex-col",
        project?.backgroundImageUrl && "min-h-[112px]",
        variant === "chip" ? "px-1.5 py-0.5 text-xs" : "px-2 py-1 text-[13px]",
      )}
    >
      <div className={cn("shrink-0 truncate", event.isDone && "line-through")}>
        {event.title}
      </div>
      {(project?.backgroundImageUrl ||
        meta.length > 0 ||
        event.isProjected ||
        event.briefDescription?.trim()) && (
        <ProjectCardBody
          project={project}
          fillImage
          className="-mx-1 mt-0.5 min-h-0 flex-1 rounded-sm px-1 pb-1"
        >
          {(meta.length > 0 || event.isProjected) && (
            <div className="flex items-center gap-1.5 text-xs tabular-nums text-content-tinted">
              {event.isProjected && <Repeat className="h-3 w-3" />}
              {meta.join(" · ")}
            </div>
          )}
          <BriefDescription text={event.briefDescription} />
        </ProjectCardBody>
      )}
    </div>
  );
};
