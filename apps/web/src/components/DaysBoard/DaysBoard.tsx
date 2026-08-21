import { useEffect, useCallback, useRef, useState } from "react";
import { useMemo } from "react";
import { addDays, addWeeks, format, startOfDay, subWeeks } from "date-fns";
import { useAsyncDispatch } from "@will-be-done/hyperdb/react";
import { useAsyncSelector } from "@will-be-done/hyperdb/react";
import {
  createManyDailyListsIfNotPresent,
  type DailyList,
  dailyListsByDates,
  dailyEntryChildrenForDisplay,
  doneDailyEntryChildrenForDisplay,
  inboxProjectId,
} from "@will-be-done/slices/space";
import { cn } from "@/lib/utils.ts";
import { useFocusStore } from "@/store/focusSlice.ts";
import { PreloadedTaskComp } from "@/components/Task/Task.tsx";
import { AddTaskComposer } from "@/components/Task/AddTaskComposer.tsx";
import { ResizableDivider } from "./ResizableDivider.tsx";
import { NavPanel } from "./NavPanel.tsx";
import { useCurrentDMY } from "./hooks.tsx";
import { ProjectView } from "../ProjectView/ProvecjtView.tsx";
import {
  TasksColumn,
  TasksColumnGrid,
} from "@/components/TasksGrid/TasksGrid.tsx";
import { createJSONStorage, persist } from "zustand/middleware";
import { create } from "zustand";
import { Link } from "@tanstack/react-router";
import { Route } from "@/routes/spaces.$spaceId.tsx";
import {
  STASH_BUTTON_WIDTH,
  getStashOpenWidth,
  useStashOpen,
  useStashSize,
} from "./StashStore.ts";
import { ItemDetails } from "@/components/ItemDetails/ItemDetails.tsx";
import { Stash } from "@/components/Stash/Stash.tsx";
import { useGlobalListener } from "@/components/GlobalListener/hooks.tsx";
import { isInputElement } from "@/utils/isInputElement.ts";
import { useItemDetailsOpen } from "@/components/ItemDetails/ItemDetailsStore.ts";

const ColumnView = ({
  dailyList,
  inboxId,
}: {
  dailyList: DailyList;
  inboxId: string;
}) => {
  const currentDate = useCurrentDMY();
  const isToday = currentDate === dailyList.date;
  const [composerOpen, setComposerOpen] = useState(false);

  const { data: itemsForDisplay = [] } = useAsyncSelector({
    selector: dailyEntryChildrenForDisplay,
    args: { dailyListId: dailyList.id },
  });

  const { data: doneItemsForDisplay = [] } = useAsyncSelector({
    selector: doneDailyEntryChildrenForDisplay,
    args: { dailyListId: dailyList.id },
  });

  return (
    <>
      <TasksColumn
        isHidden={false}
        header={
          <div className="flex min-w-0 flex-col items-start">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "truncate text-content text-xl font-bold",
                  {
                    "text-accent": isToday,
                  },
                )}
              >
                {format(dailyList.date, "EEEE")}
              </div>
              {itemsForDisplay.length > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-content-tinted/10 px-1 text-[11px] font-semibold leading-none tabular-nums text-content-tinted/60">
                  {itemsForDisplay.length}
                </span>
              )}
            </div>
            <div className="text-xs text-subheader">
              {format(dailyList.date, "dd MMM")}
            </div>
          </div>
        }
        columnModelId={dailyList.id}
        columnModelType={dailyList.type}
        onAddClick={() => setComposerOpen(true)}
        progress={{
          done: doneItemsForDisplay.length,
          total: itemsForDisplay.length + doneItemsForDisplay.length,
        }}
      >
        <div className={cn("flex flex-col gap-4 w-full")}>
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
      <AddTaskComposer
        destination={{ type: "dailyList" }}
        defaultProjectId={inboxId}
        defaultDate={dailyList.date}
        open={composerOpen}
        onOpenChange={setComposerOpen}
      />
    </>
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
  const { data: inboxId = "" } = useAsyncSelector({
    selector: inboxProjectId,
    args: {},
  });
  const isStashOpen = useStashOpen((s) => s.isOpen);
  const setStashOpen = useStashOpen((s) => s.setOpen);
  const stashWidth = useStashSize((s) => s.width);
  const setItemDetailsOpen = useItemDetailsOpen((s) => s.setOpen);
  const [isProjectsResizing, setIsProjectsResizing] = useState(false);

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
          className={cn("relative overflow-hidden", heightTransitionClass)}
          style={{
            height: projectsViewHidden
              ? "100%"
              : `${100 - projectsViewHeight}%`,
          }}
        >
          <div className="h-full overflow-y-auto pt-10">
            <TasksColumnGrid
              paddingLeft={
                isStashOpen
                  ? getStashOpenWidth(stashWidth)
                  : STASH_BUTTON_WIDTH + 16
              }
            >
              {dailyLists.map((dailyList) => (
                <ColumnView
                  dailyList={dailyList}
                  inboxId={inboxId}
                  key={dailyList.id}
                />
              ))}
            </TasksColumnGrid>
          </div>
          <Stash />
          <NavPanel
            previousDate={previousDate}
            nextDate={nextDate}
            selectedDate={selectedDate}
            selectedProjectId={selectedProjectId}
          />
        </div>
        <div
          className={cn(
            "w-full relative",
            heightTransitionClass,
            !projectsViewHidden && "border-t border-ring",
          )}
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
  const previousDate = useMemo(() => subWeeks(selectedDate, 1), [selectedDate]);
  const nextDate = useMemo(() => addWeeks(selectedDate, 1), [selectedDate]);

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
