import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  addWeeks,
  differenceInMinutes,
  format,
  isSameDay,
  startOfDay,
  startOfWeek,
  subWeeks,
} from "date-fns";
import {
  dropTargetForElements,
  monitorForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import {
  useAsyncDispatch,
  useAsyncSelector,
  useSelectAsync,
} from "@will-be-done/hyperdb/react";
import {
  appById,
  createManyDailyListsIfNotPresent,
  DEFAULT_DAY_END_MINUTES,
  DEFAULT_DAY_START_MINUTES,
  hasTimeBlock,
  placeTaskOnCalendar,
  spacePreferences,
  taskOfModel,
  taskTemplateType,
  taskTimeBlockEnd,
  taskType,
  timedTasksForRange,
  upcomingTemplateOccurrencesInRange,
  type Task,
  type UpcomingTemplateOccurrence,
  type WorkBreak,
} from "@will-be-done/slices/space";
import { buildFocusKey, useFocusStore } from "@/store/focusSlice.ts";
import { useItemDetailsOpen } from "@/components/ItemDetails/ItemDetailsStore.ts";
import {
  calendarColumnDropData,
  isModelDNDData,
  type DndModelData,
} from "@/lib/dnd/models.ts";
import { cn } from "@/lib/utils.ts";
import { WorkdayLayer } from "./WorkdayLayer.tsx";
import { useEventDurationResize } from "./useEventDurationResize.ts";
import {
  attachTimedEventDrag,
  canDropOnTimeGrid,
  previewFromCalendarDrag,
  startsAtFromPreview,
  useLockCalendarScroll,
  type CalendarMovePreview,
} from "./calendarMove.ts";
import {
  DEFAULT_DURATION_MINUTES,
  END_HOUR,
  HOUR_HEIGHT,
  HOURS,
  SNAP_MINUTES,
  START_HOUR,
  formatClockOfDay,
  scrollTopToCenterMinutes,
} from "./timeGrid.ts";
import "./CalendarView.css";

const WEEK_STARTS_ON = 1 as const;

const ChevronLeft = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    width="5"
    height="8"
    viewBox="0 0 5 8"
  >
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
      d="M4 7 1 4l3-3"
    />
  </svg>
);

const ChevronRight = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    width="5"
    height="8"
    viewBox="0 0 5 8"
  >
    <path
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
      d="M1 1l3 3-3 3"
    />
  </svg>
);

function weekDates(weekStart: Date): number[] {
  return Array.from({ length: 7 }, (_, index) =>
    addDays(weekStart, index).getTime(),
  );
}

function blockLayout(startsAt: number, durationMinutes: number) {
  const start = new Date(startsAt);
  const minutesFromMidnight = differenceInMinutes(start, startOfDay(start));
  const minutesFromGrid = minutesFromMidnight - START_HOUR * 60;
  const duration = Math.max(SNAP_MINUTES, durationMinutes);

  return {
    top: (minutesFromGrid / 60) * HOUR_HEIGHT,
    height: (duration / 60) * HOUR_HEIGHT,
    startMinutes: minutesFromMidnight,
    startLabel: formatClockOfDay(minutesFromMidnight),
    endLabel: formatClockOfDay(minutesFromMidnight + duration),
  };
}

function eventLayout(task: Task) {
  if (!hasTimeBlock(task)) return null;
  const end = taskTimeBlockEnd(task);
  if (end == null) return null;
  return blockLayout(task.startsAt, task.durationMinutes);
}

function dayIso(day: Date) {
  return format(day, "yyyy-MM-dd");
}

function focusCalendarItem(id: string, type: string) {
  useItemDetailsOpen.getState().setOpen(true);
  useFocusStore.getState().focusByKey(buildFocusKey(id, type), true);
}

function groupUpcomingByDate(occurrences: UpcomingTemplateOccurrence[]) {
  const grouped = new Map<string, UpcomingTemplateOccurrence[]>();
  for (const occurrence of occurrences) {
    const bucket = grouped.get(occurrence.date) ?? [];
    bucket.push(occurrence);
    grouped.set(occurrence.date, bucket);
  }
  return grouped;
}

export function CalendarView() {
  const dispatch = useAsyncDispatch();
  const now = new Date();
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(now, { weekStartsOn: WEEK_STARTS_ON }),
  );
  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
    [weekStart],
  );

  const { data: tasks = [] } = useAsyncSelector({
    selector: timedTasksForRange,
    args: {
      fromInclusive: weekStart.getTime(),
      toExclusive: weekEnd.getTime(),
    },
    defaultValue: [],
  });
  const { data: upcomingOccurrences = [] } = useAsyncSelector({
    selector: upcomingTemplateOccurrencesInRange,
    args: {
      fromInclusive: weekStart.getTime(),
      toExclusive: weekEnd.getTime(),
    },
    defaultValue: [],
  });
  const { data: preferences } = useAsyncSelector({
    selector: spacePreferences,
    args: {},
  });
  const dayStartMinutes =
    preferences?.dayStartMinutes ?? DEFAULT_DAY_START_MINUTES;
  const dayEndMinutes = preferences?.dayEndMinutes ?? DEFAULT_DAY_END_MINUTES;
  const breaks = preferences?.breaks ?? [];

  const tasksByDay = useMemo(() => {
    const grouped = new Map<number, Task[]>();
    for (const day of days) grouped.set(day.getTime(), []);
    for (const task of tasks) {
      if (!hasTimeBlock(task)) continue;
      const bucket = grouped.get(startOfDay(new Date(task.startsAt)).getTime());
      if (bucket) bucket.push(task);
    }
    return grouped;
  }, [days, tasks]);

  const upcomingByDate = useMemo(
    () => groupUpcomingByDate(upcomingOccurrences),
    [upcomingOccurrences],
  );

  const hasUntimedUpcoming = upcomingOccurrences.some(
    (occurrence) => occurrence.startsAtMinutes == null,
  );

  const goToWeek = (nextStart: Date) => {
    const next = startOfWeek(nextStart, { weekStartsOn: WEEK_STARTS_ON });
    setWeekStart(next);
    void dispatch(createManyDailyListsIfNotPresent({ dates: weekDates(next) }));
  };

  const [preview, setPreview] = useState<CalendarMovePreview | null>(null);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const showNow = nowMinutes >= START_HOUR * 60 && nowMinutes < END_HOUR * 60;
  const nowTop = ((nowMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT;
  const weekLabel = `${format(weekStart, "d MMM")} - ${format(addDays(weekStart, 6), "d MMM yyyy")}`;
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scrollable = bodyRef.current;
    if (!scrollable) return;
    const midpoint = (dayStartMinutes + dayEndMinutes) / 2;
    scrollable.scrollTop = scrollTopToCenterMinutes(
      midpoint,
      scrollable.clientHeight,
    );
  }, [dayStartMinutes, dayEndMinutes, weekStart]);

  useEffect(() => {
    const scrollable = bodyRef.current;
    if (!scrollable) return;
    return monitorForElements({
      onDrop: () => setPreview(null),
    });
  }, []);

  useLockCalendarScroll(preview != null, bodyRef);

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-surface px-4 pb-4 pt-3">
      <div className="mb-3 flex shrink-0 items-center justify-center gap-3">
        <button
          type="button"
          aria-label="Previous week"
          className="flex size-7 items-center justify-center rounded-md text-content-tinted hover:bg-overlay hover:text-content"
          onClick={() => goToWeek(subWeeks(weekStart, 1))}
        >
          <ChevronLeft />
        </button>
        <h1 className="min-w-48 text-center text-sm font-medium text-content">
          {weekLabel}
        </h1>
        <button
          type="button"
          aria-label="Next week"
          className="flex size-7 items-center justify-center rounded-md text-content-tinted hover:bg-overlay hover:text-content"
          onClick={() => goToWeek(addWeeks(weekStart, 1))}
        >
          <ChevronRight />
        </button>
      </div>

      <div className="calendar-week min-h-0 flex-1 overflow-hidden rounded-xl border border-ring bg-panel">
        <div className="calendar-week__header">
          <div />
          {days.map((day) => (
            <div
              key={day.getTime()}
              className={cn(
                "calendar-week__day-label",
                isSameDay(day, now) && "calendar-week__day-label--today",
              )}
            >
              <span>{format(day, "EEE")}</span>
              <span>{format(day, "d")}</span>
            </div>
          ))}
        </div>

        {hasUntimedUpcoming && (
          <div className="calendar-week__allday">
            <div />
            {days.map((day) => (
              <div key={day.getTime()} className="calendar-week__allday-cell">
                {(upcomingByDate.get(dayIso(day)) ?? [])
                  .filter((occurrence) => occurrence.startsAtMinutes == null)
                  .map((occurrence) => (
                    <button
                      key={occurrence.id}
                      type="button"
                      className="calendar-week__allday-chip"
                      onClick={() =>
                        focusCalendarItem(
                          occurrence.templateId,
                          taskTemplateType,
                        )
                      }
                    >
                      {occurrence.title || "Untitled"}
                    </button>
                  ))}
              </div>
            ))}
          </div>
        )}

        <div ref={bodyRef} className="calendar-week__body">
          <div
            className="calendar-week__grid"
            style={{ height: HOURS * HOUR_HEIGHT }}
          >
            <div className="calendar-week__hours">
              {Array.from({ length: HOURS }, (_, index) => (
                <div
                  key={index}
                  className="calendar-week__hour"
                  style={{ height: HOUR_HEIGHT }}
                >
                  {format(new Date(2000, 0, 1, START_HOUR + index), "HH:mm")}
                </div>
              ))}
            </div>

            {days.map((day) => (
              <WeekDayColumn
                key={day.getTime()}
                day={day}
                now={now}
                showNow={showNow}
                nowTop={nowTop}
                tasks={tasksByDay.get(day.getTime()) ?? []}
                upcoming={upcomingByDate.get(dayIso(day)) ?? []}
                preview={preview}
                setPreview={setPreview}
                dayStartMinutes={dayStartMinutes}
                dayEndMinutes={dayEndMinutes}
                breaks={breaks}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function WeekDayColumn({
  day,
  now,
  showNow,
  nowTop,
  tasks,
  upcoming,
  preview,
  setPreview,
  dayStartMinutes,
  dayEndMinutes,
  breaks,
}: {
  day: Date;
  now: Date;
  showNow: boolean;
  nowTop: number;
  tasks: Task[];
  upcoming: UpcomingTemplateOccurrence[];
  preview: CalendarMovePreview | null;
  setPreview: (preview: CalendarMovePreview | null) => void;
  dayStartMinutes: number;
  dayEndMinutes: number;
  breaks: WorkBreak[];
}) {
  const columnRef = useRef<HTMLDivElement>(null);
  const select = useSelectAsync();
  const dispatch = useAsyncDispatch();
  const dayTime = day.getTime();

  useEffect(() => {
    const column = columnRef.current;
    if (!column) return;

    const previewFromLocation = (source: DndModelData, clientY: number) => {
      const next = previewFromCalendarDrag({
        source,
        clientY,
        columnTop: column.getBoundingClientRect().top,
        dayTime,
      });
      const task = tasks.find((item) => item.id === source.modelId);
      setPreview({
        ...next,
        title: source.timelineTitle ?? task?.title ?? "",
        done: source.timelineDone ?? task?.state === "done",
      });
    };

    return dropTargetForElements({
      element: column,
      getData: () => calendarColumnDropData(dayTime),
      canDrop: ({ source }) => canDropOnTimeGrid(source.data),
      getIsSticky: () => true,
      onDrag: ({ source, location }) => {
        if (!isModelDNDData(source.data)) return;
        previewFromLocation(source.data, location.current.input.clientY);
      },
      onDrop: ({ source, location }) => {
        setPreview(null);
        void (async () => {
          if (!isModelDNDData(source.data)) return;
          const entity = await select({
            selector: appById,
            args: {
              id: source.data.modelId,
              modelType: source.data.modelType,
            },
          });
          if (!entity) return;
          const task = await select({
            selector: taskOfModel,
            args: { model: entity },
          });
          if (!task) return;

          const durationMinutes =
            source.data.timelineDurationMinutes ??
            task.durationMinutes ??
            DEFAULT_DURATION_MINUTES;
          const minutes = previewFromCalendarDrag({
            source: source.data,
            clientY: location.current.input.clientY,
            columnTop: column.getBoundingClientRect().top,
            dayTime,
          }).startMinutes;
          await dispatch(
            placeTaskOnCalendar({
              taskId: task.id,
              startsAt: startsAtFromPreview(day, minutes),
              durationMinutes,
            }),
          );
        })();
      },
    });
  }, [day, dayTime, dispatch, select, setPreview, tasks]);

  const columnPreview = preview?.dayTime === dayTime ? preview : null;

  return (
    <div
      ref={columnRef}
      data-calendar-column
      className={cn(
        "calendar-week__column",
        isSameDay(day, now) && "calendar-week__column--today",
      )}
    >
      {Array.from({ length: HOURS }, (_, index) => (
        <div
          key={index}
          className="calendar-week__slot"
          style={{ height: HOUR_HEIGHT }}
        />
      ))}

      {isSameDay(day, now) && showNow && (
        <div className="calendar-week__now" style={{ top: nowTop }} />
      )}
      <WorkdayLayer
        dayStartMinutes={dayStartMinutes}
        dayEndMinutes={dayEndMinutes}
        breaks={breaks}
        boundClassName="calendar-week__bound"
        breakClassName="calendar-week__break"
      />

      {tasks.map((task) => {
        const layout = eventLayout(task);
        if (!layout) return null;
        return (
          <TimedCalendarEvent
            key={task.id}
            task={task}
            top={layout.top}
            startMinutes={layout.startMinutes}
            isOrigin={preview?.taskId === task.id}
          />
        );
      })}

      {upcoming.map((occurrence) => {
        if (occurrence.startsAtMinutes == null) return null;
        const layout = blockLayout(
          startOfDay(day).getTime() + occurrence.startsAtMinutes * 60 * 1000,
          occurrence.durationMinutes ?? 30,
        );
        return (
          <button
            key={occurrence.id}
            type="button"
            className="calendar-week__event calendar-week__event--upcoming"
            style={{ top: layout.top, height: layout.height }}
            onClick={() =>
              focusCalendarItem(occurrence.templateId, taskTemplateType)
            }
          >
            <span className="calendar-week__event-time">
              {layout.startLabel} - {layout.endLabel}
            </span>
            <span className="calendar-week__event-title">
              {occurrence.title || "Untitled"}
            </span>
          </button>
        );
      })}

      {columnPreview && (
        <div
          className={cn(
            "calendar-week__event",
            "calendar-week__event--preview",
            columnPreview.done && "calendar-week__event--done",
          )}
          style={{
            top: (columnPreview.startMinutes / 60) * HOUR_HEIGHT,
            height:
              (Math.max(SNAP_MINUTES, columnPreview.durationMinutes) / 60) *
              HOUR_HEIGHT,
          }}
        >
          <span className="calendar-week__event-time">
            {formatClockOfDay(columnPreview.startMinutes)} -{" "}
            {formatClockOfDay(
              columnPreview.startMinutes + columnPreview.durationMinutes,
            )}
          </span>
          <span className="calendar-week__event-title">
            {columnPreview.title || "Untitled"}
          </span>
        </div>
      )}
    </div>
  );
}

function TimedCalendarEvent({
  task,
  top,
  startMinutes,
  isOrigin,
}: {
  task: Task;
  top: number;
  startMinutes: number;
  isOrigin: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const dispatch = useAsyncDispatch();
  const durationMinutes = task.durationMinutes ?? 30;
  const resize = useEventDurationResize({
    startMinutes,
    durationMinutes,
    onCommit: (nextDuration) => {
      if (task.startsAt == null) return;
      void dispatch(
        placeTaskOnCalendar({
          taskId: task.id,
          startsAt: task.startsAt,
          durationMinutes: nextDuration,
        }),
      );
    },
  });
  const height =
    (Math.max(SNAP_MINUTES, resize.displayDuration) / 60) * HOUR_HEIGHT;

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    return attachTimedEventDrag(element, {
      id: task.id,
      title: task.title,
      state: task.state,
      durationMinutes,
    });
  }, [durationMinutes, task.id, task.state, task.title]);

  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        "calendar-week__event",
        task.state === "done" && "calendar-week__event--done",
        isOrigin && "calendar-week__event--origin",
      )}
      style={{ top, height }}
      onClick={() => {
        if (resize.consumeClick()) return;
        focusCalendarItem(task.id, taskType);
      }}
    >
      <span className="calendar-week__event-time">
        {formatClockOfDay(startMinutes)} -{" "}
        {formatClockOfDay(startMinutes + resize.displayDuration)}
      </span>
      <span className="calendar-week__event-title">
        {task.title || "Untitled"}
      </span>
      <div {...resize.handleProps} />
    </button>
  );
}
