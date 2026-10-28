import { format, isSameMonth } from "date-fns";
import { getDMY } from "@will-be-done/slices/space";
import { cn } from "@/lib/utils.ts";
import { type CalendarEvent } from "./calendarModel";
import { type DragCommit, useIsDropTarget } from "./calendarDrag";
import { CalendarCard } from "./CalendarCard";

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
    <div
      data-calendar-date={date}
      data-focus-column
      onClick={(e) => {
        if (e.target === e.currentTarget) onCreate(date, null);
      }}
      className={cn(
        "flex min-h-0 min-w-0 flex-col gap-1 border-b border-r border-white/5 p-1.5",
        isToday && "bg-accent/[0.04]",
        isDropTarget && "bg-accent/10",
        className,
      )}
    >
      {children}
    </div>
  );
};

const monthChipLimit = 3;

export const MonthCell = ({
  day,
  anchor,
  today,
  events,
  actions,
}: {
  day: Date;
  anchor: Date;
  today: string;
  events: CalendarEvent[];
  actions: DayActions;
}) => {
  const date = getDMY(day);
  const overflows = events.length > monthChipLimit;
  const shown = overflows ? events.slice(0, monthChipLimit - 1) : events;

  return (
    <DayCell date={date} isToday={date === today} onCreate={actions.onCreate}>
      <div className="pointer-events-none flex items-center justify-between">
        <DayNumber
          label={format(day, "d")}
          isToday={date === today}
          isMuted={!isSameMonth(day, anchor)}
        />
      </div>
      {shown.map((event) => (
        <CalendarCard
          key={event.key}
          event={event}
          variant="chip"
          onCommit={actions.onCommit}
        />
      ))}
      {overflows && (
        <button
          type="button"
          onClick={() => actions.onOpenDay(day)}
          className="self-start rounded px-1.5 text-xs text-content-tinted hover:bg-white/5 hover:text-content cursor-pointer"
        >
          +{events.length - shown.length} more
        </button>
      )}
    </DayCell>
  );
};

export const PlanCell = ({
  day,
  today,
  events,
  actions,
}: {
  day: Date;
  today: string;
  events: CalendarEvent[];
  actions: DayActions;
}) => {
  const date = getDMY(day);
  return (
    <DayCell
      date={date}
      isToday={date === today}
      onCreate={actions.onCreate}
      className="gap-1.5 overflow-y-auto"
    >
      <div className="pointer-events-none flex">
        <DayNumber label={format(day, "MMM d")} isToday={date === today} />
      </div>
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
