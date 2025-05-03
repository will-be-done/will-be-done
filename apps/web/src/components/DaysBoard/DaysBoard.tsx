import { useState, useEffect, useCallback, useRef } from "react";
import { useMemo } from "react";
import { addDays, format, getDay, startOfDay, subDays } from "date-fns";
import { DropTaskIndicator, TaskComp } from "../Task/Task";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { DndModelData, isModelDNDData } from "../../dnd/models";
import { autoScrollForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element";
import invariant from "tiny-invariant";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useRegisterFocusItem } from "@/hooks/useLists";
import {
  ColumnListProvider,
  ParentListItemProvider,
} from "@/hooks/ParentListProvider";
import { buildFocusKey, focusSlice } from "@/states/FocusManager";
import { useAppSelector, useAppStore } from "@/hooks/state";
import {
  DailyList,
  dailyListsSlice,
  dropSlice,
  getDMY,
  inboxId,
  allProjectsSlice,
  projectsSlice,
  projectionsSlice,
} from "@/models/models2";

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

const AddTaskColumnButton = ({
  dailyList,
  onTaskAdd,
}: {
  dailyList: DailyList;
  onTaskAdd: (dailyList: DailyList) => void;
}) => {
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
};

const TaskProjection = ({ projectionId }: { projectionId: string }) => {
  const projection = useAppSelector((state) =>
    projectionsSlice.byIdOrDefault(state, projectionId),
  );

  return (
    <>
      <TaskComp
        taskId={projection.taskId}
        taskBoxId={projection.id}
        showProject={true}
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
  const columnRef = useRef<HTMLDivElement>(null);
  const scrollableRef = useRef<HTMLDivElement>(null);
  const [dndState, setDndState] = useState<DailyListDndState>(idle);
  const dailyList = useAppSelector((state) =>
    dailyListsSlice.byIdOrDefault(state, dailyListId),
  );
  const store = useAppStore();

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

          return dropSlice.canDrop(store.getState(), dailyListId, data.modelId);
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
  }, [dailyList.id, dailyList.type, dailyListId, store]);

  const selectedProjectIds = useSelectedProjectIds(
    (state) => state.selectedProjectIds,
  );

  const projectionIds = useAppSelector((state) =>
    dailyListsSlice.childrenIds(state, dailyListId),
  );

  // TODO: return back
  // const filteredProjections =
  //   selectedProjectIds.length > 0
  //     ? dailyList.projections.filter((proj) => {
  //         return selectedProjectIds.includes(
  //           proj.taskRef.current.projectRef.id,
  //         );
  //       })
  //     : dailyList.projections;

  const isToday = useMemo(() => {
    return getDMY(new Date()) === dailyList.date;
  }, [dailyList.date]);

  return (
    <ColumnListProvider
      focusKey={buildFocusKey(dailyList.id, dailyList.type, "ColumnView")}
      priority={(orderNumber + 100).toString()}
    >
      <div
        key={dailyList.id}
        className={`flex flex-col min-w-[200px] ${
          isToday ? "bg-gray-750 rounded-t-lg" : ""
        } h-full `}
        ref={columnRef}
      >
        {/* Day header */}
        <div
          className={`text-center font-bold pb-2 sticky top-0 bg-gray-800 border-b ${
            isToday
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
          {projectionIds.map((id) => {
            return <TaskProjection projectionId={id} key={id} />;
          })}

          {dndState.type == "is-task-over" && projectionIds.length == 0 && (
            <DropTaskIndicator />
          )}

          {/* Add new task button and input */}
          <div className="mt-2">
            <AddTaskColumnButton dailyList={dailyList} onTaskAdd={onTaskAdd} />
          </div>
        </div>
      </div>
    </ColumnListProvider>
  );
};

const ProjectSuggestions = ({
  projectId,
  dailyListsIds,
}: {
  projectId: string;
  dailyListsIds: string[];
}) => {
  const project = useAppSelector((state) =>
    projectsSlice.byIdOrDefault(state, projectId),
  );

  const taskIds = useAppSelector((state) =>
    dailyListsSlice.notDoneTaskIdsExceptDailies(
      state,
      projectId,
      dailyListsIds,
    ),
  );

  if (taskIds.length == 0) return null;

  return (
    <ParentListItemProvider
      focusKey={buildFocusKey(projectId, project.type, "TaskSuggestions")}
      priority={project.orderToken}
    >
      <div className="text-gray-400 text-sm mt-6 pb-2">
        {project.icon || "🟡"} {project.title}
      </div>

      <div className="flex flex-col gap-2">
        {taskIds.map((id) => (
          <TaskComp taskBoxId={id} taskId={id} key={id} showProject={false} />
        ))}
      </div>
    </ParentListItemProvider>
  );
};
const TaskSuggestions = ({ dailyListsIds }: { dailyListsIds: string[] }) => {
  const selectedProjectIds = useAppSelector((state) =>
    allProjectsSlice.childrenIds(state),
  );

  // TODO: feilter by selectedProjectIds
  // const selectedProjectIds = useSelectedProjectIds(
  //   (state) => state.selectedProjectIds,
  // );
  // const selectedProjects =
  //   selectedProjectIds.length > 0
  //     ? allProjectsList.children.filter((project) =>
  //         selectedProjectIds.includes(project.id),
  //       )
  //     : allProjectsList.children;

  return (
    <div className="overflow-y-auto h-full">
      {selectedProjectIds.map((projectId) => (
        <ProjectSuggestions
          key={projectId}
          projectId={projectId}
          dailyListsIds={dailyListsIds}
        />
      ))}
    </div>
  );
};

const BoardView = ({
  handleNextDay,
  handlePrevDay,
  dailyListsIds,
}: {
  handleNextDay: () => void;
  handlePrevDay: () => void;
  dailyListsIds: string[];
}) => {
  const daysToShow = useDaysPreferences((state) => state.daysWindow);
  const setDaysWindow = useDaysPreferences((state) => state.setDaysWindow);
  const store = useAppStore();

  const selectedProjectIds = useSelectedProjectIds(
    (state) => state.selectedProjectIds,
  );
  const setSelectedProjectIds = useSelectedProjectIds(
    (state) => state.setSelectedProjectIds,
  );

  const handleAddTask = useCallback(
    (dailyList: DailyList) => {
      const projection = dailyListsSlice.createProjection(
        store,
        dailyList.id,
        inboxId,
        "prepend",
        "prepend",
      );

      focusSlice.editByKey(
        store,
        buildFocusKey(projection.id, projection.type),
      );
    },
    [store],
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
            {/* <MultiSelect */}
            {/*   options={projectsList} */}
            {/*   onValueChange={setSelectedProjectIds} */}
            {/*   defaultValue={selectedProjectIds} */}
            {/*   placeholder="Select Projects" */}
            {/*   variant="inverted" */}
            {/*   maxCount={2} */}
            {/* /> */}
          </div>

          <div className="flex items-center space-x-1">
            {[1, 2, 3, 4, 5, 6, 7].map((dayCount) => (
              <button
                key={dayCount}
                onClick={() => setDaysWindow(dayCount)}
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
            {dailyListsIds.map((id, i) => (
              <ColumnView
                dailyListId={id}
                onTaskAdd={handleAddTask}
                orderNumber={i}
                key={id}
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
          <TaskSuggestions dailyListsIds={dailyListsIds} />
        </div>
      </ColumnListProvider>
    </div>
  );
};

type DaysPreferences = {
  daysWindow: number;
  daysShift: number;

  setDaysWindow: (value: number) => void;
  setDaysShift: (value: number) => void;
};

const useDaysPreferences = create<DaysPreferences>()(
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

export const Board = () => {
  const daysToShow = useDaysPreferences((state) => state.daysWindow);
  const daysShift = useDaysPreferences((state) => state.daysShift);
  const setDaysShift = useDaysPreferences((state) => state.setDaysShift);

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
    setDaysShift(daysShift - 1);
  }, [daysShift, setDaysShift]);

  // Handle next day
  const handleNextDay = useCallback((): void => {
    setDaysShift(daysShift + 1);
  }, [daysShift, setDaysShift]);

  const dailyListsIds = useAppSelector((state) =>
    dailyListsSlice.idsByDates(state, weekDays),
  );
  const store = useAppStore();

  useEffect(() => {
    dailyListsSlice.createManyIfNotPresent(store, weekDays);
  }, [store, weekDays]);

  return (
    <BoardView
      handleNextDay={handleNextDay}
      handlePrevDay={handlePrevDay}
      dailyListsIds={dailyListsIds}
    />
  );
};
