import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, format, startOfDay, subDays } from "date-fns";
import { useAsyncSelector } from "@will-be-done/hyperdb/react";
import {
  type DailyList,
  dailyListsByDates,
  dailyEntryChildrenForDisplay,
  doneDailyEntryChildrenForDisplay,
  inboxProjectId,
} from "@will-be-done/slices/space";

import { cn } from "@/lib/utils.ts";
import { PreloadedTaskComp } from "@/components/Task/Task.tsx";
import { AddTaskComposer } from "@/components/Task/AddTaskComposer.tsx";
import { useCurrentDMY } from "@/components/DaysBoard/hooks.tsx";
import { Link, useNavigate } from "@tanstack/react-router";
import { Route } from "@/routes/spaces.$spaceId.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover.tsx";
import { Calendar } from "@/components/ui/calendar.tsx";
import { DndModelData, isModelDNDData } from "@/lib/dnd/models";
import invariant from "tiny-invariant";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { autoScrollForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element";
import { Stash } from "@/components/Stash/Stash.tsx";
import { useStashDesktopOffset } from "@/components/Stash/useStashDesktopOffset.ts";
import { DayTimeline } from "@/components/Calendar/DayTimeline.tsx";

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

const SingleDayColumn = ({
  dailyList,
  inboxId,
  previousDate,
  nextDate,
}: {
  dailyList: DailyList;
  inboxId: string;
  previousDate: Date;
  nextDate: Date;
}) => {
  const spaceId = Route.useParams().spaceId;
  const navigate = useNavigate();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const currentDate = useCurrentDMY();
  const isToday = currentDate === dailyList.date;

  const { data: itemsForDisplay = [] } = useAsyncSelector({
    selector: dailyEntryChildrenForDisplay,
    args: { dailyListId: dailyList.id },
  });

  const { data: doneItemsForDisplay = [] } = useAsyncSelector({
    selector: doneDailyEntryChildrenForDisplay,
    args: { dailyListId: dailyList.id },
  });

  const columnRef = useRef<HTMLDivElement>(null);
  const scrollableRef = useRef<HTMLDivElement>(null);
  const [_isOver, setIsOver] = useState(false);

  useEffect(() => {
    if (!dailyList) return;
    invariant(columnRef.current);
    invariant(scrollableRef.current);
    return combine(
      dropTargetForElements({
        element: columnRef.current,
        getData: (): DndModelData => ({
          modelId: dailyList.id,
          modelType: dailyList.type,
        }),
        canDrop: ({ source }) => {
          const data = source.data;
          if (!isModelDNDData(data)) return false;

          return true;
        },
        getIsSticky: () => true,
        onDragEnter: () => setIsOver(true),
        onDragLeave: () => setIsOver(false),
        onDragStart: () => setIsOver(true),
        onDrop: () => setIsOver(false),
      }),
      autoScrollForElements({
        element: scrollableRef.current,
        canScroll: ({ source }) => isModelDNDData(source.data),
      }),
    );
  }, [dailyList]);

  return (
    <div
      ref={columnRef}
      data-focus-column
      data-column-model-id={dailyList.id}
      data-column-model-type={dailyList.type}
      className="flex flex-col w-full mt-6"
    >
      {/* Date header with navigation arrows */}
      <div className="flex items-center justify-between mb-5">
        <Link
          to="/spaces/$spaceId/dates/$date"
          params={{
            date: format(previousDate, "yyyy-MM-dd"),
            spaceId,
          }}
          className="w-8 h-8 flex items-center justify-center rounded-md text-content-tinted hover:text-primary hover:bg-surface-elevated transition-colors"
          aria-label="Previous day"
        >
          <ChevronLeft />
        </Link>

        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <div className="flex flex-col items-center cursor-pointer transition-opacity select-none">
              <span
                className={cn("text-content text-3xl font-bold leading-none", {
                  "text-accent": isToday,
                })}
              >
                {format(dailyList.date, "EEEE")}
              </span>
              <span className="mt-1 text-xs text-subheader">
                {format(dailyList.date, "dd MMM")}
              </span>
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="center">
            <Calendar
              mode="single"
              selected={new Date(dailyList.date)}
              onSelect={(date) => {
                if (date) {
                  void navigate({
                    to: "/spaces/$spaceId/dates/$date",
                    params: {
                      spaceId,
                      date: format(date, "yyyy-MM-dd"),
                    },
                  });
                  setCalendarOpen(false);
                }
              }}
            />
          </PopoverContent>
        </Popover>

        <Link
          to="/spaces/$spaceId/dates/$date"
          params={{
            date: format(nextDate, "yyyy-MM-dd"),
            spaceId,
          }}
          className="w-8 h-8 flex items-center justify-center rounded-md text-content-tinted hover:text-primary hover:bg-surface-elevated transition-colors"
          aria-label="Next day"
        >
          <ChevronRight />
        </Link>
      </div>

      <div
        ref={scrollableRef}
        className={cn("flex flex-col gap-4 w-full overflow-y-auto p-1", {})}
      >
        {itemsForDisplay.map((displayData) => (
          <PreloadedTaskComp
            key={displayData.listItem.id}
            item={displayData.item}
            section={displayData.section}
            listItem={displayData.listItem}
            project={displayData.project}
            lastScheduleTime={displayData.lastScheduleTime}
            hasCheclistItems={displayData.hasChecklist}
            alwaysShowProject
            displayLastScheduleTime
            centerScheduleDate
          />
        ))}

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
            displayLastScheduleTime
            centerScheduleDate
          />
        ))}

        <AddTaskComposer
          destination={{ type: "dailyList" }}
          defaultProjectId={inboxId}
          defaultDate={dailyList.date}
        >
          <button
            type="button"
            className="w-full flex items-center justify-center gap-2 text-sm text-content-tinted/60 hover:text-content-tinted py-1.5 transition-colors group cursor-pointer"
          >
            <span className="w-4 h-4 rounded-full border border-current flex items-center justify-center flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
              <svg
                width="8"
                height="8"
                viewBox="0 0 8 8"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M4 1v6M1 4h6"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span>Add task</span>
          </button>
        </AddTaskComposer>
      </div>
    </div>
  );
};

export const DateView = ({ selectedDate }: { selectedDate: Date }) => {
  const startingDate = useMemo(() => startOfDay(selectedDate), [selectedDate]);
  const previousDate = useMemo(() => subDays(selectedDate, 1), [selectedDate]);
  const nextDate = useMemo(() => addDays(selectedDate, 1), [selectedDate]);
  const scrollRestorationId = useMemo(
    () => `date-view-scroll-${format(startingDate, "yyyy-MM-dd")}`,
    [startingDate],
  );

  const { data: dailyLists = [] } = useAsyncSelector({
    selector: dailyListsByDates,
    args: { dates: [startingDate.getTime()] },
  });
  const { data: inboxId = "" } = useAsyncSelector({
    selector: inboxProjectId,
    args: {},
  });
  const stashOffset = useStashDesktopOffset();

  return (
    <div className="relative h-full min-w-0 overflow-hidden">
      <Stash />
      <div
        className="flex h-full min-h-0 justify-center"
        style={{
          paddingLeft: stashOffset ? `${stashOffset}px` : undefined,
          transition: "padding-left 200ms ease-out",
        }}
      >
        <div className="flex h-full min-h-0 w-full max-w-4xl">
          <div
            data-scroll-restoration-id={scrollRestorationId}
            className="h-full w-full min-w-[280px] max-w-lg overflow-y-auto"
          >
            <div className="max-w-lg mx-auto px-4 py-4">
              {dailyLists[0] && (
                <SingleDayColumn
                  dailyList={dailyLists[0]}
                  inboxId={inboxId}
                  previousDate={previousDate}
                  nextDate={nextDate}
                />
              )}
            </div>
          </div>
          <div className="hidden h-full min-w-[260px] flex-1 md:block">
            <DayTimeline date={startingDate} />
          </div>
        </div>
      </div>
    </div>
  );
};
