import { observer } from "mobx-react-lite";
import {
  Project,
  projectsActions,
  projectsSelectors,
} from "../../models/models2";
import { TaskComp } from "../Task/Task";
import { buildFocusKey, focusManager } from "@/states/FocusManager";
import { ColumnListProvider } from "@/hooks/ParentListProvider";
import { useRegisterFocusItem } from "@/hooks/useLists";
import {
  EmojiPicker,
  EmojiPickerContent,
  EmojiPickerSearch,
} from "../ui/emoji-picker";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { useGlobalListener } from "@/globalListener/hooks";
import { useCallback, useRef } from "react";
import { isInputElement } from "@/utils/isInputElement";
import { cn } from "@/lib/utils";
import { useAppSelector, useAppStore } from "@/hooks/state";

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

const ProjectTitle = observer(function ProjectTitleComp({
  project,
}: {
  project: Project;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  const focusableItem = useRegisterFocusItem(
    buildFocusKey(project.id, project.type, "ProjectTitle"),
    "0",
  );

  useGlobalListener("mousedown", (e: MouseEvent) => {
    if (
      focusableItem.isFocused &&
      ref.current &&
      !ref.current.contains(e.target as Node) &&
      !focusManager.isFocusDisabled &&
      !e.defaultPrevented
    ) {
      focusManager.resetFocus();
    }
  });

  useGlobalListener("keydown", (e: KeyboardEvent) => {
    if (focusManager.isSomethingEditing) return;
    if (!focusableItem.isFocused) return;
    if (focusManager.isFocusDisabled || e.defaultPrevented) return;

    const target =
      e.target instanceof Element ? e.target : document.activeElement;
    if (target && isInputElement(target)) return;

    const noModifiers = !(e.shiftKey || e.ctrlKey || e.metaKey);

    if ((e.code === "Enter" || e.code === "KeyI") && noModifiers) {
      e.preventDefault();

      focusableItem.edit();
    }
  });

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === "Enter" && !e.shiftKey) || e.key === "Escape") {
      e.preventDefault();
      focusManager.resetEdit();
    }
  };

  const store = useAppStore();

  return (
    <h2 className="text-xl font-bold text-gray-100 cursor-pointer">
      <Popover>
        <PopoverTrigger asChild>
          <span className="mr-2" tabIndex={0}>
            {project.icon || "🟡"}
          </span>
        </PopoverTrigger>
        <PopoverContent className="w-fit p-0">
          <EmojiPicker
            className="h-[326px] rounded-lg border shadow-md"
            onEmojiSelect={({ emoji }) => {
              projectsActions.update(store, project.id, {
                icon: emoji,
              });
            }}
          >
            <EmojiPickerSearch />
            <EmojiPickerContent />
          </EmojiPicker>
        </PopoverContent>
      </Popover>

      <span data-focusable-key={focusableItem.key} tabIndex={0} ref={ref}>
        <input
          ref={(e) => {
            if (!e) return;
            e.focus();
          }}
          type="text"
          className={cn({ hidden: !focusableItem.isEditing })}
          value={project.title}
          onChange={(e) => {
            projectsActions.update(store, project.id, {
              title: e.target.value,
            });
          }}
          onKeyDown={handleInputKeyDown}
        />
        <span
          onDoubleClick={(e) => {
            // e.preventDefault();
            focusableItem.edit();
          }}
          className={cn("select-none", {
            hidden: focusableItem.isEditing,
          })}
        >
          {project.title}
        </span>
      </span>
    </h2>
  );
});

export const ProjectItemsList = observer(function ProjectItemsListComp({
  project,
}: {
  project: Project;
}) {
  const store = useAppStore();
  const taskIds = useAppSelector((state) =>
    projectsSelectors.childrenIds(state, project.id),
  );

  const onAddNewTask = useCallback(() => {
    const newTask = projectsActions.createTask(store, project.id, "prepend");

    focusManager.editByKey(buildFocusKey(newTask.id, newTask.type));
  }, [project.id, store]);

  return (
    <ColumnListProvider
      focusKey={buildFocusKey(project.id, project.type, "ProjectItemsList")}
      priority="500"
    >
      <div className="bg-gray-800 rounded-lg shadow-lg p-4 flex flex-col h-full border border-gray-700 overflow-y-auto">
        <div className="flex flex-col ">
          <div className="flex items-center">
            <ProjectTitle project={project} />

            <button
              className="ml-auto text-red-700"
              onClick={() => {
                const shouldDelete = confirm(
                  "Are you sure you want to delete this project?",
                );
                if (shouldDelete) {
                  projectsActions.delete(store, project.id);
                }
              }}
            >
              Delete
            </button>
          </div>
          <div className="flex flex-col space-y-2 mt-5 overflow-y-auto">
            {taskIds.map((id) => {
              return (
                <TaskComp taskId={id} taskBoxId={id} showProject={false} />
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
