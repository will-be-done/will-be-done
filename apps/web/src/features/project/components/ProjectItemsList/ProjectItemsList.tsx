import { TaskComp } from "../../../../components/Task/Task.tsx";
import { buildFocusKey, focusSlice2 } from "@/store2/slices/focusSlice.ts";
import {
  ColumnListProvider,
  ParentListItemProvider,
} from "@/features/focus/components/ParentListProvider.tsx";
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
import { useCallback, useMemo, useRef } from "react";
import { isInputElement } from "@/utils/isInputElement.ts";
import { cn } from "@/lib/utils.ts";
import {
  select,
  useDB,
  useDispatch,
  useSyncSelector,
} from "@will-be-done/hyperdb";
import {
  Project,
  projectItemsSlice2,
  projectsSlice2,
} from "@will-be-done/slices";

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
    "01",
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
    "00",
  );

  const isFocused = useSyncSelector(
    () => focusSlice2.isFocused(focusableItem.key),
    [focusableItem.key],
  );
  const isEditing = useSyncSelector(
    () => focusSlice2.isEditing(focusableItem.key),
    [focusableItem.key],
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

  const db = useDB();
  const dispatch = useDispatch();
  useGlobalListener("keydown", (e: KeyboardEvent) => {
    const isSomethingEditing = select(db, focusSlice2.isSomethingEditing());
    const isFocusDisabled = select(db, focusSlice2.isFocusDisabled());
    if (isSomethingEditing) return;
    if (!isFocused) return;
    if (isFocusDisabled || e.defaultPrevented) return;

    const target =
      e.target instanceof Element ? e.target : document.activeElement;
    if (target && isInputElement(target)) return;

    const noModifiers = !(e.shiftKey || e.ctrlKey || e.metaKey);

    if ((e.code === "Enter" || e.code === "KeyI") && noModifiers) {
      e.preventDefault();

      dispatch(focusSlice2.editByKey(focusableItem.key));
    }
  });

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === "Enter" && !e.shiftKey) || e.key === "Escape") {
      e.preventDefault();

      dispatch(focusSlice2.resetEdit());
    }
  };

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
              dispatch(
                projectsSlice2.update(project.id, {
                  icon: emoji,
                }),
              );
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
            dispatch(
              projectsSlice2.update(project.id, {
                title: e.target.value,
              }),
            );
          }}
          onKeyDown={handleInputKeyDown}
        />
        <span
          onDoubleClick={(e) => {
            dispatch(focusSlice2.editByKey(focusableItem.key));
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
  const dispatch = useDispatch();
  const id = useSyncSelector(() => focusSlice2.getFocusedModelId(), []);
  const idsToAlwaysInclude = useMemo(() => (id ? [id] : []), [id]);

  const doneChildrenIds = useSyncSelector(
    () => projectItemsSlice2.doneChildrenIds(project.id, idsToAlwaysInclude),
    [project.id, idsToAlwaysInclude],
  );
  const notDoneChildrenIds = useSyncSelector(
    () => projectItemsSlice2.childrenIds(project.id, idsToAlwaysInclude),
    [project.id, idsToAlwaysInclude],
  );

  const onAddNewTask = useCallback(() => {
    const newTask = dispatch(
      projectItemsSlice2.createTask(project.id, "prepend"),
    );

    dispatch(focusSlice2.editByKey(buildFocusKey(newTask.id, newTask.type)));
  }, [dispatch, project.id]);

  const lastTaskI =
    notDoneChildrenIds.length == 0 ? 0 : notDoneChildrenIds.length - 1;

  console.log({ doneChildrenIds, notDoneChildrenIds });

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
                  dispatch(projectsSlice2.delete([project.id]));
                }
              }}
            >
              Delete
            </button>
          </div>

          {/* Add new task button and input */}
          <div className="my-5">
            <AddTaskButton project={project} onTaskAdd={onAddNewTask} />
          </div>

          <div className="flex flex-col space-y-2 overflow-y-auto">
            {notDoneChildrenIds.map((id, i) => {
              return (
                <TaskComp
                  orderNumber={(i + 2).toString()}
                  key={id}
                  taskId={id}
                  taskBoxId={id}
                  displayedUnderProjectId={project.id}
                  displayLastProjectionTime
                />
              );
            })}
            <ParentListItemProvider
              focusKey={buildFocusKey(
                project.id,
                project.type,
                "DoneProjectionsList",
              )}
              priority={(lastTaskI + 2).toString()}
            >
              {doneChildrenIds.map((id, i) => {
                return (
                  <TaskComp
                    displayLastProjectionTime
                    orderNumber={i.toString()}
                    key={id}
                    taskId={id}
                    taskBoxId={id}
                    displayedUnderProjectId={project.id}
                  />
                );
              })}
            </ParentListItemProvider>
          </div>
        </div>
      </div>
    </ColumnListProvider>
  );
};
