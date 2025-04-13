import { observer } from "mobx-react-lite";
import { Project, TaskTemplate } from "../../models/models";
import { TaskComp } from "../Task/Task";
import { detach } from "mobx-keystone";
import { buildFocusKey, focusManager } from "@/states/FocusManager";
import { ColumnListProvider } from "@/hooks/ParentListProvider";
import { useRegisterFocusItem } from "@/hooks/useLists";

const AddTaskButton = observer(function AddTaskButtonComp({
  project,
  onTaskAdd,
}: {
  project: Project;
  onTaskAdd: (project: Project) => void;
}) {
  const id = "add-task-button-" + project.id;
  const focusItem = useRegisterFocusItem(
    buildFocusKey(id, id, "AddTaskButton"),
    "zzzzzzzzzzzzzzzz",
  );

  return (
    <button
      data-focusable-key={focusItem.key}
      onClick={() => onTaskAdd(project)}
      className="w-full p-2 border border-dashed border-gray-600 rounded-lg text-gray-400 text-sm hover:bg-gray-700 transition cursor-pointer"
    >
      + Add Task
    </button>
  );
});

export const ProjectItemsList = observer(function ProjectItemsListComp({
  project,
}: {
  project: Project;
}) {
  const onAddNewTask = () => {
    const newTask = project.createTask("prepend");

    focusManager.editByKey(buildFocusKey(newTask.id, newTask.$modelType));
  };

  return (
    <ColumnListProvider
      focusKey={buildFocusKey(
        project.id,
        project.$modelType,
        "ProjectItemsList",
      )}
      priority="500"
    >
      <div className="bg-gray-800 rounded-lg shadow-lg p-4 flex flex-col h-full border border-gray-700 overflow-y-auto">
        <div className="flex flex-col ">
          <div className="flex items-center">
            <h2
              className="text-xl font-bold text-gray-100 cursor-pointer"
              onClick={() => {
                const title = prompt("Project title", project.title);
                if (title) {
                  project.setTitle(title);
                }
              }}
            >
              {project.title}
            </h2>

            <button
              className="ml-auto text-red-700"
              onClick={() => {
                detach(project);
              }}
            >
              Delete
            </button>
          </div>
          <div className="flex flex-col space-y-2 mt-5 overflow-y-auto">
            {project.children.map((task) => {
              if (task instanceof TaskTemplate) {
                return "";
              }

              return (
                <TaskComp
                  task={task}
                  listItem={task}
                  key={task.id}
                  showProject={false}
                />
              );
            })}
          </div>

          {/* Add new task button and input */}
          <div className="mt-2">
            <AddTaskButton project={project} onTaskAdd={onAddNewTask} />
          </div>
        </div>
      </div>
    </ColumnListProvider>
  );
});
