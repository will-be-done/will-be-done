import { useEffect, useCallback, useMemo, useRef, useState } from "react";
import { addDays, format, startOfDay, subDays } from "date-fns";
import { useDispatch, useSyncSelector, useSelect } from "@will-be-done/hyperdb";
import {
  DailyList,
  dailyListsSlice,
  dailyListsProjectionsSlice,
  projectsSlice,
  appSlice,
} from "@will-be-done/slices/space";
import { cn } from "@/lib/utils.ts";
import { buildFocusKey, focusSlice } from "@/store/focusSlice.ts";
import { TaskComp } from "@/components/Task/Task.tsx";
import { useCurrentDMY } from "@/components/DaysBoard/hooks.tsx";
import { Link, useNavigate } from "@tanstack/react-router";
import { Route } from "@/routes/spaces.$spaceId.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover.tsx";
import { Calendar } from "@/components/ui/calendar.tsx";
import { ColumnListProvider } from "@/components/Focus/ParentListProvider.tsx";
import { DndModelData, isModelDNDData } from "@/lib/dnd/models";
import invariant from "tiny-invariant";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { autoScrollForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element";
import { DateViewSidebar } from "./DateViewSidebar.tsx";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar.tsx";
import { useSidebarStore } from "@/store/sidebarStore.ts";

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
  dailyListId,
  onTaskAdd,
  previousDate,
  nextDate,
}: {
  dailyListId: string;
  onTaskAdd: (dailyList: DailyList) => void;
  previousDate: Date;
  nextDate: Date;
}) => {
  const spaceId = Route.useParams().spaceId;
  const navigate = useNavigate();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const dailyList = useSyncSelector(
    () => dailyListsSlice.byIdOrDefault(dailyListId),
    [dailyListId],
  );
  const currentDate = useCurrentDMY();
  const isToday = useMemo(() => {
    return currentDate === dailyList.date;
  }, [currentDate, dailyList.date]);

  const taskIds = useSyncSelector(
    () => dailyListsProjectionsSlice.childrenIds(dailyListId),
    [dailyListId],
  );

  const doneTaskIds = useSyncSelector(
    () => dailyListsProjectionsSlice.doneChildrenIds(dailyListId),
    [dailyListId],
  );

  const select = useSelect();
  const columnRef = useRef<HTMLDivElement>(null);
  const scrollableRef = useRef<HTMLDivElement>(null);
  const [isOver, setIsOver] = useState(false);

  useEffect(() => {
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

          return select(
            appSlice.canDrop(
              dailyList.id,
              dailyList.type,
              data.modelId,
              data.modelType,
            ),
          );
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
  }, [dailyList.id, dailyList.type, select]);

  return (
    <ColumnListProvider
      focusKey={buildFocusKey(dailyList.id, dailyList.type, "DateView")}
      priority="100"
    >
      <div ref={columnRef} className="flex flex-col w-full mt-5">
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
              <div className="flex items-baseline gap-2.5 cursor-pointer transition-opacity select-none">
                <span className="text-xs text-subheader">
                  {format(dailyList.date, "dd MMM")}
                </span>
                <span
                  className={cn("uppercase text-content text-3xl font-bold", {
                    "text-accent": isToday,
                  })}
                >
                  {format(dailyList.date, "EEEE")}
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

        {/* Add task row at the top of the list */}
        <button
          type="button"
          onClick={() => onTaskAdd(dailyList)}
          className="w-full flex items-center justify-center gap-2 text-sm text-content-tinted/60 hover:text-content-tinted py-1.5 mb-3 transition-colors group cursor-pointer"
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

        <div
          ref={scrollableRef}
          className={cn("flex flex-col gap-4 w-full overflow-y-auto p-1", {})}
        >
          {taskIds.map((id, i) => (
            <TaskComp
              key={id}
              orderNumber={i.toString()}
              taskId={id}
              cardWrapperId={id}
              cardWrapperType="projection"
              alwaysShowProject
              displayLastScheduleTime
              centerScheduleDate
            />
          ))}

          {doneTaskIds.map((id, i) => (
            <TaskComp
              key={id}
              orderNumber={(taskIds.length + i).toString()}
              taskId={id}
              cardWrapperId={id}
              cardWrapperType="projection"
              alwaysShowProject
              displayLastScheduleTime
              centerScheduleDate
            />
          ))}

          {/* {taskIds.length === 0 && doneTaskIds.length === 0 && ( */}
          {/*   <div className="text-content-tinted text-sm text-center py-8"> */}
          {/*     No tasks for this day */}
          {/*   </div> */}
          {/* )} */}
        </div>
      </div>
    </ColumnListProvider>
  );
};

export const DateView = ({ selectedDate }: { selectedDate: Date }) => {
  const sidebarWidth = useSidebarStore((s) => s.width);
  const setSidebarWidth = useSidebarStore((s) => s.setWidth);
  const startingDate = useMemo(() => startOfDay(selectedDate), [selectedDate]);
  const previousDate = useMemo(() => subDays(selectedDate, 1), [selectedDate]);
  const nextDate = useMemo(() => addDays(selectedDate, 1), [selectedDate]);

  const dailyListsIds = useSyncSelector(
    () => dailyListsSlice.idsByDates([startingDate]),
    [startingDate],
  );
  const dispatch = useDispatch();
  const inboxId = useSyncSelector(() => projectsSlice.inboxProjectId(), []);

  useEffect(() => {
    dispatch(dailyListsSlice.createManyIfNotPresent([startingDate]));
  }, [dispatch, startingDate]);

  const handleAddTask = useCallback(
    (dailyList: DailyList) => {
      const task = dispatch(
        dailyListsSlice.createTaskInList(
          dailyList.id,
          inboxId,
          "prepend",
          "prepend",
        ),
      );

      dispatch(focusSlice.editByKey(buildFocusKey(task.id, "projection")));
    },
    [dispatch, inboxId],
  );

  return (
    <SidebarProvider
      defaultOpen={true}
      className="min-h-0 h-full w-full"
      width={sidebarWidth}
      onWidthChange={setSidebarWidth}
    >
      <DateViewSidebar />
      <SidebarInset className="min-h-0 bg-transparent">
        <div className="relative h-full">
          <SidebarTrigger className="absolute left-2 top-2 z-20 text-content-tinted hover:text-primary backdrop-blur-md cursor-pointer" />
          <div className="overflow-y-auto h-full">
            <div className="max-w-lg mx-auto px-4 py-4">
              {dailyListsIds[0] && (
                <SingleDayColumn
                  dailyListId={dailyListsIds[0]}
                  onTaskAdd={handleAddTask}
                  previousDate={previousDate}
                  nextDate={nextDate}
                />
              )}
            </div>
          </div>
          <div className="absolute right-0 top-0">
            <div className="flex items-center rounded-bl-lg text-[13px] bg-surface-elevated/70 backdrop-blur-md ring-1 ring-ring text-content-tinted h-8 px-3 gap-4">
              <Link
                className="transition-colors hover:text-primary"
                to="/spaces"
              >
                spaces
              </Link>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};
