import { useEffect, useMemo, useState } from "react";
import { addDays, format, startOfDay, subDays } from "date-fns";
import { useAsyncDispatch, useAsyncSelector } from "@will-be-done/hyperdb/react";
import {
  createManyDailyListsIfNotPresent,
  dailyEntryChildrenForDisplay,
  dailyListsByDates,
  doneDailyEntryChildrenForDisplay,
  getDMY,
  inboxProjectId,
  isTask,
} from "@will-be-done/slices/space";
import { PreloadedTaskComp } from "@/components/Task/Task.tsx";
import { AddTaskComposer } from "@/components/Task/AddTaskComposer.tsx";
import { useCurrentDate, useCurrentDMY } from "@/components/DaysBoard/hooks.tsx";
import { cn } from "@/lib/utils.ts";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover.tsx";
import { Calendar } from "@/components/ui/calendar.tsx";
import { PomodoroTimer } from "./PomodoroTimer";
import { usePomodoroStore } from "./pomodoroStore";

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

const DailyProgress = ({
  done,
  total,
  date,
  now,
  isToday,
}: {
  done: number;
  total: number;
  date: Date;
  now: Date;
  isToday: boolean;
}) => {
  const percent =
    total === 0 ? 0 : Math.round(Math.min(100, (done / total) * 100));
  const isComplete = total > 0 && done >= total;
  const dateLabel = isToday
    ? `${format(date, "EEE, d MMM yyyy")} - ${format(now, "hh:mm a")}`
    : format(date, "EEE, d MMM yyyy");

  return (
    <div className="shrink-0 overflow-hidden rounded-xl bg-panel ring-1 ring-border">
      <div className="px-4 py-3">
        <h2 className="text-sm font-bold text-content">Daily Progress</h2>
      </div>
      <div className="h-px bg-border" />
      <div className="flex flex-col gap-3 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="rounded-md bg-accent px-1.5 py-0.5 text-xs font-semibold tabular-nums text-white shadow-sm">
              {done}/{total}
            </span>
            <span className="text-sm text-content-tinted">Tasks done</span>
          </div>
          <span className="shrink-0 text-xs text-subheader">{dateLabel}</span>
        </div>
        <div className="flex items-center gap-3">
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-label={`${done} of ${total} tasks complete`}
            className="h-2.5 flex-1 overflow-hidden rounded-full bg-overlay"
          >
            <div
              className={cn(
                "h-full rounded-full transition-[width,background-color] duration-300 ease-out",
                isComplete ? "bg-complete" : "bg-accent",
              )}
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="w-10 shrink-0 text-right text-sm font-medium tabular-nums text-content">
            {percent}%
          </span>
        </div>
      </div>
    </div>
  );
};

export const PomodoroView = () => {
  const today = useCurrentDate();
  const currentDmy = useCurrentDMY();
  const dispatch = useAsyncDispatch();
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(today));
  const selectedDay = useMemo(() => startOfDay(selectedDate), [selectedDate]);
  const previousDate = useMemo(() => subDays(selectedDay, 1), [selectedDay]);
  const nextDate = useMemo(() => addDays(selectedDay, 1), [selectedDay]);
  const isToday = currentDmy === getDMY(selectedDay);
  const selectedTaskId = usePomodoroStore((s) => s.selectedTaskId);
  const selectTask = usePomodoroStore((s) => s.selectTask);
  const [composerOpen, setComposerOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  useEffect(() => {
    void dispatch(
      createManyDailyListsIfNotPresent({
        dates: [selectedDay.getTime()],
      }),
    );
  }, [dispatch, selectedDay]);

  const { data: dailyLists = [] } = useAsyncSelector({
    selector: dailyListsByDates,
    args: { dates: [selectedDay.getTime()] },
  });
  const dailyList = dailyLists[0];

  const { data: itemsForDisplay = [] } = useAsyncSelector({
    selector: dailyEntryChildrenForDisplay,
    args: { dailyListId: dailyList?.id ?? "" },
  });
  const { data: doneItemsForDisplay = [] } = useAsyncSelector({
    selector: doneDailyEntryChildrenForDisplay,
    args: { dailyListId: dailyList?.id ?? "" },
  });
  const { data: inboxId = "" } = useAsyncSelector({
    selector: inboxProjectId,
    args: {},
  });

  const selectedTask = [...itemsForDisplay, ...doneItemsForDisplay].find(
    (displayData) => displayData.item.id === selectedTaskId,
  );

  const goToDate = (date: Date) => {
    setSelectedDate(startOfDay(date));
    selectTask(null);
  };

  return (
    <div
      id="main-scrollable-area"
      className="flex h-full w-full min-h-0 flex-col overflow-hidden pt-10"
    >
      <div className="flex h-full min-h-0 w-full flex-1 flex-col gap-6 px-6 pb-6 lg:flex-row">
        <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 lg:max-w-xl">
          <div className="flex items-center justify-between px-1">
            <button
              type="button"
              onClick={() => goToDate(previousDate)}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-content-tinted transition-colors hover:bg-surface-elevated hover:text-primary"
              aria-label="Previous day"
            >
              <ChevronLeft />
            </button>

            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex cursor-pointer flex-col items-center select-none"
                >
                  <span
                    className={cn(
                      "text-3xl font-bold leading-none text-content",
                      isToday && "text-accent",
                    )}
                  >
                    {format(selectedDay, "EEEE")}
                  </span>
                  <span className="mt-1 text-xs text-subheader">
                    {format(selectedDay, "dd MMM")}
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="center">
                <Calendar
                  mode="single"
                  selected={selectedDay}
                  onSelect={(date) => {
                    if (date) {
                      goToDate(date);
                      setCalendarOpen(false);
                    }
                  }}
                />
              </PopoverContent>
            </Popover>

            <button
              type="button"
              onClick={() => goToDate(nextDate)}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-content-tinted transition-colors hover:bg-surface-elevated hover:text-primary"
              aria-label="Next day"
            >
              <ChevronRight />
            </button>
          </div>
          <DailyProgress
            done={doneItemsForDisplay.length}
            total={itemsForDisplay.length + doneItemsForDisplay.length}
            date={selectedDay}
            now={today}
            isToday={isToday}
          />
          <div className="min-h-0 flex-1 overflow-y-auto rounded-xl bg-panel px-3 py-4 ring-1 ring-border">
            <div className="flex flex-col gap-4">
              {itemsForDisplay.map((displayData) => {
                const isSelected = displayData.item.id === selectedTaskId;
                return (
                  <div
                    key={displayData.listItem.id}
                    className={cn(
                      "rounded-xl",
                      isSelected && "bg-overlay ring-1 ring-accent",
                    )}
                    onClick={() => {
                      if (isTask(displayData.item)) {
                        selectTask(displayData.item.id);
                      }
                    }}
                  >
                    <PreloadedTaskComp
                      item={displayData.item}
                      section={displayData.section}
                      listItem={displayData.listItem}
                      project={displayData.project}
                      lastScheduleTime={displayData.lastScheduleTime}
                      hasCheclistItems={displayData.hasChecklist}
                      alwaysShowProject
                    />
                  </div>
                );
              })}

              {doneItemsForDisplay.map((displayData) => (
                <PreloadedTaskComp
                  key={displayData.listItem.id}
                  item={displayData.item}
                  section={displayData.section}
                  listItem={displayData.listItem}
                  project={displayData.project}
                  lastScheduleTime={displayData.lastScheduleTime}
                  hasCheclistItems={displayData.hasChecklist}
                  alwaysShowProject
                />
              ))}

              {dailyList && (
                <AddTaskComposer
                  destination={{ type: "dailyList" }}
                  defaultProjectId={inboxId}
                  defaultDate={dailyList.date}
                  open={composerOpen}
                  onOpenChange={setComposerOpen}
                >
                  <button
                    type="button"
                    className="flex w-full cursor-pointer items-center justify-center gap-2 py-2 text-base text-content-tinted/60 transition-colors hover:text-content-tinted"
                  >
                    Add task
                  </button>
                </AddTaskComposer>
              )}
            </div>
          </div>
        </section>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-panel ring-1 ring-border">
          <PomodoroTimer currentTaskTitle={selectedTask?.item.title} />
        </section>
      </div>
    </div>
  );
};
