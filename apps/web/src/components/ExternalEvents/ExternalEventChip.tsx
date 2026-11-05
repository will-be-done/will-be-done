import { cn } from "@/lib/utils.ts";
import {
  type DayExternalEvent,
  eventTooltip,
  externalEventClass,
  externalEventStyle,
  formatEventStart,
  formatEventTime,
} from "./externalEventsModel";

// Read-only: external events open nothing and cannot be dragged.
export const ExternalEventChip = ({
  event,
  showTime = true,
  className,
}: {
  event: DayExternalEvent;
  showTime?: boolean;
  className?: string;
}) => (
  <div
    title={eventTooltip(event)}
    data-external-event
    className={cn(
      externalEventClass,
      "flex min-w-0 items-baseline gap-1.5 px-1.5 py-0.5 text-xs",
      className,
    )}
    style={externalEventStyle(event)}
  >
    {showTime && !event.allDay && (
      <span className="shrink-0 tabular-nums text-content-tinted/70">
        {formatEventStart(event)}
      </span>
    )}
    <span className="min-w-0 truncate">
      {event.occurrence.title || "Untitled event"}
    </span>
  </div>
);

// A day's external events above its task list.
export const DayEventsStrip = ({
  events,
  className,
}: {
  events: DayExternalEvent[];
  className?: string;
}) => {
  if (events.length === 0) return null;
  return (
    <div className={cn("flex w-full flex-col gap-1", className)}>
      {events.map((event) => (
        <div
          key={event.key}
          title={eventTooltip(event)}
          data-external-event
          className={cn(
            externalEventClass,
            "flex min-w-0 items-baseline gap-2 px-2 py-1 text-sm",
          )}
          style={externalEventStyle(event)}
        >
          <span className="shrink-0 text-xs tabular-nums text-content-tinted/70">
            {formatEventTime(event)}
          </span>
          <span className="min-w-0 truncate text-content">
            {event.occurrence.title || "Untitled event"}
          </span>
        </div>
      ))}
    </div>
  );
};
