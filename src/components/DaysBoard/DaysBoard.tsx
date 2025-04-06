import { observer } from "mobx-react-lite";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  DailyList,
  getRootStore,
  Task,
  TaskProjection,
} from "../../models/models";
import { useMemo } from "react";
import { addDays, format, getDay, startOfDay, subDays } from "date-fns";
import { dailyListRef } from "../../models/models";
import { DropTaskIndicator, TaskComp } from "../Task/Task";
import { currentProjectionState } from "../../states/task";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import {
  dropTargetForElements,
  monitorForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import {
  DailyListPassingData,
  isDailyListPassingData,
  isTaskPassingData,
} from "../../dnd/models";
import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { autoScrollForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element";
import { Edge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/dist/types/types";
import invariant from "tiny-invariant";
import { computed } from "mobx";

// All days of the week
const allWeekdays: string[] = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// export const DaysViewWithContextx = observer(() => {
//
//   const getLists = useMemo(() => {});
//   const contextValue: BoardContextValue = useMemo(() => {
//     return {
//       getColumns,
//       reorderColumn,
//       reorderCard,
//       moveCard,
//       registerCard: registry.registerCard,
//       registerColumn: registry.registerColumn,
//       instanceId,
//     };
//   }, [getColumns, reorderColumn, reorderCard, registry, moveCard, instanceId]);
// });

type DailyListDndState = { type: "idle" } | { type: "is-task-over" };

const idle: DailyListDndState = { type: "idle" };
const isTaskOver: DailyListDndState = { type: "is-task-over" };

const ColumnView = observer(function ColumnViewComponent({
  dailyList,
  onTaskAdd,
}: {
  dailyList: DailyList;
  onTaskAdd: (dailyList: DailyList) => void;
}) {
  const columnRef = useRef<HTMLDivElement>(null);
  const scrollableRef = useRef<HTMLDivElement>(null);
  const [dndState, setDndState] = useState<DailyListDndState>(idle);
  const listId = dailyList.id;
  useEffect(() => {
    invariant(columnRef.current);
    invariant(scrollableRef.current);
    return combine(
      dropTargetForElements({
        element: columnRef.current,
        getData: (): DailyListPassingData => ({
          type: "dailyList",
          listId,
        }),
        canDrop: ({ source }) => {
          return isTaskPassingData(source.data);
        },
        getIsSticky: () => true,
        onDragEnter: () => setDndState(isTaskOver),
        onDragLeave: () => setDndState(idle),
        onDragStart: () => setDndState(isTaskOver),
        onDrop: () => setDndState(idle),
      }),
      autoScrollForElements({
        element: scrollableRef.current,
        canScroll: ({ source }) => isTaskPassingData(source.data),
      }),
    );
  }, [listId]);

  return (
    <div
      key={dailyList.id}
      className={`flex flex-col min-w-[200px] ${
        dailyList.isToday ? "bg-gray-750 rounded-t-lg" : ""
      } h-full `}
      ref={columnRef}
    >
      {/* Day header */}
      <div
        className={`text-center font-bold pb-2 sticky top-0 bg-gray-800 border-b ${
          dailyList.isToday
            ? "text-blue-400 border-blue-500"
            : "text-gray-200 border-gray-700"
        }`}
      >
        <div>
          {allWeekdays[getDay(dailyList.date)]} -{" "}
          {format(dailyList.date, "dd MMM")}
        </div>
      </div>

      {/* Tasks column */}
      <div
        className="flex flex-col space-y-2 mt-2 overflow-y-auto"
        ref={scrollableRef}
      >
        {dailyList.projections.map((proj) => {
          return (
            <TaskComp
              listItem={proj}
              task={proj.taskRef.current}
              showProject={true}
              key={proj.id}
            />
          );
        })}

        {dndState.type == "is-task-over" &&
          dailyList.projections.length == 0 && <DropTaskIndicator />}

        {/* Add new task button and input */}
        <div className="mt-2">
          <button
            onClick={() => onTaskAdd(dailyList)}
            className="w-full p-2 border border-dashed border-gray-600 rounded-lg text-gray-400 text-sm hover:bg-gray-700 transition cursor-pointer"
          >
            + Add Task
          </button>
        </div>
      </div>
    </div>
  );
});

const TaskSuggestions = observer(function TaskSuggestionsComp({
  displayedTasksIds,
}: {
  displayedTasksIds: Set<string>;
}) {
  const { allProjectsList } = getRootStore();

  console.log({ displayedTasksIds });

  return (
    <div className="overflow-y-auto h-full">
      {allProjectsList.children
        .filter((ch) => ch.notDoneTask.length > 0)
        .map((proj) => {
          const tasks = proj.notDoneTask;
          const filteredTasks = tasks.filter(
            (t) => !displayedTasksIds.has(t.id),
          );

          if (filteredTasks.length == 0) return null;

          return (
            <>
              <div className="text-gray-400 text-sm mt-6 pb-2">
                {proj.icon} {proj.title}
              </div>

              <div className="flex flex-col gap-2">
                {filteredTasks.map((task) => (
                  <TaskComp
                    listItem={task}
                    task={task}
                    key={task.id}
                    showProject={false}
                  />
                ))}
              </div>
            </>
          );
        })}
    </div>
  );
});

const BoardView = observer(function BoardViewComponent({
  handleNextDay,
  handlePrevDay,
  setDaysToShow,
  daysToShow,
  dailyLists,
  onTaskAdd,
  displayedTasksIds,
}: {
  handleNextDay: () => void;
  handlePrevDay: () => void;
  daysToShow: number;
  setDaysToShow: (daysToShow: number) => void;
  dailyLists: DailyList[];
  onTaskAdd: (dailyList: DailyList) => void;
  displayedTasksIds: Set<string>;
}) {
  return (
    <div className="grid grid-cols-7 gap-4 h-full">
      {/* 80% section (4/5 columns) */}
      <div className="col-span-5 bg-gray-800 rounded-lg shadow-lg p-4 flex flex-col h-full border border-gray-700 overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center">
            <h2 className="text-xl font-bold text-gray-100">
              Weekly Todo Planner
            </h2>
            <button
              onClick={handlePrevDay}
              className="p-1 ml-4 bg-gray-700 rounded hover:bg-gray-600 transition-colors text-gray-300 cursor-pointer"
              aria-label="Previous day"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            <button
              onClick={handleNextDay}
              className="p-1 ml-1 bg-gray-700 rounded hover:bg-gray-600 transition-colors text-gray-300 cursor-pointer"
              aria-label="Next day"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>

          <div className="flex items-center space-x-1">
            {[1, 2, 3, 4, 5, 6, 7].map((dayCount) => (
              <button
                key={dayCount}
                onClick={() => setDaysToShow(dayCount)}
                className={`w-6 h-6 flex items-center justify-center text-xs border ${
                  dayCount <= daysToShow
                    ? "bg-blue-600 border-blue-700 text-white"
                    : "bg-gray-700 border-gray-600 text-gray-300"
                } rounded cursor-pointer hover:bg-gray-600 transition-colors`}
              >
                {dayCount}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-auto flex-1 overflow-x-auto">
          <div
            className="grid"
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${daysToShow}, minmax(200px, 1fr))`,
              gap: "12px",
              width: "auto",
              maxWidth: "100%",
            }}
          >
            {dailyLists.map((dailyList) => (
              <ColumnView
                dailyList={dailyList}
                onTaskAdd={onTaskAdd}
                key={dailyList.id}
              />
            ))}
          </div>
        </div>
      </div>

      {/* 20% section (1/5 columns) */}
      <div className="col-span-2 bg-gray-800 rounded-lg shadow-lg p-4 flex flex-col h-full border border-gray-700 h-full overflow-y-auto">
        <h2 className="text-xl font-bold mb-4 text-gray-100">
          Task Suggestions
        </h2>
        <TaskSuggestions displayedTasksIds={displayedTasksIds} />
      </div>
    </div>
  );
});

export const Board = observer(function BoardComponent() {
  const rootStore = getRootStore();
  const { dailyListRegisry, listsService } = rootStore;

  const [daysToShow, setDaysToShow] = useState<number>(7);
  const [startingDate, setStartingDate] = useState<Date>(() =>
    startOfDay(new Date()),
  );

  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        return addDays(startingDate, i);
      }).filter((_, i) => i < daysToShow),
    [startingDate, daysToShow],
  );

  // Handle previous day
  const handlePrevDay = (): void => {
    setStartingDate((prevDate) => subDays(prevDate, 1));
  };

  // Handle next day
  const handleNextDay = (): void => {
    setStartingDate((prevDate) => addDays(prevDate, 1));
  };

  useEffect(() => {
    dailyListRegisry.createDailyListsIfNotExists(weekDays);
  }, [dailyListRegisry, weekDays]);

  const dailyLists = computed(() =>
    dailyListRegisry.getDailyListByDates(weekDays),
  ).get();
  const displayedTasksIds = computed(() => {
    return dailyListRegisry.getTaskIdsOfDailyLists(dailyLists);
  }).get();

  const handleAddTask = (dailyList: DailyList) => {
    const newItem = dailyList.createChild([
      dailyList.lastProjection,
      undefined,
    ]);
    currentProjectionState.setFocusedItemId(newItem.id);
  };

  useEffect(() => {
    return combine(
      monitorForElements({
        onDrop(args) {
          const { location, source } = args;

          if (!location.current.dropTargets.length) {
            return;
          }

          if (!isTaskPassingData(source.data)) {
            return;
          }

          const sourceItem = listsService.findListItemOrThrow(
            source.data.listItemId,
          );

          const dropTaskTarget = location.current.dropTargets.find((t) =>
            isTaskPassingData(t.data),
          );
          if (dropTaskTarget) {
            if (!isTaskPassingData(dropTaskTarget.data)) {
              return;
            }

            const targetList = listsService.findListOrThrow(
              dropTaskTarget.data.listId,
            );
            const targetProjection = listsService.findListItemOrThrow(
              dropTaskTarget.data.listItemId,
            );

            const closestEdgeOfTarget: Edge | null = extractClosestEdge(
              dropTaskTarget.data,
            );

            if (
              closestEdgeOfTarget &&
              closestEdgeOfTarget != "top" &&
              closestEdgeOfTarget != "bottom"
            ) {
              throw new Error("edge is not top or bottm");
            }

            listsService.addListItemFromOtherList(
              sourceItem,
              targetProjection,
              closestEdgeOfTarget || "bottom",
            );

            return;
          }

          const dailyListTaskTarget = location.current.dropTargets.find((t) =>
            isDailyListPassingData(t.data),
          );
          if (dailyListTaskTarget) {
            if (!isDailyListPassingData(dailyListTaskTarget.data)) {
              return;
            }

            const targetList = listsService.findListOrThrow(
              dailyListTaskTarget.data.listId,
            );

            listsService.appendListItemFromOtherList(targetList, sourceItem);

            return;
          }

          console.warn("No target found", args, location.current.dropTargets);
        },
      }),
    );
  }, [listsService]);

  return (
    <BoardView
      displayedTasksIds={displayedTasksIds}
      handleNextDay={handleNextDay}
      handlePrevDay={handlePrevDay}
      daysToShow={daysToShow}
      setDaysToShow={setDaysToShow}
      dailyLists={dailyLists}
      onTaskAdd={handleAddTask}
    />
  );
});
