import { useEffect, useMemo, useRef, useState } from "react";
import { format, isSameDay, startOfDay } from "date-fns";
import invariant from "tiny-invariant";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
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
  dailyEntryByTaskId,
  dailyEntryType,
  hasTimeBlock,
  placeTaskOnCalendar,
  taskOfModel,
  taskTemplateType,
  taskTimeBlockEnd,
  taskType,
  timedTasksForRange,
  upcomingTemplateOccurrencesInRange,
  type Task,
  spacePreferences,
  DEFAULT_DAY_START_MINUTES,
  DEFAULT_DAY_END_MINUTES,
} from "@will-be-done/slices/space";
import { buildFocusKey, useFocusStore } from "@/store/focusSlice.ts";
import { useItemDetailsOpen } from "@/components/ItemDetails/ItemDetailsStore.ts";
import {
  dayTimelineDropData,
  isModelDNDData,
  type DndModelData,
} from "@/lib/dnd/models.ts";
import { cn } from "@/lib/utils.ts";
import {
  DEFAULT_DURATION_MINUTES,
  END_HOUR,
  HOUR_HEIGHT,
  HOURS,
  START_HOUR,
  formatMinutesOfDay,
  heightForDuration,
  minutesFromMidnight,
  scrollTopToCenterMinutes,
  startMinutesFromPointer,
  topForMinutes,
} from "./timeGrid.ts";
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
import "./DayTimeline.css";

type TimelinePreview = CalendarMovePreview;

function eventStyle(task: Task, overlapIndex: number) {
  if (!hasTimeBlock(task)) return null;
  const end = taskTimeBlockEnd(task);
  if (end == null) return null;
  const start = new Date(task.startsAt);
  return {
    top: topForMinutes(minutesFromMidnight(start)),
    height: heightForDuration(task.durationMinutes),
    left: 8 + overlapIndex * 16,
    right: 8,
    startLabel: format(start, "H:mm"),
    endLabel: format(new Date(end), "H:mm"),
  };
}

function overlapIndex(task: Task, tasks: Task[]): number {
  if (!hasTimeBlock(task)) return 0;
  const end = taskTimeBlockEnd(task);
  if (end == null) return 0;
  return tasks.filter((other) => {
    if (other.id === task.id || !hasTimeBlock(other)) return false;
    const otherEnd = taskTimeBlockEnd(other);
    if (otherEnd == null) return false;
    const overlaps = task.startsAt < otherEnd && other.startsAt < end;
    if (!overlaps) return false;
    return (
      other.startsAt < task.startsAt ||
      (other.startsAt === task.startsAt && other.id < task.id)
    );
  }).length;
}

export function DayTimeline({ date }: { date: Date }) {
  const select = useSelectAsync();
  const dispatch = useAsyncDispatch();
  const gridRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<TimelinePreview | null>(null);
  const dayStart = useMemo(() => startOfDay(date), [date]);
  const dayEnd = useMemo(
    () => new Date(dayStart.getTime() + 24 * 60 * 60 * 1000),
    [dayStart],
  );

  const { data: rangedTasks = [] } = useAsyncSelector({
    selector: timedTasksForRange,
    args: {
      fromInclusive: dayStart.getTime(),
      toExclusive: dayEnd.getTime(),
    },
    defaultValue: [],
  });
  const { data: upcomingOccurrences = [] } = useAsyncSelector({
    selector: upcomingTemplateOccurrencesInRange,
    args: {
      fromInclusive: dayStart.getTime(),
      toExclusive: dayEnd.getTime(),
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

  const tasks = useMemo(
    () =>
      rangedTasks.filter(
        (task) =>
          hasTimeBlock(task) && isSameDay(new Date(task.startsAt), dayStart),
      ),
    [dayStart, rangedTasks],
  );
  const dayKey = format(dayStart, "yyyy-MM-dd");
  const upcomingForDay = useMemo(
    () =>
      upcomingOccurrences.filter((occurrence) => occurrence.date === dayKey),
    [dayKey, upcomingOccurrences],
  );
  const untimedUpcoming = upcomingForDay.filter(
    (occurrence) => occurrence.startsAtMinutes == null,
  );
  const timedUpcoming = upcomingForDay.filter(
    (occurrence) => occurrence.startsAtMinutes != null,
  );

  const now = new Date();
  const isToday = isSameDay(now, dayStart);
  const nowMinutes = minutesFromMidnight(now);
  const showNow =
    isToday &&
    nowMinutes >= START_HOUR * 60 &&
    nowMinutes < END_HOUR * 60;

  useEffect(() => {
    const scrollable = scrollRef.current;
    if (!scrollable) return;
    const midpoint = (dayStartMinutes + dayEndMinutes) / 2;
    scrollable.scrollTop = scrollTopToCenterMinutes(
      midpoint,
      scrollable.clientHeight,
    );
  }, [dayStart, dayStartMinutes, dayEndMinutes]);

  useEffect(() => {
    const grid = gridRef.current;
    const scrollable = scrollRef.current;
    if (!grid || !scrollable) return;

    const previewFromLocation = (source: DndModelData, clientY: number) => {
      const next = previewFromCalendarDrag({
        source,
        clientY,
        columnTop: grid.getBoundingClientRect().top,
        dayTime: dayStart.getTime(),
      });
      const task = tasks.find((item) => item.id === source.modelId);
      setPreview({
        ...next,
        title: source.timelineTitle ?? task?.title ?? "",
        done: source.timelineDone ?? task?.state === "done",
      });
    };

    return combine(
      dropTargetForElements({
        element: grid,
        getData: () => dayTimelineDropData,
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
            const minutes = startMinutesFromPointer({
              clientY: location.current.input.clientY,
              columnTop: grid.getBoundingClientRect().top,
              grabOffsetMinutes: source.data.timelineGrabOffsetMinutes ?? 0,
              durationMinutes,
            });
            await dispatch(
              placeTaskOnCalendar({
                taskId: task.id,
                startsAt: startsAtFromPreview(dayStart, minutes),
                durationMinutes,
              }),
            );
          })();
        },
      }),
      monitorForElements({
        onDrop: () => setPreview(null),
      }),
    );
  }, [dayStart, dispatch, select, tasks]);

  useLockCalendarScroll(preview != null, scrollRef);

  return (
    <div className="day-timeline">
      {untimedUpcoming.length > 0 && (
        <div className="day-timeline__allday">
          {untimedUpcoming.map((occurrence) => (
            <button
              key={occurrence.id}
              type="button"
              className="day-timeline__allday-chip"
              onClick={() => {
                useItemDetailsOpen.getState().setOpen(true);
                useFocusStore
                  .getState()
                  .focusByKey(
                    buildFocusKey(occurrence.templateId, taskTemplateType),
                    true,
                  );
              }}
            >
              {occurrence.title || "Untitled"}
            </button>
          ))}
        </div>
      )}
      <div ref={scrollRef} className="day-timeline__scroll">
        <div
          ref={gridRef}
          className="day-timeline__grid"
          style={{ height: HOURS * HOUR_HEIGHT }}
        >
          <div className="day-timeline__hours">
            {Array.from({ length: HOURS }, (_, index) => (
              <div
                key={index}
                className="day-timeline__hour"
                style={{ height: HOUR_HEIGHT }}
              >
                {format(new Date(2000, 0, 1, START_HOUR + index), "HH:mm")}
              </div>
            ))}
          </div>
          <div className="day-timeline__column" data-calendar-column>
            {Array.from({ length: HOURS }, (_, index) => (
              <div
                key={index}
                className="day-timeline__slot"
                style={{ height: HOUR_HEIGHT }}
              />
            ))}
            {showNow && (
              <div
                className="day-timeline__now"
                style={{ top: topForMinutes(nowMinutes) }}
              />
            )}
            <WorkdayLayer
              dayStartMinutes={dayStartMinutes}
              dayEndMinutes={dayEndMinutes}
              breaks={breaks}
              boundClassName="day-timeline__bound"
              breakClassName="day-timeline__break"
            />
            {tasks.map((task) => {
              const layout = eventStyle(task, overlapIndex(task, tasks));
              if (!layout) return null;
              return (
                <TimelineEvent
                  key={task.id}
                  task={task}
                  top={layout.top}
                  left={layout.left}
                  right={layout.right}
                  startMinutes={minutesFromMidnight(new Date(task.startsAt))}
                  startLabel={layout.startLabel}
                  isOrigin={preview?.taskId === task.id}
                />
              );
            })}
            {timedUpcoming.map((occurrence) => {
              const startMinutes = occurrence.startsAtMinutes ?? 0;
              return (
                <button
                  key={occurrence.id}
                  type="button"
                  className="day-timeline__event day-timeline__event--upcoming"
                  style={{
                    top: topForMinutes(startMinutes),
                    height: heightForDuration(occurrence.durationMinutes ?? 30),
                    left: 8,
                    right: 8,
                  }}
                  onClick={() => {
                    useItemDetailsOpen.getState().setOpen(true);
                    useFocusStore
                      .getState()
                      .focusByKey(
                        buildFocusKey(occurrence.templateId, taskTemplateType),
                        true,
                      );
                  }}
                >
                  <span className="day-timeline__event-title">
                    {occurrence.title || "Untitled"}
                  </span>
                  <span className="day-timeline__event-time">
                    {formatMinutesOfDay(startMinutes)} -{" "}
                    {formatMinutesOfDay(
                      startMinutes + (occurrence.durationMinutes ?? 30),
                    )}
                  </span>
                </button>
              );
            })}
            {preview && (
              <div
                className={cn(
                  "day-timeline__event",
                  "day-timeline__event--preview",
                  preview.done && "day-timeline__event--done",
                )}
                style={{
                  top: topForMinutes(preview.startMinutes),
                  height: heightForDuration(preview.durationMinutes),
                  left: 8,
                  right: 8,
                }}
              >
                <span className="day-timeline__event-title">
                  {preview.title || "Untitled"}
                </span>
                <span className="day-timeline__event-time">
                  {formatMinutesOfDay(preview.startMinutes)} -{" "}
                  {formatMinutesOfDay(
                    preview.startMinutes + preview.durationMinutes,
                  )}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TimelineEvent({
  task,
  top,
  left,
  right,
  startMinutes,
  startLabel,
  isOrigin,
}: {
  task: Task;
  top: number;
  left: number;
  right: number;
  startMinutes: number;
  startLabel: string;
  isOrigin: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const select = useSelectAsync();
  const dispatch = useAsyncDispatch();
  const durationMinutes = task.durationMinutes ?? DEFAULT_DURATION_MINUTES;
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

  const openDetails = () => {
    if (resize.consumeClick()) return;
    void (async () => {
      const entry = await select({
        selector: dailyEntryByTaskId,
        args: { taskId: task.id },
      });
      useItemDetailsOpen.getState().setOpen(true);
      useFocusStore
        .getState()
        .focusByKey(
          entry
            ? buildFocusKey(entry.id, dailyEntryType)
            : buildFocusKey(task.id, taskType),
          true,
        );
    })();
  };

  useEffect(() => {
    const element = ref.current;
    invariant(element);
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
        "day-timeline__event",
        task.state === "done" && "day-timeline__event--done",
        isOrigin && "day-timeline__event--origin",
      )}
      style={{
        top,
        height: heightForDuration(resize.displayDuration),
        left,
        right,
      }}
      onPointerDown={(event) => {
        if (
          event.button !== 0 ||
          (event.target instanceof Element &&
            event.target.closest("[data-calendar-resize]"))
        ) {
          return;
        }
        pointerStart.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerUp={(event) => {
        const start = pointerStart.current;
        pointerStart.current = null;
        if (!start) return;
        if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) {
          return;
        }
        openDetails();
      }}
    >
      <span className="day-timeline__event-title">
        {task.title || "Untitled"}
      </span>
      <span className="day-timeline__event-time">
        {startLabel} -{" "}
        {formatMinutesOfDay(startMinutes + resize.displayDuration)}
      </span>
      <div {...resize.handleProps} />
    </button>
  );
}
