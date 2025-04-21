import { observer } from "mobx-react-lite";
import { useState, useEffect, useCallback, useRef } from "react";
import { DailyList, Task, TaskProjection } from "../../models/models";
import { useMemo } from "react";
import { addDays, format, getDay, startOfDay, subDays } from "date-fns";
import { dailyListRef } from "../../models/models";
import { DropTaskIndicator, TaskComp } from "../Task/Task";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import {
  dropTargetForElements,
  ElementDragPayload,
  monitorForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { DndModelData, isModelDNDData } from "../../dnd/models";
import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { autoScrollForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element";
import { Edge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/dist/types/types";
import invariant from "tiny-invariant";
import { comparer, computed } from "mobx";
import { DropTargetRecord } from "@atlaskit/pragmatic-drag-and-drop/dist/types/internal-types";
import { MultiSelect } from "../ui/multi-select";
import { Cat, Dog, Fish, Rabbit, Turtle } from "lucide-react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useRegisterFocusColumn, useRegisterFocusItem } from "@/hooks/useLists";
import {
  ColumnListProvider,
  ParentListItemProvider,
} from "@/hooks/ParentListProvider";
import { buildFocusKey, focusManager } from "@/states/FocusManager";
import { getRootStore } from "@/models/initRootStore";

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

type ProjectIdsStore = {
  selectedProjectIds: string[];
  setSelectedProjectIds: (value: string[]) => void;
};

const useSelectedProjectIds = create<ProjectIdsStore>()(
  persist(
    (set, get) => ({
      selectedProjectIds: [],
      setSelectedProjectIds: (value: string[]) => {
        set({ selectedProjectIds: value });
      },
    }),
    {
      name: "select-project-ids-storage",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

type DailyListDndState = { type: "idle" } | { type: "is-task-over" };

const idle: DailyListDndState = { type: "idle" };
const isTaskOver: DailyListDndState = { type: "is-task-over" };

const AddTaskColumnButton = observer(function AddTaskColumnButtonComp({
  dailyList,
  onTaskAdd,
}: {
  dailyList: DailyList;
  onTaskAdd: (dailyList: DailyList) => void;
}) {
  const id = "add-task-button-" + dailyList.id;
  const item = useRegisterFocusItem(buildFocusKey(id, id), "zzzzzzzzzzzzzzzz");

  return (
    <button
      data-focusable-key={item.key}
      onClick={() => onTaskAdd(dailyList)}
      className="w-full p-2 border border-dashed border-gray-600 rounded-lg text-gray-400 text-sm hover:bg-gray-700 transition cursor-pointer"
    >
      + Add Task
    </button>
  );
});

const ColumnView = observer(function ColumnViewComponent({
  dailyList,
  onTaskAdd,
  orderNumber,
}: {
  dailyList: DailyList;
  onTaskAdd: (dailyList: DailyList) => void;
  orderNumber: number;
}) {
  const columnRef = useRef<HTMLDivElement>(null);
  const scrollableRef = useRef<HTMLDivElement>(null);
  const [dndState, setDndState] = useState<DailyListDndState>(idle);
  useEffect(() => {
    invariant(columnRef.current);
    invariant(scrollableRef.current);
    return combine(
      dropTargetForElements({
        element: columnRef.current,
        getData: (): DndModelData => ({
          modelId: dailyList.id,
          modelType: dailyList.$modelType,
        }),
        canDrop: ({ source }) => {
          if (!isModelDNDData(source.data)) return false;

          const entity = getRootStore().getEntity(
            source.data.modelId,
            source.data.modelType,
          );
          if (!entity) return false;

          return dailyList.canDrop(entity);
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
  }, [dailyList, dailyList.$modelType, dailyList.id]);

  const selectedProjectIds = useSelectedProjectIds(
    (state) => state.selectedProjectIds,
  );

  const filteredProjections =
    selectedProjectIds.length > 0
      ? dailyList.projections.filter((proj) => {
          return selectedProjectIds.includes(
            proj.taskRef.current.projectRef.id,
          );
        })
      : dailyList.projections;

  return (
    <ColumnListProvider
      focusKey={buildFocusKey(dailyList.id, dailyList.$modelType, "ColumnView")}
      priority={(orderNumber + 100).toString()}
    >
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
          {filteredProjections.map((proj) => {
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
            <AddTaskColumnButton dailyList={dailyList} onTaskAdd={onTaskAdd} />
          </div>
        </div>
      </div>
    </ColumnListProvider>
  );
});

const TaskSuggestions = observer(function TaskSuggestionsComp({
  displayedTasksIds,
}: {
  displayedTasksIds: Set<string>;
}) {
  const { allProjectsList } = getRootStore();

  const selectedProjectIds = useSelectedProjectIds(
    (state) => state.selectedProjectIds,
  );
  const selectedProjects =
    selectedProjectIds.length > 0
      ? allProjectsList.children.filter((project) =>
          selectedProjectIds.includes(project.id),
        )
      : allProjectsList.children;

  return (
    <div className="overflow-y-auto h-full">
      {selectedProjects
        .filter((ch) => ch.notDoneTask.length > 0)
        .map((proj) => {
          const tasks = proj.notDoneTask;
          const filteredTasks = tasks.filter(
            (t) => !displayedTasksIds.has(t.id),
          );

          if (filteredTasks.length == 0) return null;

          return (
            <ParentListItemProvider
              focusKey={buildFocusKey(
                proj.id,
                proj.$modelType,
                "TaskSuggestions",
              )}
              priority={proj.orderToken}
            >
              <div className="text-gray-400 text-sm mt-6 pb-2">
                {proj.displayIcon} {proj.title}
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
            </ParentListItemProvider>
          );
        })}
    </div>
  );
});

const BoardView = observer(function BoardViewComponent({
  handleNextDay,
  handlePrevDay,
  dailyLists,
  displayedTasksIds,
}: {
  handleNextDay: () => void;
  handlePrevDay: () => void;
  dailyLists: DailyList[];
  displayedTasksIds: Set<string>;
}) {
  const { preferences, allProjectsList, projectsRegistry } = getRootStore();
  const projectsList = allProjectsList.children.map((project) => {
    return {
      value: project.id,
      label: project.title,
      icon: () => <div>{project.displayIcon}</div>,
    };
  });

  const selectedProjectIds = useSelectedProjectIds(
    (state) => state.selectedProjectIds,
  );
  const setSelectedProjectIds = useSelectedProjectIds(
    (state) => state.setSelectedProjectIds,
  );

  const handleAddTask = useCallback(
    (dailyList: DailyList) => {
      const firstSelectedProject = selectedProjectIds[0]
        ? projectsRegistry.getById(selectedProjectIds[0])
        : undefined;
      const project = firstSelectedProject
        ? firstSelectedProject
        : projectsRegistry.inboxProjectOrThrow;

      const newItem = dailyList.createProjection(
        [undefined, dailyList.firstChild],
        { project },
      );

      focusManager.editByKey(buildFocusKey(newItem.id, newItem.$modelType));
    },
    [projectsRegistry, selectedProjectIds],
  );

  return (
    <div className="grid grid-cols-7 gap-4 h-full">
      {/* 80% section (4/5 columns) */}
      <div className="col-span-5 bg-gray-800 rounded-lg shadow-lg p-4 flex flex-col h-full border border-gray-700 overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center">
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

          <div className="">
            <MultiSelect
              options={projectsList}
              onValueChange={setSelectedProjectIds}
              defaultValue={selectedProjectIds}
              placeholder="Select Projects"
              variant="inverted"
              maxCount={2}
            />
          </div>

          <div className="flex items-center space-x-1">
            {[1, 2, 3, 4, 5, 6, 7].map((dayCount) => (
              <button
                key={dayCount}
                onClick={() => preferences.setDaysWindow(dayCount)}
                className={`w-6 h-6 flex items-center justify-center text-xs border ${
                  dayCount <= preferences.daysWindow
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
              gridTemplateColumns: `repeat(${preferences.daysWindow}, minmax(200px, 1fr))`,
              gap: "12px",
              width: "auto",
              maxWidth: "100%",
            }}
          >
            {dailyLists.map((dailyList, i) => (
              <ColumnView
                dailyList={dailyList}
                onTaskAdd={handleAddTask}
                orderNumber={i}
                key={dailyList.id}
              />
            ))}
          </div>
        </div>
      </div>

      <ColumnListProvider
        focusKey={buildFocusKey(
          "task-suggestions",
          "task-suggestions",
          "BoardView",
        )}
        priority="500"
      >
        {/* 20% section (1/5 columns) */}
        <div className="col-span-2 bg-gray-800 rounded-lg shadow-lg p-4 flex flex-col h-full border border-gray-700 h-full overflow-y-auto">
          <h2 className="text-xl font-bold mb-4 text-gray-100">
            Task Suggestions
          </h2>
          <TaskSuggestions displayedTasksIds={displayedTasksIds} />
        </div>
      </ColumnListProvider>
    </div>
  );
});

export const Board = observer(function BoardComponent() {
  const rootStore = getRootStore();
  const { dailyListRegistry } = rootStore;
  const { preferences } = getRootStore();
  const daysToShow = preferences.daysWindow;
  const daysShift = preferences.daysShift;

  const startingDate = useMemo(
    () => addDays(startOfDay(new Date()), daysShift),
    [daysShift],
  );

  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        return addDays(startingDate, i);
      }).filter((_, i) => i < daysToShow),
    [startingDate, daysToShow],
  );

  // Handle previous day
  const handlePrevDay = useCallback((): void => {
    preferences.setDaysShift(preferences.daysShift - 1);
  }, [preferences]);

  // Handle next day
  const handleNextDay = useCallback((): void => {
    preferences.setDaysShift(preferences.daysShift + 1);
  }, [preferences]);

  useEffect(() => {
    dailyListRegistry.createDailyListsIfNotExists(weekDays);
  }, [dailyListRegistry, weekDays]);

  const dailyLists = computed(
    () => dailyListRegistry.getDailyListByDates(weekDays),
    { equals: comparer.structural },
  ).get();
  const displayedTasksIds = computed(
    () => {
      return dailyListRegistry.getTaskIdsOfDailyLists(dailyLists);
    },
    { equals: comparer.structural },
  ).get();

  return (
    <BoardView
      displayedTasksIds={displayedTasksIds}
      handleNextDay={handleNextDay}
      handlePrevDay={handlePrevDay}
      dailyLists={dailyLists}
    />
  );
});
