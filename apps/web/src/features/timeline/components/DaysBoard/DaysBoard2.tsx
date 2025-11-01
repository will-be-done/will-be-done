import { useState, useEffect, useCallback, useRef } from "react";
import { useMemo } from "react";
import {
  addDays,
  format,
  getDay,
  nextWednesday,
  startOfDay,
  subDays,
} from "date-fns";
// import { TaskComp } from "../../../../components/Task/Task";
// import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
// import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
// import { DndModelData, isModelDNDData } from "@/features/dnd/models";
import { autoScrollForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element";
import invariant from "tiny-invariant";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
// import { useRegisterFocusItem } from "@/features/focus/hooks/useLists.ts";
// import { ColumnListProvider } from "@/features/focus/components/ParentListProvider.tsx";
// import { buildFocusKey, focusSlice2 } from "@/store2/slices/focusSlice.ts";
// import clsx from "clsx";
import { useSuggestionsStore } from "../TaskSuggestions/suggestionsStore";
// import { Link } from "@tanstack/react-router";
// import { MultiSelect } from "@/components/ui/multi-select";
import { useDispatch, useSelect, useSyncSelector } from "@will-be-done/hyperdb";
import {
  allProjectsSlice2,
  DailyList,
  dailyListsSlice2,
  dropSlice2,
  getDMY,
  inboxId,
  projectionsSlice2,
} from "@will-be-done/slices";
import { cn } from "@/lib/utils";
import { buildFocusKey, focusSlice2 } from "@/store2/slices/focusSlice";
import { TaskComp } from "@/components/Task/Task";
import { ColumnListProvider } from "@/features/focus/components/ParentListProvider";
import { DndModelData, isModelDNDData } from "@/features/dnd/models";
import { ResizableDivider } from "./ResizableDivider";
import { prefetchDNS } from "react-dom";
import { NavPanel } from "./NavPanel";
import { ScrollArea } from "@base-ui-components/react/scroll-area";

type DaysPreferences = {
  daysWindow: number;
  daysShift: number;

  setDaysWindow: (value: number) => void;
  setDaysShift: (value: number) => void;
};
export const useDaysPreferences = create<DaysPreferences>()(
  persist(
    (set, get) => ({
      daysWindow: 7,
      daysShift: 0,
      setDaysWindow: (value: number) => {
        set({ daysWindow: value });
      },
      setDaysShift: (value: number) => {
        set({ daysShift: value });
      },
    }),
    {
      name: "days-preferences",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

const useCurrentDate = () => {
  const [date, setDate] = useState(getDMY(new Date()));

  useEffect(() => {
    const interval = setInterval(() => {
      setDate(getDMY(new Date()));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return date;
};

const TaskProjection = ({
  projectionId,
  orderNumber,
}: {
  projectionId: string;
  orderNumber: string;
}) => {
  const projection = useSyncSelector(
    () => projectionsSlice2.byIdOrDefault(projectionId),
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

type DailyListDndState = { type: "idle" } | { type: "is-task-over" };

const idle: DailyListDndState = { type: "idle" };
const isTaskOver: DailyListDndState = { type: "is-task-over" };

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
    () => dailyListsSlice2.byIdOrDefault(dailyListId),
    [dailyListId],
  );
  const select = useSelect();
  const currentDate = useCurrentDate();
  const isToday = useMemo(() => {
    return currentDate === dailyList.date;
  }, [currentDate, dailyList.date]);

  const projectionIds = useSyncSelector(
    () => dailyListsSlice2.childrenIds(dailyListId),
    [dailyListId],
  );

  const doneProjectionIds = useSyncSelector(
    () => dailyListsSlice2.doneChildrenIds(dailyListId),
    [dailyListId],
  );

  const [dndState, setDndState] = useState<DailyListDndState>(idle);

  const columnRef = useRef<HTMLDivElement>(null);
  const scrollableRef = useRef<HTMLDivElement>(null);
  const isOver = dndState.type == "is-task-over";

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

          return select(dropSlice2.canDrop(dailyListId, data.modelId));
        },
        getIsSticky: () => true,
        onDragEnter: () => setDndState(isTaskOver),
        onDragLeave: () => setDndState(idle),
        onDragStart: () => setDndState(isTaskOver),
        onDrop: () => setDndState(idle),
      }),
      autoScrollForElements({
        element: scrollableRef.current,
        canScroll: ({ source }) => isModelDNDData(source.data),
      }),
    );
  }, [dailyList.id, dailyList.type, dailyListId, select]);

  const [isHiddenClicked, setIsHiddenClicked] = useState(false);
  const isHidden =
    isHiddenClicked ||
    (projectionIds.length == 0 && doneProjectionIds.length == 0);

  return (
    <ColumnListProvider
      focusKey={buildFocusKey(dailyList.id, dailyList.type, "ColumnView")}
      priority={(orderNumber + 100).toString()}
    >
      <div
        ref={columnRef}
        className={cn("flex h-full p-1 flex-shrink-0 min-h-0", {
          "min-w-[350px]": !isHidden,
        })}
      >
        <button
          type="button"
          className=" pb-4"
          style={{
            writingMode: "vertical-rl",
            textOrientation: "mixed",
            transform: "rotate(180deg)",
            // width: "48px",
          }}
          onClick={() => setIsHiddenClicked((v) => !v)}
        >
          <div
            className={cn(
              "flex gap-3 justify-end flex-shrink-0 border border-3 border-transparent box-border  p-1",
              {
                "border rounded-lg border-3 border-panel-selected":
                  isOver && isHidden,
              },
            )}
          >
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
          </div>
        </button>

        <ScrollArea.Root
          className={cn("w-full  min-h-0", {
            hidden: isHidden,
          })}
        >
          <ScrollArea.Viewport
            className="h-full overscroll-contain rounded-md w-full pr-4"
            ref={scrollableRef}
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
          </ScrollArea.Viewport>
          <ScrollArea.Scrollbar className="m-2 flex w-1 justify-center rounded bg-gray-200 opacity-0 transition-opacity delay-300 pointer-events-none data-[hovering]:opacity-100 data-[hovering]:delay-0 data-[hovering]:duration-75 data-[hovering]:pointer-events-auto data-[scrolling]:opacity-100 data-[scrolling]:delay-0 data-[scrolling]:duration-75 data-[scrolling]:pointer-events-auto">
            <ScrollArea.Thumb className="w-full rounded bg-gray-500" />
          </ScrollArea.Scrollbar>
        </ScrollArea.Root>
      </div>
    </ColumnListProvider>
  );
};

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
  const setDaysWindow = useDaysPreferences((state) => state.setDaysWindow);
  const dispatch = useDispatch();

  const handleAddTask = useCallback(
    (dailyList: DailyList) => {
      const projection = dispatch(
        dailyListsSlice2.createProjectionWithTask(
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

  const [height, setHeight] = useState(20);

  const handleRightResize = (deltaX: number) => {
    const containerHeight = window.innerHeight;
    const deltaPercentage = (deltaX / containerHeight) * 100;
    const newHeight = Math.max(10, Math.min(60, height - deltaPercentage));
    setHeight(newHeight);
  };

  return (
    <>
      <div className="flex flex-col w-full">
        <div className="flex-1 overflow-x-auto w-full relative">
          <div
            className="grid max-h-full h-full pt-8"
            style={{
              gridTemplateColumns: `repeat(${daysToShow}, fit-content(40px))`,
              gridTemplateRows: `1fr`,
            }}
          >
            {dailyListsIds.map((id, i) => (
              <ColumnView
                dailyListId={id}
                onTaskAdd={handleAddTask}
                orderNumber={i}
                key={id}
              />
            ))}
          </div>
          <NavPanel
            previousDate={previousDate}
            nextDate={nextDate}
            selectedDate={selectedDate}
          />
        </div>
        <div className="bg-red-300 w-full" style={{ height: `${height}%` }}>
          <ResizableDivider onResize={handleRightResize} />
          hello
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
    () => dailyListsSlice2.idsByDates(weekDays),
    [weekDays],
  );
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(dailyListsSlice2.createManyIfNotPresent(weekDays));
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
