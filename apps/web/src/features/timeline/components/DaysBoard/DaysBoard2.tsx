import { useState, useEffect, useCallback } from "react";
import { useMemo } from "react";
import { addDays, format, startOfDay, subDays } from "date-fns";
import { useSuggestionsStore } from "../TaskSuggestions/suggestionsStore";
import { useDispatch, useSyncSelector } from "@will-be-done/hyperdb";
import {
  DailyList,
  dailyListsSlice,
  inboxId,
  dailyListsProjections,
} from "@will-be-done/slices";
import { cn } from "@/lib/utils";
import { buildFocusKey, focusSlice2 } from "@/store2/slices/focusSlice";
import { TaskComp } from "@/components/Task/Task";
import { ResizableDivider } from "./ResizableDivider";
import { NavPanel } from "./NavPanel";
import { useCurrentDMY, useDaysPreferences, useHiddenDays } from "./hooks";
import { ProjectView } from "./ProvecjtView";
import { TasksColumn, TasksColumnGrid } from "@/components/TasksGrid/TasksGrid";
import { ScrollArea } from "@base-ui-components/react/scroll-area";
import { createJSONStorage, persist } from "zustand/middleware";
import { create } from "zustand";

const TaskProjection = ({
  projectionId,
  orderNumber,
}: {
  projectionId: string;
  orderNumber: string;
}) => {
  const projection = useSyncSelector(
    () => dailyListsProjections.byIdOrDefault(projectionId),
    [projectionId],
  );

  return (
    <>
      <TaskComp
        orderNumber={orderNumber}
        taskId={projection.taskId}
        taskBoxId={projection.id}
        alwaysShowProject
        displayLastProjectionTime={false}
      />
    </>
  );
};

const ColumnView = ({
  dailyListId,
  onTaskAdd,
  orderNumber,
}: {
  dailyListId: string;
  onTaskAdd: (dailyList: DailyList) => void;
  orderNumber: number;
}) => {
  const dailyList = useSyncSelector(
    () => dailyListsSlice.byIdOrDefault(dailyListId),
    [dailyListId],
  );
  const currentDate = useCurrentDMY();
  const isToday = useMemo(() => {
    return currentDate === dailyList.date;
  }, [currentDate, dailyList.date]);

  const projectionIds = useSyncSelector(
    () => dailyListsSlice.childrenIds(dailyListId),
    [dailyListId],
  );

  const doneProjectionIds = useSyncSelector(
    () => dailyListsSlice.doneChildrenIds(dailyListId),
    [dailyListId],
  );

  // const [isHiddenClicked, setIsHiddenClicked] = useState(false);

  const isManuallyHidden = useHiddenDays(
    (state) => state.hiddenDays[dailyListId],
  );
  const setIsHidden = useHiddenDays((state) => state.setIsHidden);
  const toggleIsHidden = useHiddenDays((state) => state.toggleIsHidden);
  const isHidden =
    isManuallyHidden ||
    (projectionIds.length == 0 && doneProjectionIds.length == 0);
  const handleHideClick = () => toggleIsHidden(dailyListId);

  const handleAddClick = () => {
    if (isHidden) {
      setIsHidden(dailyListId, false);
    }

    onTaskAdd(dailyList);
  };

  return (
    <TasksColumn
      focusKey={buildFocusKey(dailyList.id, dailyList.type, "ColumnView")}
      orderNumber={orderNumber + 100}
      isHidden={isHidden}
      onHideClick={handleHideClick}
      header={
        <>
          <div className="inline-block text-xs text-subheader mr-4">
            {format(dailyList.date, "dd MMM")}
          </div>
          <div
            className={cn("uppercase text-content text-3xl font-bold ", {
              "text-accent": isToday,
            })}
          >
            {format(dailyList.date, "EEEE")}
          </div>
        </>
      }
      columnModelId={dailyList.id}
      columnModelType={dailyList.type}
      onAddClick={handleAddClick}
    >
      <div className={cn("flex flex-col gap-4 w-full py-4")}>
        {projectionIds.map((id, i) => {
          return (
            <TaskProjection
              projectionId={id}
              key={id}
              orderNumber={i.toString()}
            />
          );
        })}

        {doneProjectionIds.map((id, i) => {
          return (
            <TaskProjection
              projectionId={id}
              key={id}
              orderNumber={(projectionIds.length + i).toString()}
            />
          );
        })}
      </div>
    </TasksColumn>
  );
};

type ProjectsViewSize = {
  projectsViewHeight: number;
  projectsViewHidden: boolean;

  setProjectsViewHeight: (value: number) => void;
  setProjectsViewHidden: (value: boolean) => void;
};

const useProjectsViewSize = create<ProjectsViewSize>()(
  persist(
    (set, get) => ({
      projectsViewHeight: 20,
      projectsViewHidden: false,
      setProjectsViewHeight: (value: number) => {
        set({ projectsViewHeight: value });
      },
      setProjectsViewHidden: (value: boolean) => {
        set({ projectsViewHidden: value });
      },
    }),
    {
      name: "projects-view-size",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

const BoardView = ({
  previousDate,
  nextDate,
  selectedDate,
  dailyListsIds,
}: {
  previousDate: Date;
  nextDate: Date;
  selectedDate: Date;
  dailyListsIds: string[];
}) => {
  const daysToShow = useDaysPreferences((state) => state.daysWindow);
  const dispatch = useDispatch();

  const handleAddTask = useCallback(
    (dailyList: DailyList) => {
      const projection = dispatch(
        dailyListsSlice.createProjectionWithTask(
          dailyList.id,
          inboxId,
          "prepend",
          "prepend",
        ),
      );

      dispatch(
        focusSlice2.editByKey(buildFocusKey(projection.id, projection.type)),
      );
    },
    [dispatch],
  );

  const {
    projectsViewHeight,
    projectsViewHidden,
    setProjectsViewHeight,
    setProjectsViewHidden,
  } = useProjectsViewSize();
  // const [projectsViewHeight, setProjectsViewHeight] = useState(20);
  // const [projectsViewHidden, setProjectsViewHidden] = useState(false);

  const handleProjectsResize = (deltaX: number) => {
    const containerHeight = window.innerHeight;
    const deltaPercentage = (deltaX / containerHeight) * 100;
    const newHeight = Math.max(
      10,
      Math.min(80, projectsViewHeight - deltaPercentage),
    );
    setProjectsViewHeight(newHeight);
  };

  const handleHideClick = () => {
    setProjectsViewHidden(!projectsViewHidden);
  };

  return (
    <>
      <div className="flex flex-col w-full">
        <div
          className="overflow-y-auto pt-10"
          style={{
            height: projectsViewHidden
              ? "100%"
              : `${100 - projectsViewHeight}%`,
          }}
        >
          {/* <ScrollArea.Root style={{ height: `${100 - height}%` }}> */}
          {/*   <ScrollArea.Viewport className="h-full overscroll-contain rounded-md w-full pr-4 pl-1"> */}
          <TasksColumnGrid columnsCount={daysToShow}>
            {dailyListsIds.map((id, i) => (
              <ColumnView
                dailyListId={id}
                onTaskAdd={handleAddTask}
                orderNumber={i}
                key={id}
              />
            ))}
          </TasksColumnGrid>
          {/* </ScrollArea.Viewport> */}
          {/* <ScrollArea.Scrollbar */}
          {/*   className="m-2 flex  h-1 justify-center rounded bg-gray-200 opacity-0 transition-opacity delay-300 pointer-events-none data-[hovering]:opacity-100 data-[hovering]:delay-0 data-[hovering]:duration-75 data-[hovering]:pointer-events-auto data-[scrolling]:opacity-100 data-[scrolling]:delay-0 data-[scrolling]:duration-75 data-[scrolling]:pointer-events-auto" */}
          {/*   orientation="horizontal" */}
          {/* > */}
          {/*   <ScrollArea.Thumb className="w-full rounded bg-gray-500" /> */}
          {/* </ScrollArea.Scrollbar> */}
          <NavPanel
            previousDate={previousDate}
            nextDate={nextDate}
            selectedDate={selectedDate}
          />
          {/* </ScrollArea.Root> */}
        </div>
        <div
          className="w-full relative"
          style={{
            height: projectsViewHidden ? "0" : `${projectsViewHeight}%`,
          }}
        >
          <ResizableDivider
            onResize={handleProjectsResize}
            onHideClick={handleHideClick}
            isHidden={projectsViewHidden}
          />

          <ProjectView exceptDailyListIds={dailyListsIds} />
        </div>
      </div>
    </>
  );
};

export const Board2 = ({ selectedDate }: { selectedDate: Date }) => {
  const daysToShow = useDaysPreferences((state) => state.daysWindow);

  const startingDate = useMemo(() => startOfDay(selectedDate), [selectedDate]);
  const previousDate = useMemo(() => subDays(selectedDate, 1), [selectedDate]);
  const nextDate = useMemo(() => addDays(selectedDate, 1), [selectedDate]);

  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        return addDays(startingDate, i);
      }).filter((_, i) => i < daysToShow),
    [startingDate, daysToShow],
  );

  const dailyListsIds = useSyncSelector(
    () => dailyListsSlice.idsByDates(weekDays),
    [weekDays],
  );
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(dailyListsSlice.createManyIfNotPresent(weekDays));
  }, [dispatch, weekDays]);

  const setExceptDailyListIds = useSuggestionsStore(
    (state) => state.setExceptDailyListIds,
  );

  useEffect(() => {
    setExceptDailyListIds(dailyListsIds);
  }, [dailyListsIds, setExceptDailyListIds]);
  return (
    <BoardView
      previousDate={previousDate}
      nextDate={nextDate}
      selectedDate={selectedDate}
      dailyListsIds={dailyListsIds}
    />
  );
};
