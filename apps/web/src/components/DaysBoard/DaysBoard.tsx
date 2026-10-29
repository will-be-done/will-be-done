import { useEffect, useCallback } from "react";
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
  parseDMY,
  type TaskTemplateOccurrence,
} from "@will-be-done/slices/space";
import { cn } from "@/lib/utils.ts";
import { buildFocusKey, useFocusStore } from "@/store/focusSlice.ts";
import { PreloadedTaskComp } from "@/components/Task/Task.tsx";
import { ProjectedTaskCard } from "@/components/Task/ProjectedTaskCard.tsx";
import { useUpcomingOccurrences } from "@/components/Task/useUpcomingOccurrences.ts";
import { NavPanel } from "./NavPanel.tsx";
import { useCurrentDMY, useHiddenDays } from "./hooks.tsx";
import { ProjectsSplit } from "../ProjectView/ProjectsSplit.tsx";
import { useProjectsViewSize } from "../ProjectView/ProjectsViewStore.ts";
import {
  TasksColumn,
  TasksColumnGrid,
} from "@/components/TasksGrid/TasksGrid.tsx";
import { Link } from "@tanstack/react-router";
import { Route } from "@/routes/spaces.$spaceId.tsx";
import { getStashOpenWidth, useStashOpen, useStashSize } from "./StashStore.ts";
import { ItemDetails } from "@/components/ItemDetails/ItemDetails.tsx";
import { Stash } from "@/components/Stash/Stash.tsx";
import { useGlobalListener } from "@/components/GlobalListener/hooks.tsx";
import { isInputElement } from "@/utils/isInputElement.ts";
import { useItemDetailsOpen } from "@/components/ItemDetails/ItemDetailsStore.ts";
import { captureWebAnalytics } from "@/lib/analytics";

const ColumnView = ({
  dailyList,
  occurrences,
  onTaskAdd,
}: {
  dailyList: DailyList;
  occurrences: TaskTemplateOccurrence[];
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
    (itemsForDisplay.length == 0 &&
      doneItemsForDisplay.length == 0 &&
      occurrences.length == 0);
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
            {format(parseDMY(dailyList.date), "dd MMM")}
          </div>
          <div
            className={cn("uppercase text-content text-3xl font-bold ", {
              "text-accent": isToday,
            })}
          >
            {format(parseDMY(dailyList.date), "EEEE")}
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
        {occurrences.map((occurrence) => (
          <ProjectedTaskCard
            key={occurrence.id}
            occurrence={occurrence}
            onAddTask={handleAddClick}
          />
        ))}

        {itemsForDisplay.map((displayData) => {
          return (
            <PreloadedTaskComp
              key={displayData.listItem.id}
              item={displayData.item}
              section={displayData.section}
              listItem={displayData.listItem}
              project={displayData.project}
              lastScheduleTime={displayData.lastScheduleTime}
              scheduledTime={displayData.scheduledTime}
              dailyListId={displayData.dailyList?.id}
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
              scheduledTime={displayData.scheduledTime}
              dailyListId={displayData.dailyList?.id}
              hasCheclistItems={displayData.hasChecklist}
              alwaysShowProject
            />
          );
        })}
      </div>
    </TasksColumn>
  );
};

const BoardView = ({
  previousDate,
  nextDate,
  selectedDate,
  dailyLists,
  occurrencesOf,
  selectedProjectId,
}: {
  previousDate: Date;
  nextDate: Date;
  selectedDate: Date;
  dailyLists: DailyList[];
  occurrencesOf: (date: string) => TaskTemplateOccurrence[];
  selectedProjectId: string;
}) => {
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
  const setProjectsViewHidden = useProjectsViewSize(
    (s) => s.setProjectsViewHidden,
  );

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
        captureWebAnalytics({
          name: "task_created",
          properties: {
            creation_method: "add_button",
            location: "daily_list",
          },
        });

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

    if (e.code === "KeyZ") {
      e.preventDefault();
      setStashOpen(false);
      setItemDetailsOpen(false);
      setProjectsViewHidden(true);
    }
  });

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
      <ProjectsSplit
        topClassName="overflow-y-auto pt-10"
        projectLink={ProjectLink}
        selectedProjectId={selectedProjectId}
        selectedDate={selectedDate}
      >
        <TasksColumnGrid
          columnsCount={7}
          floatingColumn={<Stash />}
          paddingLeft={isStashOpen ? getStashOpenWidth(stashWidth) : 32}
        >
          {dailyLists.map((dailyList) => (
            <ColumnView
              dailyList={dailyList}
              occurrences={occurrencesOf(dailyList.date)}
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
      </ProjectsSplit>

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
  const occurrencesOf = useUpcomingOccurrences(weekDays);
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
      occurrencesOf={occurrencesOf}
      selectedProjectId={selectedProjectId}
    />
  );
};
