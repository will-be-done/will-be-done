import { observer } from "mobx-react-lite";
import { getRootStore, Project, TaskTemplate } from "../../models/models";
import { TaskComp } from "../Task/Task";
import { useEffect } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { Edge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/dist/types/types";
import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { isTaskPassingData } from "../../dnd/models";
import { currentProjectionState } from "../../states/task";

export const ProjectItemsList = observer(function ProjectItemsListComp({
  project,
}: {
  project: Project;
}) {
  const rootStore = getRootStore();
  const { listsService, tasksService } = rootStore;

  const onAddNewTask = () => {
    const task = tasksService.createTask(project, [
      project.lastChild,
      undefined,
    ]);

    currentProjectionState.setFocusedItemId(task.id);
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

          const sourceProjection = listsService.findListItemOrThrow(
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

            targetList.addListItemFromOtherList(
              sourceProjection,
              targetProjection,
              closestEdgeOfTarget || "bottom",
            );

            return;
          }
        },
      }),
    );
  }, [listsService]);

  return (
    <div className="bg-gray-800 rounded-lg shadow-lg p-4 flex flex-col h-full border border-gray-700 overflow-y-auto">
      <div className="flex flex-col ">
        <div className="flex items-center">
          <h2 className="text-xl font-bold text-gray-100">{project.title}</h2>
          {project.id}
        </div>
        <div className="flex flex-col space-y-2 mt-5 overflow-y-auto">
          {project.children.map((task) => {
            if (task instanceof TaskTemplate) {
              return "";
            }

            return <TaskComp task={task} listItem={task} key={task.id} />;
          })}
        </div>

        {/* Add new task button and input */}
        <div className="mt-2">
          <button
            onClick={onAddNewTask}
            className="w-full p-2 border border-dashed border-gray-600 rounded-lg text-gray-400 text-sm hover:bg-gray-700 transition cursor-pointer"
          >
            + Add Task
          </button>
        </div>
      </div>
    </div>
  );
});
