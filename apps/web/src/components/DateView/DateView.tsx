import { useEffect, useCallback, useMemo, useRef, useState } from "react";
import { addDays, format, startOfDay, subDays } from "date-fns";
import { useAsyncDispatch, useAsyncSelector, useSelect } from "@will-be-done/hyperdb";
import {
  dailyListsSlice,
  dailyListsProjectionsSlice,
  projectsSlice,
  appSlice,
  type DailyList,
} from "@will-be-done/slices/space";

import { cn } from "@/lib/utils.ts";
import { buildFocusKey, useFocusStore } from "@/store/focusSlice.ts";
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
import { DndModelData, isModelDNDData } from "@/lib/dnd/models";
import invariant from "tiny-invariant";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { autoScrollForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element";

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

const SingleDayColumnComp = ({
  dailyList,
  taskIds,
  doneTaskIds,
  onTaskAdd,
  previousDate,
  nextDate,
}: {
  dailyList: DailyList;
  taskIds: string[];
  doneTaskIds: string[];
  onTaskAdd: (dailyList: DailyList) => void;
  previousDate: Date;
  nextDate: Date;
}) => {
  const spaceId = Route.useParams().spaceId;
  const navigate = useNavigate();
  const [calendarOpen, setCalendarOpen] = useState(false);

  const currentDate = useCurrentDMY();

  const select = useSelect();
  const columnRef = useRef<HTMLDivElement>(null);
  const scrollableRef = useRef<HTMLDivElement>(null);
  const [_isOver, setIsOver] = useState(false);

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
  }, [dailyList, select]);

  const isToday = currentDate === dailyList.date;

  return (
    <div
      ref={columnRef}
      data-focus-column
      data-column-model-id={dailyList.id}
      data-column-model-type={dailyList.type}
      className="flex flex-col w-full mt-6"
    >
      <div className="[app-region:drag] pointer-events-none absolute top-0 left-0 right-0 z-0 h-4" />
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
        {taskIds.map((id) => (
          <TaskComp
            key={id}
            taskId={id}
            cardWrapperId={id}
            cardWrapperType="projection"
            alwaysShowProject
            displayLastScheduleTime
            centerScheduleDate
          />
        ))}

        {doneTaskIds.map((id) => (
          <TaskComp
            key={id}
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
  );
};

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
  const dailyListResult = useAsyncSelector(
    () => dailyListsSlice.byIdOrDefault(dailyListId),
    [dailyListId],
  );
  const taskIdsResult = useAsyncSelector(
    () => dailyListsProjectionsSlice.childrenIds(dailyListId),
    [dailyListId],
  );
  const doneTaskIdsResult = useAsyncSelector(
    () => dailyListsProjectionsSlice.doneChildrenIds(dailyListId),
    [dailyListId],
  );

  if (dailyListResult.isPending || taskIdsResult.isPending || doneTaskIdsResult.isPending) return null;

  return (
    <SingleDayColumnComp
      dailyList={dailyListResult.data!}
      taskIds={taskIdsResult.data!}
      doneTaskIds={doneTaskIdsResult.data!}
      onTaskAdd={onTaskAdd}
      previousDate={previousDate}
      nextDate={nextDate}
    />
  );
};

const DateViewComp = ({
  dailyListsIds,
  inboxId,
  selectedDate,
}: {
  dailyListsIds: string[];
  inboxId: string;
  selectedDate: Date;
}) => {
  const previousDate = useMemo(() => subDays(selectedDate, 1), [selectedDate]);
  const nextDate = useMemo(() => addDays(selectedDate, 1), [selectedDate]);
  const dispatch = useAsyncDispatch();

  const handleAddTask = useCallback(
    (dailyList: DailyList) => {
      void dispatch(
        dailyListsSlice.createTaskInList(
          dailyList.id,
          inboxId,
          "prepend",
          "prepend",
        ),
      ).then((task) => {
        useFocusStore.getState().editByKey(buildFocusKey(task.id, "projection"));
      });
    },
    [dispatch, inboxId],
  );

  return (
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
  );
};

export const DateView = ({ selectedDate }: { selectedDate: Date }) => {
  const startingDate = useMemo(() => startOfDay(selectedDate), [selectedDate]);

  const dailyListsIdsResult = useAsyncSelector(
    () => dailyListsSlice.idsByDates([startingDate]),
    [startingDate],
  );
  const dispatch = useAsyncDispatch();
  const inboxIdResult = useAsyncSelector(() => projectsSlice.inboxProjectId(), []);

  useEffect(() => {
    void dispatch(dailyListsSlice.createManyIfNotPresent([startingDate]));
  }, [dispatch, startingDate]);

  if (dailyListsIdsResult.isPending || inboxIdResult.isPending) return null;

  return (
    <DateViewComp
      dailyListsIds={dailyListsIdsResult.data!}
      inboxId={inboxIdResult.data!}
      selectedDate={selectedDate}
    />
  );
};
