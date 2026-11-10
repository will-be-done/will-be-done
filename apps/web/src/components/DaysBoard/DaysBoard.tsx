import {
  memo,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  addDays,
  differenceInCalendarDays,
  format,
  startOfDay,
  startOfWeek,
} from "date-fns";
import {
  useAsyncDispatch,
  useAsyncSelector,
  useSelectAsync,
} from "@will-be-done/hyperdb/react";
import {
  createManyDailyListsIfNotPresent,
  createTaskInList,
  type DailyList,
  dailyListsByDates,
  dailyEntryChildrenForDisplay,
  dailyEntryByTaskId,
  doneDailyEntryChildrenForDisplay,
  dailyEntryType,
  dailyListType,
  getDMY,
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
import { DAY_WIDTH, useInfiniteDays } from "./useInfiniteDays.ts";
import {
  DATA_CHUNK_DAYS,
  OVERSCAN_DAYS,
  dataWindowDates,
} from "./timelineWindow.ts";
import { InfiniteScrollbar } from "./InfiniteScrollbar.tsx";
import { ProjectsSplit } from "../ProjectView/ProjectsSplit.tsx";
import { useProjectsViewSize } from "../ProjectView/ProjectsViewStore.ts";
import { TasksColumn } from "@/components/TasksGrid/TasksGrid.tsx";
import { useHorizontalDragAutoScroll } from "@/components/TasksGrid/useHorizontalDragAutoScroll.ts";
import { Link } from "@tanstack/react-router";
import { Route } from "@/routes/spaces.$spaceId.tsx";
import { getStashOpenWidth, useStashOpen, useStashSize } from "./StashStore.ts";
import { ItemDetails } from "@/components/ItemDetails/ItemDetails.tsx";
import { Stash } from "@/components/Stash/Stash.tsx";
import { useGlobalListener } from "@/components/GlobalListener/hooks.tsx";
import { isInputElement } from "@/utils/isInputElement.ts";
import { useItemDetailsOpen } from "@/components/ItemDetails/ItemDetailsStore.ts";
import { captureWebAnalytics } from "@/lib/analytics";
import { DayEventsStrip } from "@/components/ExternalEvents/ExternalEventChip.tsx";
import { useExternalEvents } from "@/components/ExternalEvents/useExternalEvents.ts";
import type { DayExternalEvent } from "@/components/ExternalEvents/externalEventsModel.ts";
import type { DayRange } from "@/components/ProjectItemsList/ProjectItemList.tsx";

const DayHeader = ({
  date,
  isToday,
  count,
}: {
  date: string;
  isToday: boolean;
  count: number;
}) => (
  <>
    <div className="inline-block text-xs text-subheader mr-4">
      {format(parseDMY(date), "dd MMM")}
    </div>
    <div
      className={cn("uppercase text-content text-3xl font-bold ", {
        "text-accent": isToday,
      })}
    >
      {format(parseDMY(date), "EEEE")}
    </div>
    <span
      className="flex items-center justify-center w-5 h-5 rounded-full bg-content-tinted/10 text-[11px] font-semibold tabular-nums text-content-tinted/60 leading-none self-center"
      style={{
        writingMode: "horizontal-tb",
        textOrientation: "initial",
        transform: "rotate(180deg)",
      }}
    >
      {count > 0 ? count : ""}
    </span>
  </>
);

// Stands in for a day until its DailyList exists: cheap to render while
// scrolling, and as wide as the open column it becomes.
const DayColumnMock = ({ date }: { date: string }) => {
  const isToday = useCurrentDMY() === date;

  return (
    <div
      aria-hidden
      className="flex h-full px-1 pt-1"
      style={{ minWidth: `${DAY_WIDTH}px` }}
    >
      <div
        className="flex justify-end"
        style={{
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          transform: "rotate(180deg)",
        }}
      >
        <div className="mb-4 flex">
          <div className="mb-2 size-6" />
        </div>
        <div className="flex gap-3 justify-end flex-shrink-0 p-1">
          <DayHeader date={date} isToday={isToday} count={0} />
        </div>
      </div>
    </div>
  );
};

const ColumnView = memo(function ColumnView({
  dailyListId,
  date,
  occurrences,
  externalEvents,
  onTaskAdd,
}: {
  dailyListId: string;
  date: string;
  occurrences: TaskTemplateOccurrence[];
  externalEvents: DayExternalEvent[];
  onTaskAdd: (dailyListId: string) => void;
}) {
  const currentDate = useCurrentDMY();
  const isToday = currentDate === date;

  const { data: itemsForDisplay = [], isPending } = useAsyncSelector({
    selector: dailyEntryChildrenForDisplay,
    args: { dailyListId },
  });

  const { data: doneItemsForDisplay = [], isPending: isDonePending } =
    useAsyncSelector({
      selector: doneDailyEntryChildrenForDisplay,
      args: { dailyListId },
    });

  // const [isHiddenClicked, setIsHiddenClicked] = useState(false);

  const isManuallyHidden = useHiddenDays(
    (state) => state.hiddenDays[dailyListId],
  );
  const setIsHidden = useHiddenDays((state) => state.setIsHidden);
  const toggleIsHidden = useHiddenDays((state) => state.toggleIsHidden);
  const isHidden = !!isManuallyHidden;
  // Still a column while its tasks load, so keys and moves don't pass it by.
  const isEmpty =
    !isPending &&
    !isDonePending &&
    itemsForDisplay.length == 0 &&
    doneItemsForDisplay.length == 0 &&
    occurrences.length == 0 &&
    externalEvents.length == 0;
  const handleHideClick = () => toggleIsHidden(dailyListId);

  const handleAddClick = () => {
    if (isHidden) {
      setIsHidden(dailyListId, false);
    }

    onTaskAdd(dailyListId);
  };

  return (
    <TasksColumn
      isHidden={isHidden}
      onHideClick={handleHideClick}
      header={
        <DayHeader
          date={date}
          isToday={isToday}
          count={itemsForDisplay.length}
        />
      }
      columnModelId={dailyListId}
      columnModelType={dailyListType}
      panelWidth={DAY_WIDTH}
      onAddClick={handleAddClick}
    >
      <div className={cn("flex flex-col gap-4 w-full py-4")}>
        <DayEventsStrip events={externalEvents} />

        {isEmpty && (
          <button
            type="button"
            onClick={handleAddClick}
            // Lit while keys focus the day, through its column's placeholder.
            className="group/empty flex w-full cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed border-content-tinted/15 py-8 transition-colors hover:border-content-tinted/30 group-has-[[data-focus-placeholder]:focus]/column:border-accent"
          >
            <span className="text-sm text-content-tinted/50 transition-colors group-hover/empty:text-content-tinted">
              Nothing planned
            </span>
            <span className="text-xs text-content-tinted/30 transition-colors group-hover/empty:text-content-tinted/60">
              Drop a task here or click to add one
            </span>
          </button>
        )}

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
});

const noDailyLists: DailyList[] = [];
const noExternalEvents: DayExternalEvent[] = [];

const DaysTimeline = ({
  startDate,
  scrollDate,
  onScrollDateChange,
  onVisibleDaysChange,
  onTaskAdd,
}: {
  startDate: Date;
  scrollDate: Date | undefined;
  onScrollDateChange: (date: Date, replace: boolean) => void;
  onVisibleDaysChange: (days: DayRange) => void;
  onTaskAdd: (dailyListId: string) => void;
}) => {
  const dispatch = useAsyncDispatch();
  const isStashOpen = useStashOpen((s) => s.isOpen);
  const stashWidth = useStashSize((s) => s.width);

  const urlDay = scrollDate
    ? differenceInCalendarDays(scrollDate, startDate)
    : 0;
  // The day last shown or put in the URL from here; a URL day other than this
  // came from outside (Back, a link) and is scrolled to.
  const shownDay = useRef(urlDay);

  const handleVisibleDaysChange = useCallback(
    (first: number, last: number) => {
      onVisibleDaysChange({
        from: addDays(startDate, first).getTime(),
        to: addDays(startDate, last).getTime(),
      });
      shownDay.current = first;
      if (first !== urlDay) onScrollDateChange(addDays(startDate, first), true);
    },
    [onVisibleDaysChange, onScrollDateChange, startDate, urlDay],
  );
  const {
    scrollerRef,
    rowRef,
    observeDay,
    rendered,
    rowStyle,
    firstVisible,
    scrollToDay,
    scrollByDay,
    scrollBy,
    page,
  } = useInfiniteDays({
    overscan: OVERSCAN_DAYS,
    initialDay: urlDay,
    onVisibleDaysChange: handleVisibleDaysChange,
  });
  useHorizontalDragAutoScroll(scrollerRef);
  const areaRef = useRef<HTMLDivElement>(null);

  const { from: renderedFrom, to: renderedTo } = rendered;
  const windowDates = useMemo(
    () =>
      dataWindowDates(startDate, {
        from: renderedFrom,
        to: renderedTo,
      }),
    [startDate, renderedFrom, renderedTo],
  );
  const windowTimes = useMemo(
    () => windowDates.map((date) => date.getTime()),
    [windowDates],
  );

  const { data: dailyLists = noDailyLists } = useAsyncSelector({
    selector: dailyListsByDates,
    args: { dates: windowTimes },
    placeholderData: (previous) => previous ?? noDailyLists,
  });
  const dailyListsByDate = useMemo(
    () => new Map(dailyLists.map((dailyList) => [dailyList.date, dailyList])),
    [dailyLists],
  );
  const occurrencesOf = useUpcomingOccurrences(windowDates);
  const externalEventsByDate = useExternalEvents(windowDates);

  useEffect(() => {
    void dispatch(createManyDailyListsIfNotPresent({ dates: windowTimes }));
  }, [dispatch, windowTimes]);

  const scrollToShownDay = (day: number) => {
    shownDay.current = day;
    scrollToDay(day, Math.abs(day - firstVisible) <= DATA_CHUNK_DAYS * 2);
  };
  const jumpTo = (date: Date) => {
    scrollToShownDay(differenceInCalendarDays(date, startDate));
    onScrollDateChange(date, false);
  };
  const followUrl = useEffectEvent((day: number) => {
    if (day !== shownDay.current) scrollToShownDay(day);
  });
  useEffect(() => followUrl(urlDay), [urlDay]);

  const eventsOn = (date: string) => {
    const events = externalEventsByDate.get(date);
    // Shared when empty, so the column memo holds as the window moves.
    return events?.length ? events : noExternalEvents;
  };

  const days = Array.from(
    { length: rendered.to - rendered.from + 1 },
    (_, i) => rendered.from + i,
  );

  return (
    <>
      <div
        data-focus-region-direction="row"
        className="relative max-h-full h-full overflow-x-clip"
      >
        <Stash />
        <div
          className="h-full"
          style={{
            paddingLeft: `${isStashOpen ? getStashOpenWidth(stashWidth) : 32}px`,
            transition: "padding-left 200ms ease-out",
          }}
        >
          <div ref={areaRef} className="relative h-full">
            <div
              ref={scrollerRef}
              id="timeline-days"
              className="h-full overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              <div
                ref={rowRef}
                className="relative flex h-full w-max"
                style={rowStyle}
              >
                {days.map((day) => {
                  const date = getDMY(addDays(startDate, day));
                  const dailyList = dailyListsByDate.get(date);

                  return (
                    <div
                      key={day}
                      data-day={day}
                      ref={observeDay}
                      // Days scrolled off to the left sit behind the open
                      // stash, so h from the first visible day reaches it.
                      data-focus-skip={
                        (isStashOpen && day < firstVisible) || undefined
                      }
                      className="h-full w-min shrink-0"
                    >
                      {dailyList ? (
                        <ColumnView
                          dailyListId={dailyList.id}
                          date={date}
                          occurrences={occurrencesOf(date)}
                          externalEvents={eventsOn(date)}
                          onTaskAdd={onTaskAdd}
                        />
                      ) : (
                        <DayColumnMock date={date} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <InfiniteScrollbar
              areaRef={areaRef}
              scrollerRef={scrollerRef}
              scrollBy={scrollBy}
              page={page}
            />
          </div>
        </div>
      </div>
      <NavPanel
        date={addDays(startDate, firstVisible)}
        onPrevious={() => scrollByDay(-1)}
        onNext={() => scrollByDay(1)}
        onToday={() => jumpTo(startOfWeek(new Date(), { weekStartsOn: 1 }))}
        onPickDate={jumpTo}
      />
    </>
  );
};

export const Board = ({
  selectedDate,
  scrollDate,
  onScrollDateChange,
  selectedProjectId,
}: {
  selectedDate: Date;
  scrollDate: Date | undefined;
  onScrollDateChange: (date: Date, replace: boolean) => void;
  selectedProjectId: string;
}) => {
  const startDate = useMemo(() => startOfDay(selectedDate), [selectedDate]);
  const dispatch = useAsyncDispatch();
  const select = useSelectAsync();
  const { data: inboxId = "" } = useAsyncSelector({
    selector: inboxProjectId,
    args: {},
  });
  const [visibleDays, setVisibleDays] = useState<DayRange>();
  const setStashOpen = useStashOpen((s) => s.setOpen);
  const setItemDetailsOpen = useItemDetailsOpen((s) => s.setOpen);
  const setProjectsViewHidden = useProjectsViewSize(
    (s) => s.setProjectsViewHidden,
  );

  const handleVisibleDaysChange = useCallback((days: DayRange) => {
    setVisibleDays((previous) =>
      previous?.from === days.from && previous.to === days.to ? previous : days,
    );
  }, []);

  const handleAddTask = useCallback(
    (dailyListId: string) => {
      void (async () => {
        const task = await dispatch(
          createTaskInList({
            dailyListId,
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
          search={(previous) => ({ ...previous, projectId })}
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
        topClassName="overflow-hidden pt-10 max-sm:pt-24"
        projectLink={ProjectLink}
        selectedProjectId={selectedProjectId}
        timelineDays={visibleDays}
      >
        {/* A new date in the URL starts a fresh timeline around it. */}
        <DaysTimeline
          key={startDate.getTime()}
          startDate={startDate}
          scrollDate={scrollDate}
          onScrollDateChange={onScrollDateChange}
          onVisibleDaysChange={handleVisibleDaysChange}
          onTaskAdd={handleAddTask}
        />
      </ProjectsSplit>

      {/* Phones open details full screen instead. */}
      <div className="hidden h-full sm:block">
        <ItemDetails />
      </div>
    </div>
  );
};
