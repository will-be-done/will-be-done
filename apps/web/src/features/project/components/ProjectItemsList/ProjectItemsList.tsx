import { TaskComp } from "../../../../components/Task/Task.tsx";
import { buildFocusKey, focusSlice } from "@/store/slices/focusSlice.ts";
import {
  ColumnListProvider,
  ParentListItemProvider,
} from "@/features/focus/components/ParentListProvider.tsx";
import { generateKeyBetween } from "fractional-indexing-jittered";
import { useRegisterFocusItem } from "@/features/focus/hooks/useLists.ts";
import {
  EmojiPicker,
  EmojiPickerContent,
  EmojiPickerSearch,
} from "../../../../components/ui/emoji-picker.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../../../components/ui/popover.tsx";
import { useGlobalListener } from "@/features/global-listener/hooks.tsx";
import { useCallback, useRef } from "react";
import { isInputElement } from "@/utils/isInputElement.ts";
import { cn } from "@/lib/utils.ts";
import { useAppSelector, useAppStore } from "@/hooks/stateHooks.ts";
import { padStart } from "es-toolkit/compat";
import { tasksSlice } from "@/store/slices/tasksSlice.ts";
import { Project, projectsSlice } from "@/store/slices/projectsSlice.ts";

const AddTaskButton = ({
  project,
  onTaskAdd,
}: {
  project: Project;
  onTaskAdd: (project: Project) => void;
}) => {
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
};

const ProjectTitle = ({ project }: { project: Project }) => {
  const ref = useRef<HTMLDivElement | null>(null);

  const focusableItem = useRegisterFocusItem(
    buildFocusKey(project.id, project.type, "ProjectTitle"),
    "0",
  );

  const isFocused = useAppSelector((state) =>
    focusSlice.isFocused(state, focusableItem.key),
  );
  const isEditing = useAppSelector((state) =>
    focusSlice.isEditing(state, focusableItem.key),
  );

  // useGlobalListener("mousedown", (e: MouseEvent) => {
  //   const isFocusDisabled = focusSlice.isFocusDisabled(store.getState());
  //
  //   if (
  //     isFocused &&
  //     ref.current &&
  //     !ref.current.contains(e.target as Node) &&
  //     !isFocusDisabled &&
  //     !e.defaultPrevented
  //   ) {
  //     focusSlice.resetFocus(store);
  //   }
  // });

  useGlobalListener("keydown", (e: KeyboardEvent) => {
    const isSomethingEditing = focusSlice.isSomethingEditing(store.getState());
    const isFocusDisabled = focusSlice.isFocusDisabled(store.getState());
    if (isSomethingEditing) return;
    if (!isFocused) return;
    if (isFocusDisabled || e.defaultPrevented) return;

    const target =
      e.target instanceof Element ? e.target : document.activeElement;
    if (target && isInputElement(target)) return;

    const noModifiers = !(e.shiftKey || e.ctrlKey || e.metaKey);

    if ((e.code === "Enter" || e.code === "KeyI") && noModifiers) {
      e.preventDefault();

      focusSlice.editByKey(store, focusableItem.key);
    }
  });

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === "Enter" && !e.shiftKey) || e.key === "Escape") {
      e.preventDefault();

      focusSlice.resetEdit(store);
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
              projectsSlice.update(store, project.id, {
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
          className={cn({ hidden: !isEditing })}
          value={project.title}
          onChange={(e) => {
            projectsSlice.update(store, project.id, {
              title: e.target.value,
            });
          }}
          onKeyDown={handleInputKeyDown}
        />
        <span
          onDoubleClick={(e) => {
            focusSlice.editByKey(store, focusableItem.key);
          }}
          className={cn("select-none", {
            hidden: isEditing,
          })}
        >
          {project.title}
        </span>
      </span>
    </h2>
  );
};

export const ProjectItemsList = ({ project }: { project: Project }) => {
  const store = useAppStore();
  const doneChildrenIds = useAppSelector((state) =>
    projectsSlice.doneChildrenIds(state, project.id),
  );
  const notDoneChildrenIds = useAppSelector((state) =>
    projectsSlice.childrenIds(state, project.id),
  );

  const onAddNewTask = useCallback(() => {
    const newTask = projectsSlice.createTask(store, project.id, "prepend");

    focusSlice.editByKey(store, buildFocusKey(newTask.id, newTask.type));
  }, [project.id, store]);

  const lastTaskI =
    notDoneChildrenIds.length == 0 ? 0 : notDoneChildrenIds.length - 1;
  // const lastTaskId = notDoneChildrenIds[notDoneChildrenIds.length - 1];
  // const lastTask = useAppSelector((state) =>
  //   lastTaskId ? tasksSlice.byIdOrDefault(state, lastTaskId) : null,
  // );
  // const notDonePriority = generateKeyBetween(
  //   lastTask?.orderToken || null,
  //   null,
  // );

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
                  projectsSlice.delete(store, project.id);
                }
              }}
            >
              Delete
            </button>
          </div>
          <div className="flex flex-col space-y-2 mt-5 overflow-y-auto">
            {notDoneChildrenIds.map((id, i) => {
              return (
                <TaskComp
                  orderNumber={i.toString()}
                  key={id}
                  taskId={id}
                  taskBoxId={id}
                  showProject={false}
                />
              );
            })}
            <ParentListItemProvider
              focusKey={buildFocusKey(
                project.id,
                project.type,
                "DoneProjectionsList",
              )}
              priority={(lastTaskI + 1).toString()}
            >
              {doneChildrenIds.map((id, i) => {
                return (
                  <TaskComp
                    orderNumber={i.toString()}
                    key={id}
                    taskId={id}
                    taskBoxId={id}
                    showProject={false}
                  />
                );
              })}
            </ParentListItemProvider>
          </div>

          {/* Add new task button and input */}
          <div className="mt-2">
            <AddTaskButton project={project} onTaskAdd={onAddNewTask} />
          </div>
        </div>
      </div>
    </ColumnListProvider>
  );
};
