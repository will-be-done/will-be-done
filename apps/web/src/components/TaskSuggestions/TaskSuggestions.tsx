import {
  ColumnListProvider,
  ParentListItemProvider,
} from "@/hooks/ParentListProvider";
import { buildFocusKey } from "@/states/FocusManager";
import { useSuggestionsStore } from "./suggestionsStore";
import { useShallow } from "zustand/react/shallow";
import { useAppSelector } from "@/hooks/state";
import {
  allProjectsSlice,
  dailyListsSlice,
  projectsSlice,
} from "@/models/models2";
import { TaskComp } from "../Task/Task";
import { useEffect } from "react";

const ProjectSuggestions = ({
  projectId,
  orderNumber,
}: {
  projectId: string;
  orderNumber: string;
}) => {
  const exceptDailyListIds = useSuggestionsStore(
    useShallow((state) => state.exceptDailyListIds),
  );

  const project = useAppSelector((state) =>
    projectsSlice.byIdOrDefault(state, projectId),
  );

  const taskIds = useAppSelector((state) =>
    dailyListsSlice.notDoneTaskIdsExceptDailies(
      state,
      projectId,
      exceptDailyListIds,
    ),
  );

  if (taskIds.length == 0) return null;

  return (
    <ParentListItemProvider
      focusKey={buildFocusKey(projectId, project.type, "TaskSuggestions")}
      priority={orderNumber}
    >
      <div>
        <div className="text-gray-400 text-sm pb-2">
          {project.icon || "🟡"} {project.title}
        </div>

        <div className="flex flex-col gap-2">
          {taskIds.map((id, i) => (
            <TaskComp
              taskBoxId={id}
              orderNumber={i.toString()}
              taskId={id}
              key={id}
              showProject={false}
            />
          ))}
        </div>
      </div>
    </ParentListItemProvider>
  );
};

const TaskSuggestionsBody = () => {
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

export const TaskSuggestions = () => {
  return (
    <ColumnListProvider
      focusKey={buildFocusKey(
        "task-suggestions",
        "task-suggestions",
        "BoardView",
      )}
      priority="500"
    >
      {/* 20% section (1/5 columns) */}
      <div className="shadow-lg p-4 pr-0 flex flex-col h-full h-full overflow-y-auto">
        <TaskSuggestionsBody />
      </div>
    </ColumnListProvider>
  );
};
