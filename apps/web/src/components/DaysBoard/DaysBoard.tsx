import { useEffect, useCallback } from "react";
import { useMemo } from "react";
import { addDays, format, startOfDay, subDays } from "date-fns";
import { useDispatch, useSyncSelector } from "@will-be-done/hyperdb";
import {
  DailyList,
  dailyListsSlice,
  dailyListsProjectionsSlice,
  inboxId,
} from "@will-be-done/slices/space";
import { cn } from "@/lib/utils.ts";
import { buildFocusKey, focusSlice } from "@/store/focusSlice.ts";
import { TaskComp } from "@/components/Task/Task.tsx";
import { ResizableDivider } from "./ResizableDivider.tsx";
import { NavPanel } from "./NavPanel.tsx";
import { useCurrentDMY, useDaysPreferences, useHiddenDays } from "./hooks.tsx";
import { ProjectView } from "../ProjectView/ProvecjtView.tsx";
import {
  TasksColumn,
  TasksColumnGrid,
} from "@/components/TasksGrid/TasksGrid.tsx";
import { createJSONStorage, persist } from "zustand/middleware";
import { create } from "zustand";
import { Link, useNavigate } from "@tanstack/react-router";
import { Route } from "@/routes/spaces.$spaceId.tsx";
import { NavBar } from "../NavBar/NavBar.tsx";
import { authUtils } from "@/lib/auth.ts";

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

  const taskIds = useSyncSelector(
    () => dailyListsProjectionsSlice.childrenIds(dailyListId),
    [dailyListId],
  );

  const doneTaskIds = useSyncSelector(
    () => dailyListsProjectionsSlice.doneChildrenIds(dailyListId),
    [dailyListId],
  );

  // const [isHiddenClicked, setIsHiddenClicked] = useState(false);

  const isManuallyHidden = useHiddenDays(
    (state) => state.hiddenDays[dailyListId],
  );
  const setIsHidden = useHiddenDays((state) => state.setIsHidden);
  const toggleIsHidden = useHiddenDays((state) => state.toggleIsHidden);
  const isHidden =
    isManuallyHidden || (taskIds.length == 0 && doneTaskIds.length == 0);
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
        {taskIds.map((id, i) => {
          return (
            <TaskComp
              key={id}
              orderNumber={i.toString()}
              taskId={id}
              cardWrapperId={id}
              cardWrapperType="projection"
              alwaysShowProject
            />
          );
        })}

        {doneTaskIds.map((id, i) => {
          return (
            <TaskComp
              key={id}
              orderNumber={(taskIds.length + i).toString()}
              taskId={id}
              cardWrapperId={id}
              cardWrapperType="projection"
              alwaysShowProject
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
    (set) => ({
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
  selectedProjectId,
}: {
  previousDate: Date;
  nextDate: Date;
  selectedDate: Date;
  dailyListsIds: string[];
  selectedProjectId: string;
}) => {
  const daysToShow = useDaysPreferences((state) => state.daysWindow);
  const dispatch = useDispatch();

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

      dispatch(focusSlice.editByKey(buildFocusKey(task.id, task.type)));
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

  const spaceId = Route.useParams().spaceId;

  const navigate = useNavigate();
  const handleSignOutClick = () => {
    authUtils.signOut();

    void navigate({ to: "/login" });
  };

  const ProjectLink = useCallback(
    // eslint-disable-next-line react-x/no-nested-component-definitions
    ({
      children,
      projectId,
      className,
      ref,
    }: {
      children?: React.ReactNode;
      projectId: string;
      className?: string;
      ref?: React.Ref<HTMLAnchorElement>;
    }) => {
      return (
        <Link
          to="/spaces/$spaceId/timeline/$date"
          params={{
            date: format(selectedDate, "yyyy-MM-dd"),
            spaceId,
          }}
          search={{
            projectId,
          }}
          className={className}
          ref={ref}
        >
          {children}
        </Link>
      );
    },
    [selectedDate, spaceId],
  );

  console.log("projectId", selectedProjectId);

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
            selectedProjectId={selectedProjectId}
          />
          <div className="absolute left-0 top-0">
            <NavBar spaceId={spaceId} />
          </div>
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

          <ProjectView
            exceptDailyListIds={dailyListsIds}
            selectedProjectId={selectedProjectId}
            projectLink={ProjectLink}
          />
        </div>
      </div>
    </>
  );
};

export const Board = ({
  selectedDate,
  selectedProjectId,
}: {
  selectedDate: Date;
  selectedProjectId: string;
}) => {
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

  return (
    <BoardView
      previousDate={previousDate}
      nextDate={nextDate}
      selectedDate={selectedDate}
      dailyListsIds={dailyListsIds}
      selectedProjectId={selectedProjectId}
    />
  );
};
