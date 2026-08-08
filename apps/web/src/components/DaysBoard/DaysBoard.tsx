import { useEffect, useCallback, useRef, useState } from "react";
import { useMemo } from "react";
import { addDays, format, startOfDay, subDays } from "date-fns";
import { useAsyncDispatch, useSelectAsync } from "@will-be-done/hyperdb/react";
import { useAsyncSelector } from "@will-be-done/hyperdb/react";
import {
  createManyDailyListsIfNotPresent,
  createTaskInList,
  type DailyList,
  dailyListsByDates,
  dailyEntryChildrenForDisplay,
  dailyEntryByTaskId,
  doneDailyEntryChildrenForDisplay,
  dailyEntryType,
  inboxProjectId,
} from "@will-be-done/slices/space";
import { cn } from "@/lib/utils.ts";
import { buildFocusKey, useFocusStore } from "@/store/focusSlice.ts";
import { PreloadedTaskComp } from "@/components/Task/Task.tsx";
import { ResizableDivider } from "./ResizableDivider.tsx";
import { NavPanel } from "./NavPanel.tsx";
import { useCurrentDMY, useHiddenDays } from "./hooks.tsx";
import { ProjectView } from "../ProjectView/ProvecjtView.tsx";
import {
  TasksColumn,
  TasksColumnGrid,
} from "@/components/TasksGrid/TasksGrid.tsx";
import { createJSONStorage, persist } from "zustand/middleware";
import { create } from "zustand";
import { Link } from "@tanstack/react-router";
import { Route } from "@/routes/spaces.$spaceId.tsx";
import { getStashOpenWidth, useStashOpen, useStashSize } from "./StashStore.ts";
import { ItemDetails } from "@/components/ItemDetails/ItemDetails.tsx";
import { Stash } from "@/components/Stash/Stash.tsx";
import { useGlobalListener } from "@/components/GlobalListener/hooks.tsx";
import { isInputElement } from "@/utils/isInputElement.ts";
import { useItemDetailsOpen } from "@/components/ItemDetails/ItemDetailsStore.ts";

const ColumnView = ({
  dailyList,
  onTaskAdd,
}: {
  dailyList: DailyList;
  onTaskAdd: (dailyList: DailyList) => void;
}) => {
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

  // const [isHiddenClicked, setIsHiddenClicked] = useState(false);

  const isManuallyHidden = useHiddenDays(
    (state) => state.hiddenDays[dailyList.id],
  );
  const setIsHidden = useHiddenDays((state) => state.setIsHidden);
  const toggleIsHidden = useHiddenDays((state) => state.toggleIsHidden);
  const isHidden =
    isManuallyHidden ||
    (itemsForDisplay.length == 0 && doneItemsForDisplay.length == 0);
  const handleHideClick = () => toggleIsHidden(dailyList.id);

  const handleAddClick = () => {
    if (isHidden) {
      setIsHidden(dailyList.id, false);
    }

    onTaskAdd(dailyList);
  };

  return (
    <TasksColumn
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
          <span
            className="flex items-center justify-center w-5 h-5 rounded-full bg-content-tinted/10 text-[11px] font-semibold tabular-nums text-content-tinted/60 leading-none self-center"
            style={{
              writingMode: "horizontal-tb",
              textOrientation: "initial",
              transform: "rotate(180deg)",
            }}
          >
            {itemsForDisplay.length > 0 ? itemsForDisplay.length : ""}
          </span>
        </>
      }
      columnModelId={dailyList.id}
      columnModelType={dailyList.type}
      onAddClick={handleAddClick}
    >
      <div className={cn("flex flex-col gap-4 w-full py-4")}>
        {itemsForDisplay.map((displayData) => {
          return (
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
          );
        })}

        {doneItemsForDisplay.map((displayData) => {
          return (
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
  dailyLists,
  selectedProjectId,
}: {
  previousDate: Date;
  nextDate: Date;
  selectedDate: Date;
  dailyLists: DailyList[];
  selectedProjectId: string;
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const dispatch = useAsyncDispatch();
  const select = useSelectAsync();
  const { data: inboxId = "" } = useAsyncSelector({
    selector: inboxProjectId,
    args: {},
  });
  const isStashOpen = useStashOpen((s) => s.isOpen);
  const setStashOpen = useStashOpen((s) => s.setOpen);
  const stashWidth = useStashSize((s) => s.width);
  const setItemDetailsOpen = useItemDetailsOpen((s) => s.setOpen);
  const [isProjectsResizing, setIsProjectsResizing] = useState(false);

  const handleAddTask = useCallback(
    (dailyList: DailyList) => {
      void (async () => {
        const task = await dispatch(
          createTaskInList({
            dailyListId: dailyList.id,
            projectId: inboxId,
            listPosition: "prepend",
            sectionPosition: "prepend",
          }),
        );

        const entry = await select({
          selector: dailyEntryByTaskId,
          args: { taskId: task.id },
        });
        if (!entry) return;

        useFocusStore
          .getState()
          .editByKey(buildFocusKey(entry.id, dailyEntryType));
      })();
    },
    [dispatch, inboxId, select],
  );

  const {
    projectsViewHeight,
    projectsViewHidden,
    setProjectsViewHeight,
    setProjectsViewHidden,
  } = useProjectsViewSize();
  // const [projectsViewHeight, setProjectsViewHeight] = useState(20);
  // const [projectsViewHidden, setProjectsViewHidden] = useState(false);

  const handleProjectsResize = useCallback(
    (clientY: number) => {
      const rootRect = rootRef.current?.getBoundingClientRect();
      if (!rootRect) {
        return;
      }

      const heightPercentage =
        ((rootRect.bottom - clientY) / rootRect.height) * 100;

      const newHeight = Math.max(10, Math.min(80, heightPercentage));
      setProjectsViewHeight(newHeight);
    },
    [setProjectsViewHeight],
  );

  const handleHideClick = () => {
    setProjectsViewHidden(!projectsViewHidden);
  };

  useGlobalListener("keydown", (e: KeyboardEvent) => {
    const focusState = useFocusStore.getState();
    const noModifiers = !(e.shiftKey || e.ctrlKey || e.metaKey || e.altKey);

    if (
      !noModifiers ||
      focusState.isFocusDisabled ||
      !!focusState.editItemKey ||
      e.defaultPrevented
    ) {
      return;
    }

    const target =
      e.target instanceof Element ? e.target : document.activeElement;
    if (target && isInputElement(target)) return;

    if (e.code === "KeyP") {
      e.preventDefault();
      setProjectsViewHidden(!projectsViewHidden);
    } else if (e.code === "KeyZ") {
      e.preventDefault();
      setStashOpen(false);
      setItemDetailsOpen(false);
      setProjectsViewHidden(true);
    }
  });

  const heightTransitionClass = isProjectsResizing
    ? "transition-none"
    : "transition-[height] duration-300 ease-out";

  const spaceId = Route.useParams().spaceId;

  // const navigate = useNavigate();
  // const handleSignOutClick = () => {
  //   authUtils.signOut();
  //
  //   void navigate({ to: "/login" });
  // };

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

  return (
    <div className="flex h-full w-full">
      <div ref={rootRef} className="flex flex-col h-full flex-1 min-w-0">
        <div
          className={cn("overflow-y-auto pt-10", heightTransitionClass)}
          style={{
            height: projectsViewHidden
              ? "100%"
              : `${100 - projectsViewHeight}%`,
          }}
        >
          <TasksColumnGrid
            columnsCount={7}
            floatingColumn={<Stash />}
            paddingLeft={isStashOpen ? getStashOpenWidth(stashWidth) : 32}
          >
            {dailyLists.map((dailyList) => (
              <ColumnView
                dailyList={dailyList}
                onTaskAdd={handleAddTask}
                key={dailyList.id}
              />
            ))}
          </TasksColumnGrid>
          <NavPanel
            previousDate={previousDate}
            nextDate={nextDate}
            selectedDate={selectedDate}
            selectedProjectId={selectedProjectId}
          />
        </div>
        <div
          className={cn("w-full relative", heightTransitionClass)}
          style={{
            height: projectsViewHidden ? "0" : `${projectsViewHeight}%`,
          }}
        >
          <ResizableDivider
            onResizePosition={handleProjectsResize}
            onResizeStart={() => setIsProjectsResizing(true)}
            onResizeEnd={() => setIsProjectsResizing(false)}
            onHideClick={handleHideClick}
            isHidden={projectsViewHidden}
          />

          <div className="absolute inset-0 overflow-hidden">
            <div
              aria-hidden={projectsViewHidden}
              className={cn(
                "h-full transition-transform duration-300 ease-out",
                projectsViewHidden
                  ? "translate-y-6 pointer-events-none"
                  : "translate-y-0",
              )}
            >
              <ProjectView
                selectedProjectId={selectedProjectId}
                projectLink={ProjectLink}
                selectedDate={selectedDate}
              />
            </div>
          </div>
        </div>
      </div>

      <ItemDetails />
    </div>
  );
};

export const Board = ({
  selectedDate,
  selectedProjectId,
}: {
  selectedDate: Date;
  selectedProjectId: string;
}) => {
  const startingDate = useMemo(() => startOfDay(selectedDate), [selectedDate]);
  const previousDate = useMemo(() => subDays(selectedDate, 1), [selectedDate]);
  const nextDate = useMemo(() => addDays(selectedDate, 1), [selectedDate]);

  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        return addDays(startingDate, i);
      }),
    [startingDate],
  );

  const { data: dailyLists = [] } = useAsyncSelector({
    selector: dailyListsByDates,
    args: { dates: weekDays.map((date) => date.getTime()) },
  });
  const dispatch = useAsyncDispatch();

  useEffect(() => {
    void dispatch(
      createManyDailyListsIfNotPresent({
        dates: weekDays.map((date) => date.getTime()),
      }),
    );
  }, [dispatch, weekDays]);

  return (
    <BoardView
      previousDate={previousDate}
      nextDate={nextDate}
      selectedDate={selectedDate}
      dailyLists={dailyLists}
      selectedProjectId={selectedProjectId}
    />
  );
};
