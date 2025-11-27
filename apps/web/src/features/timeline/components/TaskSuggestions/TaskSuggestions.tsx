import {
  ColumnListProvider,
  ParentListItemProvider,
} from "@/features/focus/components/ParentListProvider.tsx";
import { buildFocusKey, focusSlice2 } from "@/store2/slices/focusSlice.ts";
import { useSuggestionsStore } from "./suggestionsStore";
import { useShallow } from "zustand/react/shallow";
import { TaskComp } from "@/components/Task/Task";
import { useFilterStore } from "./filterStore";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useSyncSelector } from "@will-be-done/hyperdb";
import {
  projectsAllSlice,
  dailyListsSlice,
  projectsSlice,
  Task,
} from "@will-be-done/slices";
import { useMemo } from "react";

function ProjectSuggestions({
  projectId,
  orderNumber,
}: {
  projectId: string;
  orderNumber: string;
}) {
  const exceptDailyListIds = useSuggestionsStore(
    useShallow((state) => state.exceptDailyListIds),
  );
  const isProjectCollapsed = useFilterStore((state) =>
    state.isProjectCollapsed(projectId),
  );
  const toggleCollapsedProjectId = useFilterStore(
    (state) => state.toggleCollapsedProjectId,
  );

  const taskHorizons = useFilterStore(useShallow((state) => state.horizons));

  const project = useSyncSelector(
    () => projectsSlice.byIdOrDefault(projectId),
    [projectId],
  );

  const id = useSyncSelector(() => focusSlice2.getFocusedModelId(), []);
  const idsToAlwaysInclude = useMemo(() => (id ? [id] : []), [id]);
  const taskIds = useSyncSelector(
    () =>
      dailyListsSlice.notDoneTaskIdsExceptDailies(
        projectId,
        exceptDailyListIds,
        taskHorizons,
        idsToAlwaysInclude,
      ),
    [exceptDailyListIds, idsToAlwaysInclude, projectId, taskHorizons],
  );

  const preferredHorizon = useFilterStore((state) =>
    state.getPreferredHorizon(),
  );

  if (taskIds.length == 0) return null;

  return (
    <ParentListItemProvider
      focusKey={buildFocusKey(projectId, project.type, "TaskSuggestions")}
      priority={orderNumber}
      disabled={isProjectCollapsed}
    >
      <div>
        <button
          className="text-gray-400 pb-2 cursor-pointer flex items-center "
          onClick={() => toggleCollapsedProjectId(projectId)}
        >
          {project.icon || "🟡"} {project.title}
          {isProjectCollapsed ? (
            <ChevronRight className="inline-block ml-1" size={16} />
          ) : (
            <ChevronDown className="inline-block ml-1" size={16} />
          )}
        </button>

        {!isProjectCollapsed && (
          <div className="flex flex-col gap-2">
            {taskIds.map((id, i) => (
              <TaskComp
                taskBoxId={id}
                orderNumber={i.toString()}
                taskId={id}
                key={id}
                displayedUnderProjectId={projectId}
                newTaskParams={{ horizon: preferredHorizon }}
                displayLastProjectionTime
              />
            ))}
          </div>
        )}
      </div>
    </ParentListItemProvider>
  );
}

const TaskSuggestionsBody = () => {
  const selectedProjectIds = useSyncSelector(
    () => projectsAllSlice.childrenIds(),
    [],
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
    <div className="overflow-y-auto h-full flex flex-col gap-6 pr-4">
      {selectedProjectIds.map((projectId, i) => (
        <ProjectSuggestions
          key={projectId}
          projectId={projectId}
          orderNumber={i.toString()}
        />
      ))}
    </div>
  );
};

const HorizonCheck = ({ horizon }: { horizon: Task["horizon"] }) => {
  const setTaskHorizons = useFilterStore((state) => state.setHorizons);
  const horizons = useFilterStore((state) => state.horizons);

  return (
    <label className="ml-2">
      <input
        type="checkbox"
        className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
        checked={horizons.includes(horizon)}
        onChange={(e) => {
          setTaskHorizons(
            e.target.checked
              ? [...horizons, horizon]
              : horizons.filter((h) => h !== horizon),
          );
        }}
      />{" "}
      {horizon}
    </label>
  );
};

export const TaskSuggestions = () => {
  return (
    <ColumnListProvider
      focusKey={buildFocusKey(
        "task-suggestions",
        "task-suggestions",
        "BoardView",
      )}
      priority="0"
    >
      <div className="gap-2">
        <HorizonCheck horizon="someday" />
        <HorizonCheck horizon="week" />
        <HorizonCheck horizon="month" />
        <HorizonCheck horizon="year" />
      </div>
      {/* 20% section (1/5 columns) */}
      <div className="shadow-lg p-4 pr-0 flex flex-col h-full h-full overflow-y-auto">
        <TaskSuggestionsBody />
      </div>
    </ColumnListProvider>
  );
};
