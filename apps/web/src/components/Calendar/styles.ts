import { cn } from "@/lib/utils.ts";
import { type CalendarEvent } from "./calendarModel";

const natureClass = (event: CalendarEvent) =>
  event.nature === "red"
    ? "border-l-rose-400 bg-nature-red"
    : event.nature === "green"
      ? "border-l-emerald-400 bg-nature-green"
      : "border-l-slate-500 bg-panel-tinted";

export const cardClass = (
  event: CalendarEvent,
  isFocused: boolean,
  canDrag: boolean,
) =>
  cn(
    "select-none rounded-md border-l-[3px] text-left text-content outline-none",
    event.isProjected
      ? "border border-dashed border-content-tinted/25 text-content-tinted/70"
      : natureClass(event),
    canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-default",
    event.isDone && "opacity-50",
    isFocused && "ring-1 ring-accent",
  );
