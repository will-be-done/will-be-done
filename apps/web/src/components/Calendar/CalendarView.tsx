import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
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
  useAsyncDispatch,
  useAsyncSelector,
} from "@will-be-done/hyperdb/react";
import {
  createManyDailyListsIfNotPresent,
  DEFAULT_DAY_END_MINUTES,
  DEFAULT_DAY_START_MINUTES,
  hasTimeBlock,
  placeTaskOnCalendar,
  spacePreferences,
  taskTimeBlockEnd,
  timedTasksForRange,
  type Task,
} from "@will-be-done/slices/space";
import { buildFocusKey, useFocusStore } from "@/store/focusSlice.ts";
import { cn } from "@/lib/utils.ts";
import { WorkdayLayer } from "./WorkdayLayer.tsx";
import {
  END_HOUR,
  HOUR_HEIGHT,
  HOURS,
  SNAP_MINUTES,
  START_HOUR,
  grabOffsetMinutes,
  scrollTopToCenterMinutes,
  startMinutesFromPointer,
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

function eventLayout(task: Task) {
  if (!hasTimeBlock(task)) return null;
  const end = taskTimeBlockEnd(task);
  if (end == null) return null;

  const start = new Date(task.startsAt);
  const minutesFromMidnight = differenceInMinutes(start, startOfDay(start));
  const minutesFromGrid = minutesFromMidnight - START_HOUR * 60;
  const duration = Math.max(SNAP_MINUTES, task.durationMinutes);

  return {
    top: (minutesFromGrid / 60) * HOUR_HEIGHT,
    height: (duration / 60) * HOUR_HEIGHT,
    startLabel: format(start, "HH:mm"),
  };
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

  const goToWeek = (nextStart: Date) => {
    const next = startOfWeek(nextStart, { weekStartsOn: WEEK_STARTS_ON });
    setWeekStart(next);
    void dispatch(createManyDailyListsIfNotPresent({ dates: weekDates(next) }));
  };

  const dropOnDay = (day: Date, event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    const taskId = event.dataTransfer.getData("text/plain");
    if (!taskId) return;

    const current = tasks.find((task) => task.id === taskId);
    const durationMinutes = current?.durationMinutes ?? 30;
    const minutes = startMinutesFromPointer({
      clientY: event.clientY,
      columnTop: event.currentTarget.getBoundingClientRect().top,
      grabOffsetMinutes: Number(
        event.dataTransfer.getData("application/x-wbd-grab"),
      ),
      durationMinutes,
    });
    const next = startOfDay(day);
    next.setMinutes(minutes);

    void dispatch(
      placeTaskOnCalendar({
        taskId,
        startsAt: next.getTime(),
        durationMinutes,
      }),
    );
  };

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
              <div
                key={day.getTime()}
                className={cn(
                  "calendar-week__column",
                  isSameDay(day, now) && "calendar-week__column--today",
                )}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => dropOnDay(day, event)}
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

                {(tasksByDay.get(day.getTime()) ?? []).map((task) => {
                  const layout = eventLayout(task);
                  if (!layout) return null;
                  return (
                    <button
                      key={task.id}
                      type="button"
                      className={cn(
                        "calendar-week__event",
                        task.state === "done" && "calendar-week__event--done",
                      )}
                      style={{ top: layout.top, height: layout.height }}
                      onClick={() =>
                        useFocusStore
                          .getState()
                          .focusByKey(buildFocusKey("task", task.id))
                      }
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData("text/plain", task.id);
                        event.dataTransfer.setData(
                          "application/x-wbd-grab",
                          String(
                            grabOffsetMinutes(
                              event.clientY,
                              event.currentTarget.getBoundingClientRect().top,
                            ),
                          ),
                        );
                        event.dataTransfer.effectAllowed = "move";
                        event.currentTarget.style.opacity = "0.12";
                      }}
                      onDragEnd={(event) => {
                        event.currentTarget.style.opacity = "";
                      }}
                    >
                      <span className="calendar-week__event-time">
                        {layout.startLabel}
                      </span>
                      <span className="calendar-week__event-title">
                        {task.title || "Untitled"}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
