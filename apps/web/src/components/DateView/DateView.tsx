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
import { Link } from "@tanstack/react-router";
import { Route } from "@/routes/spaces.$spaceId.tsx";
import { ColumnListProvider } from "@/components/Focus/ParentListProvider.tsx";
import { PlusIcon } from "@/components/ui/icons.tsx";
import { DndModelData, isModelDNDData } from "@/lib/dnd/models";
import invariant from "tiny-invariant";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { autoScrollForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element";
import { DateViewSidebar } from "./DateViewSidebar.tsx";

const DateNavHeader = ({
  previousDate,
  nextDate,
  selectedDate,
}: {
  previousDate: Date;
  nextDate: Date;
  selectedDate: Date;
}) => {
  const spaceId = Route.useParams().spaceId;

  return (
    <div className="top-0 absolute m-auto left-0 right-0 max-w-xl z-40">
      <div className="bg-surface-elevated w-full mx-5 rounded-b-lg text-[13px] text-content flex items-center relative h-8 stroke-content ring-1 ring-ring">
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 h-full">
          <Link
            to="/spaces/$spaceId/dates/$date"
            params={{
              date: format(previousDate, "yyyy-MM-dd"),
              spaceId,
            }}
            className="cursor-pointer w-6 flex items-center justify-center h-full text-content-tinted hover:text-primary transition-colors"
            aria-label="Previous day"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              width="4"
              height="6"
              viewBox="0 0 4 6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 5.5.5 3 3 .5"
              />
            </svg>
          </Link>
          <span className="font-medium">
            {format(selectedDate, "dd MMM yyyy")}
          </span>
          <Link
            to="/spaces/$spaceId/dates/$date"
            params={{
              date: format(nextDate, "yyyy-MM-dd"),
              spaceId,
            }}
            className="cursor-pointer w-6 flex items-center justify-center h-full text-content-tinted hover:text-primary transition-colors"
            aria-label="Next day"
          >
            <svg
              width="4"
              height="6"
              viewBox="0 0 4 6"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M0.5 0.499999L3 3L0.5 5.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  );
};

const SingleDayColumn = ({
  dailyListId,
  onTaskAdd,
}: {
  dailyListId: string;
  onTaskAdd: (dailyList: DailyList) => void;
}) => {
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
      <div ref={columnRef} className="flex flex-col w-full">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-baseline gap-3">
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
          <button
            className="cursor-pointer text-content-tinted hover:text-primary transition-colors"
            onClick={() => onTaskAdd(dailyList)}
            type="button"
          >
            <PlusIcon />
          </button>
        </div>
        <div
          ref={scrollableRef}
          className={cn("flex flex-col gap-4 w-full overflow-y-auto", {
            "ring-2 ring-accent rounded-lg": isOver,
          })}
        >
          {taskIds.map((id, i) => (
            <TaskComp
              key={id}
              orderNumber={i.toString()}
              taskId={id}
              cardWrapperId={id}
              cardWrapperType="projection"
              alwaysShowProject
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
            />
          ))}

          {taskIds.length === 0 && doneTaskIds.length === 0 && (
            <div className="text-content-tinted text-sm text-center py-8">
              No tasks for this day
            </div>
          )}
        </div>
      </div>
    </ColumnListProvider>
  );
};

export const DateView = ({ selectedDate }: { selectedDate: Date }) => {
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

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const handleProjectSelect = useCallback((projectId: string) => {
    setSelectedProjectId((prev) => (prev === projectId ? null : projectId));
  }, []);

  return (
    <div className="flex w-full h-full">
      <DateViewSidebar
        selectedProjectId={selectedProjectId}
        onProjectSelect={handleProjectSelect}
      />
      <div className="flex flex-col flex-1 min-w-0 relative">
        <div className="overflow-y-auto pt-10 h-full">
          <div className="max-w-lg mx-auto px-4 py-4">
            {dailyListsIds[0] && (
              <SingleDayColumn
                dailyListId={dailyListsIds[0]}
                onTaskAdd={handleAddTask}
              />
            )}
          </div>
          <DateNavHeader
            previousDate={previousDate}
            nextDate={nextDate}
            selectedDate={selectedDate}
          />
          <div className="absolute right-0 top-0">
            <div className="flex items-center rounded-bl-lg text-[13px] bg-surface-elevated ring-1 ring-ring text-content-tinted h-8 px-3 gap-4">
              <Link
                className="transition-colors hover:text-primary"
                to="/spaces"
              >
                spaces
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
