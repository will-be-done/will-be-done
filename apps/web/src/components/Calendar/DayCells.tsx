import { format, isSameMonth } from "date-fns";
import { getDMY } from "@will-be-done/slices/space";
import { cn } from "@/lib/utils.ts";
import {
  type CalendarEvent,
  shownDayEvents,
  shownMonthExternalCount,
} from "./calendarModel";
import { type DragCommit, useIsDropTarget } from "./calendarDrag";
import { CalendarCard } from "./CalendarCard";
import { type DayExternalEvent } from "@/components/ExternalEvents/externalEventsModel.ts";
import { ExternalEventChip } from "@/components/ExternalEvents/ExternalEventChip.tsx";
import { ScrollArea } from "@/components/ui/scroll-area";

export type DayActions = {
  onCommit: DragCommit;
  onCreate: (date: string, time: string | null) => void;
  onOpenDay: (date: Date) => void;
};

const DayNumber = ({
  label,
  isToday,
  isMuted,
}: {
  label: string;
  isToday: boolean;
  isMuted?: boolean;
}) => (
  <span
    className={cn(
      "rounded-full px-1.5 text-sm tabular-nums",
      isToday
        ? "bg-accent font-semibold text-white"
        : isMuted
          ? "text-content-tinted/40"
          : "text-content-tinted",
    )}
  >
    {label}
  </span>
);

// Shared shell for month and plan cells: a drop target and a focus column.
const DayCell = ({
  date,
  isToday,
  onCreate,
  className,
  children,
}: {
  date: string;
  isToday: boolean;
  onCreate: DayActions["onCreate"];
  className?: string;
  children: React.ReactNode;
}) => {
  const isDropTarget = useIsDropTarget(date, undefined);
  return (
    <ScrollArea
      data-calendar-date={date}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCreate(date, null);
      }}
      rootClassName="min-h-0 min-w-0"
      className={cn(
        "flex flex-col gap-1 border-b border-r border-white/5 p-1.5",
        isToday && "bg-accent/[0.04]",
        isDropTarget && "bg-accent/10",
        className,
      )}
    >
      {children}
    </ScrollArea>
  );
};

export const MonthCell = ({
  day,
  anchor,
  today,
  events,
  external,
  actions,
}: {
  day: Date;
  anchor: Date;
  today: string;
  events: CalendarEvent[];
  external: DayExternalEvent[];
  actions: DayActions;
}) => {
  const date = getDMY(day);
  const shownExternal = external.slice(
    0,
    shownMonthExternalCount(external.length, events.length),
  );
  const shown = shownDayEvents("month", events, external.length);
  const hidden =
    external.length + events.length - shownExternal.length - shown.length;

  return (
    <DayCell date={date} isToday={date === today} onCreate={actions.onCreate}>
      <div className="pointer-events-none flex items-center justify-between">
        <DayNumber
          label={format(day, "d")}
          isToday={date === today}
          isMuted={!isSameMonth(day, anchor)}
        />
      </div>
      {shownExternal.map((event) => (
        <ExternalEventChip key={event.key} event={event} />
      ))}
      {shown.map((event) => (
        <CalendarCard
          key={event.key}
          event={event}
          variant="chip"
          onCommit={actions.onCommit}
        />
      ))}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => actions.onOpenDay(day)}
          className="self-start rounded px-1.5 text-xs text-content-tinted hover:bg-white/5 hover:text-content cursor-pointer"
        >
          +{hidden} more
        </button>
      )}
    </DayCell>
  );
};

export const PlanCell = ({
  day,
  today,
  events,
  external,
  actions,
}: {
  day: Date;
  today: string;
  events: CalendarEvent[];
  external: DayExternalEvent[];
  actions: DayActions;
}) => {
  const date = getDMY(day);
  return (
    <DayCell
      date={date}
      isToday={date === today}
      onCreate={actions.onCreate}
      className="gap-1.5"
    >
      <div className="pointer-events-none flex">
        <DayNumber label={format(day, "MMM d")} isToday={date === today} />
      </div>
      {external.map((event) => (
        <ExternalEventChip key={event.key} event={event} />
      ))}
      {events.map((event) => (
        <CalendarCard
          key={event.key}
          event={event}
          variant="card"
          onCommit={actions.onCommit}
        />
      ))}
    </DayCell>
  );
};

export const WeekdayHeader = ({ days }: { days: Date[] }) => (
  <div className="grid grid-cols-7 border-b border-white/5">
    {days.map((day) => (
      <div
        key={day.getTime()}
        className="py-2 text-center text-xs text-content-tinted"
      >
        {format(day, "EEE")}
      </div>
    ))}
  </div>
);
