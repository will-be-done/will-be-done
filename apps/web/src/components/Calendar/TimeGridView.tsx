import { useEffect, useLayoutEffect, useRef } from "react";
import { autoScrollForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element";
import { format } from "date-fns";
import { getDMY } from "@will-be-done/slices/space";
import { cn } from "@/lib/utils.ts";
import { formatDuration, formatTaskTime } from "@/lib/taskTime.ts";
import { useFocusStore } from "@/store/focusSlice.ts";
import { useCurrentDate } from "@/components/DaysBoard/hooks.tsx";
import { useItemDetailsOpen } from "@/components/ItemDetails/ItemDetailsStore.ts";
import {
  type CalendarEvent,
  blockMinutes,
  isDraggable,
  minBlockMinutes,
  layoutTimedEvents,
  minutesInDay,
  minutesToTime,
  snapMinutes,
  timeToMinutes,
} from "./calendarModel";
import {
  startCalendarDrag,
  useCalendarDrag,
  useIsDropTarget,
} from "./calendarDrag";
import { CalendarCard } from "./CalendarCard";
import { cardClass } from "./styles";
import { type DayActions } from "./DayCells";

const hourHeight = 48;
const gutterWidth = "4.5rem";
const hours = Array.from({ length: 24 }, (_, i) => i);

const percent = (minutes: number) => `${(minutes / minutesInDay) * 100}%`;

const blockHeight = (start: number, length: number) =>
  percent(Math.min(Math.max(length, minBlockMinutes), minutesInDay - start));

const minutesLabel = (start: number, length: number) =>
  `${formatTaskTime(minutesToTime(start))} – ${formatTaskTime(
    minutesToTime(Math.min(minutesInDay - 1, start + length)),
  )}`;

export const TimeGridView = ({
  days,
  today,
  eventsByDate,
  actions,
}: {
  days: Date[];
  today: string;
  eventsByDate: Map<string, CalendarEvent[]>;
  actions: DayActions;
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const columns = `${gutterWidth} repeat(${days.length}, minmax(0, 1fr))`;

  // Open around the current hour, or the start of a working day.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const now = new Date();
    const hasToday = days.some((day) => getDMY(day) === today);
    const hour = hasToday ? Math.max(0, now.getHours() - 1) : 7;
    el.scrollTop = hour * hourHeight;
    // Only on mount and when switching between day and week.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days.length]);

  // Scroll while dragging a task in from the projects view.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    return autoScrollForElements({ element: el });
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className="grid overflow-y-hidden border-b border-white/5 [scrollbar-gutter:stable]"
        style={{ gridTemplateColumns: columns }}
      >
        <div />
        {days.map((day) => {
          const date = getDMY(day);
          return (
            <div
              key={date}
              className="flex items-center justify-between gap-2 px-2 pt-2 pb-1"
            >
              <button
                type="button"
                onClick={() => actions.onOpenDay(day)}
                className="flex items-baseline gap-1.5 cursor-pointer"
              >
                <span className="text-xs text-content-tinted">
                  {format(day, "EEE")}
                </span>
                <span
                  className={cn(
                    "rounded-full px-1.5 text-sm tabular-nums",
                    date === today
                      ? "bg-accent font-semibold text-white"
                      : "text-content",
                  )}
                >
                  {format(day, "d")}
                </span>
              </button>
            </div>
          );
        })}
        <div className="self-center pr-2 text-right text-[10px] uppercase text-content-tinted/60">
          all-day
        </div>
        {days.map((day) => {
          const date = getDMY(day);
          return (
            <UntimedCell
              key={date}
              date={date}
              events={(eventsByDate.get(date) ?? []).filter(
                (e) => e.time === null,
              )}
              actions={actions}
            />
          );
        })}
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]"
      >
        <div
          className="relative grid"
          style={{
            gridTemplateColumns: columns,
            height: hourHeight * 24,
          }}
        >
          <div className="relative">
            {hours.map((hour) =>
              hour === 0 ? null : (
                <div
                  key={hour}
                  className="absolute right-2 -translate-y-1/2 whitespace-nowrap text-[10px] tabular-nums text-content-tinted/60"
                  style={{ top: hour * hourHeight }}
                >
                  {formatTaskTime(minutesToTime(hour * 60))}
                </div>
              ),
            )}
          </div>
          {days.map((day) => {
            const date = getDMY(day);
            return (
              <GridColumn
                key={date}
                date={date}
                isToday={date === today}
                events={(eventsByDate.get(date) ?? []).filter(
                  (e) => e.time !== null,
                )}
                actions={actions}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};

const UntimedCell = ({
  date,
  events,
  actions,
}: {
  date: string;
  events: CalendarEvent[];
  actions: DayActions;
}) => {
  const isDropTarget = useIsDropTarget(date, null);
  return (
    <div
      data-calendar-date={date}
      data-calendar-untimed
      data-focus-column
      onClick={(e) => {
        if (e.target === e.currentTarget) actions.onCreate(date, null);
      }}
      className={cn(
        "flex max-h-32 min-h-9 min-w-0 flex-col gap-1 overflow-y-auto border-l border-white/5 p-1",
        isDropTarget && "bg-accent/10",
      )}
    >
      {events.map((event) => (
        <CalendarCard
          key={event.key}
          event={event}
          variant="chip"
          inTimeView
          onCommit={actions.onCommit}
        />
      ))}
    </div>
  );
};

const GridColumn = ({
  date,
  isToday,
  events,
  actions,
}: {
  date: string;
  isToday: boolean;
  events: CalendarEvent[];
  actions: DayActions;
}) => {
  const layout = layoutTimedEvents(events);
  const draggedKey = useCalendarDrag((s) => s.drag?.event.key);
  // Only re-render the column the dragged block hovers.
  const drag = useCalendarDrag((s) =>
    s.drag?.target?.date === date && s.drag.target.time ? s.drag : null,
  );
  const preview = drag?.target?.time
    ? {
        title: drag.event.title,
        start: timeToMinutes(drag.target.time),
        length: drag.durationMinutes,
        // Resizing shows the new duration; a move keeps the task's own.
        durationMinutes:
          drag.mode === "resize"
            ? drag.durationMinutes
            : drag.event.durationMinutes,
      }
    : null;

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const minutes = ((e.clientY - rect.top) / rect.height) * minutesInDay;
    const slot = Math.floor(minutes / (snapMinutes * 2)) * snapMinutes * 2;
    actions.onCreate(date, minutesToTime(slot));
  };

  return (
    <div
      data-calendar-date={date}
      data-calendar-grid
      data-focus-column
      onClick={handleClick}
      className={cn(
        "relative border-l border-white/5",
        isToday && "bg-accent/[0.03]",
      )}
      style={{
        backgroundImage: `linear-gradient(to bottom, rgb(255 255 255 / 0.05) 1px, transparent 1px)`,
        backgroundSize: `100% ${hourHeight}px`,
      }}
    >
      {events.map((event) => (
        <TimedBlock
          key={event.key}
          event={event}
          layout={layout.get(event.key) ?? { column: 0, columns: 1 }}
          isDragged={draggedKey === event.key}
          actions={actions}
        />
      ))}

      {preview && (
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0.5 z-20 overflow-hidden rounded-md border border-accent bg-accent/25 px-1.5 py-0.5 text-xs text-content",
            isShortBlock(preview.length) && "flex items-baseline gap-1.5",
          )}
          style={{
            top: percent(preview.start),
            height: blockHeight(preview.start, preview.length),
          }}
        >
          <BlockContent
            title={preview.title}
            start={preview.start}
            length={preview.length}
            durationMinutes={preview.durationMinutes}
          />
        </div>
      )}

      {isToday && <NowLine />}
    </div>
  );
};

const TimedBlock = ({
  event,
  layout,
  isDragged,
  actions,
}: {
  event: CalendarEvent;
  layout: { column: number; columns: number };
  isDragged: boolean;
  actions: DayActions;
}) => {
  const isFocused = useFocusStore((s) => s.focusItemKey === event.focusKey);
  const start = timeToMinutes(event.time!);
  const length = Math.min(blockMinutes(event), minutesInDay - start);
  const isShort = isShortBlock(length);

  return (
    <div
      role="button"
      tabIndex={0}
      data-focusable-key={event.focusKey}
      title={event.title}
      onClick={() => useItemDetailsOpen.getState().setOpen(true)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          useItemDetailsOpen.getState().setOpen(true);
        }
      }}
      onPointerDown={(e) =>
        startCalendarDrag(e, event, "move", actions.onCommit)
      }
      className={cn(
        cardClass(event, isFocused, isDraggable(event)),
        "absolute z-10 overflow-hidden px-1.5 py-0.5 text-xs",
        isShort && "flex items-baseline gap-1.5",
        isDragged && "opacity-40",
      )}
      style={{
        top: percent(start),
        height: blockHeight(start, length),
        left: `calc(${(layout.column / layout.columns) * 100}% + 2px)`,
        width: `calc(${100 / layout.columns}% - 4px)`,
      }}
    >
      <BlockContent
        title={event.title}
        start={start}
        length={length}
        durationMinutes={event.durationMinutes}
        isDone={event.isDone}
      />
      {isDraggable(event) && (
        <div
          aria-hidden
          onPointerDown={(e) =>
            startCalendarDrag(e, event, "resize", actions.onCommit)
          }
          className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize"
        />
      )}
    </div>
  );
};

const isShortBlock = (length: number) => length < 45;

// Shared by blocks and the drag preview. Short blocks fit one line, time
// first so it stays visible however long the title is.
const BlockContent = ({
  title,
  start,
  length,
  durationMinutes,
  isDone = false,
}: {
  title: string;
  start: number;
  length: number;
  durationMinutes: number | null;
  isDone?: boolean;
}) => {
  const titleNode = (
    <div
      className={cn("min-w-0 truncate font-medium", isDone && "line-through")}
    >
      {title}
    </div>
  );

  if (isShortBlock(length)) {
    return (
      <>
        <div className="shrink-0 tabular-nums text-content-tinted">
          {formatTaskTime(minutesToTime(start))}
        </div>
        {titleNode}
      </>
    );
  }

  return (
    <>
      {titleNode}
      <div className="truncate tabular-nums text-content-tinted">
        {minutesLabel(start, length)}
        {durationMinutes ? ` · ${formatDuration(durationMinutes)}` : ""}
      </div>
    </>
  );
};

const NowLine = () => {
  const now = useCurrentDate();
  const minutes = now.getHours() * 60 + now.getMinutes();
  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-30 h-px bg-rose-500"
      style={{ top: percent(minutes) }}
    >
      <div className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-rose-500" />
    </div>
  );
};
