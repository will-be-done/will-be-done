import { CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import invariant from "tiny-invariant";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview";
import { preserveOffsetOnSource } from "@atlaskit/pragmatic-drag-and-drop/element/preserve-offset-on-source";
import { dropTargetForExternal } from "@atlaskit/pragmatic-drag-and-drop/external/adapter";
import {
  attachClosestEdge,
  type Edge,
  extractClosestEdge,
} from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import ReactDOM, { unstable_batchedUpdates } from "react-dom";
import { DndModelData, isModelDNDData } from "@/features/dnd/models";
import TextareaAutosize from "react-textarea-autosize";
import { usePrevious, useUnmount } from "../../utils";
import { MoveModal } from "@/components/MoveTaskModel/MoveModel";
import { useGlobalListener } from "@/features/global-listener/hooks.tsx";
import { isInputElement } from "../../utils/isInputElement";
import { useRegisterFocusItem } from "@/features/focus/hooks/useLists.ts";
import {
  buildFocusKey,
  FocusKey,
  focusManager,
  focusSlice,
  parseColumnKey,
} from "@/store/slices/focusSlice.ts";
import { useAppSelector, useAppStore } from "@/hooks/stateHooks.ts";
import clsx from "clsx";
import { RotateCw, CircleDashed } from "lucide-react";
import { cn } from "@/lib/utils";
import { startOfDay } from "date-fns";
import {
  appSlice2,
  dropSlice2,
  isTask,
  isTaskProjection,
  isTaskTemplate,
  projectionsSlice2,
  projectItemsSlice2,
  projectsSlice2,
  Task,
  tasksSlice2,
} from "@will-be-done/slices";
import { useDispatch, useSelect, useSyncSelector } from "@will-be-done/hyperdb";

type State =
  | { type: "idle" }
  | { type: "preview"; container: HTMLElement; rect: DOMRect }
  | { type: "dragging" };

const idleState: State = { type: "idle" };
const draggingState: State = { type: "dragging" };

const TaskPrimitive = ({
  title,
  style,
}: {
  title: string;
  style: CSSProperties;
}) => {
  return (
    <div
      className={`p-3 rounded-lg border ${"border-gray-700 bg-gray-750"} shadow-md`}
      style={style}
    >
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-end">
          <input
            type="checkbox"
            className="h-4 w-4 bg-gray-700 border-gray-600 rounded"
          />
        </div>
        <div className="font-medium text-gray-200 h-6">{title}</div>
      </div>
    </div>
  );
};

export const DropTaskIndicator = ({
  direction,
}: {
  direction: "top" | "bottom";
}) => {
  return (
    <div
      className={clsx(
        "absolute left-0 right-0 bottom-0 w-full bg-blue-500 h-[2px]",
        direction == "top" && "top-[-5px]",
        direction == "bottom" && "bottom-[-5px]",
      )}
    ></div>
  );
};

// TODO: rename to project item
// TODO: think about to remove taskBox
export const TaskComp = ({
  taskId,
  taskBoxId,
  displayedUnderProjectId,
  alwaysShowProject,
  orderNumber,
  newTaskParams,
  displayLastProjectionTime,
}: {
  taskId: string;
  taskBoxId: string;
  displayedUnderProjectId?: string;
  alwaysShowProject?: boolean;
  orderNumber: string;
  newTaskParams?: Partial<Task>;
  displayLastProjectionTime?: boolean;
}) => {
  const dispatch = useDispatch();
  const projectItem = useSyncSelector(
    () => projectItemsSlice2.getItemById(taskId),
    [taskId],
  );
  const taskBox = useSyncSelector(
    () => appSlice2.taskBoxByIdOrDefault(taskBoxId),
    [taskBoxId],
  );
  const project = useSyncSelector(
    () => projectsSlice2.byIdOrDefault(projectItem.projectId),
    [projectItem.projectId],
  );
  const lastProjectionTime = useSyncSelector(
    function* () {
      return (yield* projectionsSlice2.lastProjectionOfTask(taskId))?.createdAt;
    },
    [taskId],
  );
  const shouldHighlightProjectionTime =
    lastProjectionTime && startOfDay(new Date()).getTime() > lastProjectionTime;

  const [editingTitle, setEditingTitle] = useState<string>(projectItem.title);
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null);
  const [dndState, setDndState] = useState<State>(idleState);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const store = useAppStore();
  const focusableItem = useRegisterFocusItem(
    buildFocusKey(taskBox.id, taskBox.type),
    orderNumber,
  );

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === "Enter" && !e.shiftKey) || e.key === "Escape") {
      e.preventDefault();

      focusSlice.resetEdit(store);

      // if (e.key === "Enter") {
      //   task.setTitle(editingTitle);
      //   const siblings = taskBox.siblings;
      //   const list = taskBox.listRef.current;
      //   const newItem = list.createChild([taskBox, siblings[1]], listItem);
      //
      //   currentProjectionState.setFocusedItemId(newItem.id);
      // }
    }
  };
  const [dragId, setDragId] = useState<string | undefined>(undefined);

  const isFocused = useAppSelector((state) =>
    focusSlice.isFocused(state, focusableItem.key),
  );
  const isEditing = useAppSelector((state) =>
    focusSlice.isEditing(state, focusableItem.key),
  );
  const select = useSelect();

  const handleTick = useCallback(() => {
    if (!isTask(projectItem)) return;

    const [[up, upModel], [down, downModel]] = select(
      focusManager.getModelSiblings(focusableItem.key),
    );

    const taskState = projectItem.state;
    dispatch(tasksSlice2.toggleState(taskId));

    if (!isFocused) return;

    const upTask = upModel && select(appSlice2.taskOfModel(upModel));
    const downTask = downModel && select(appSlice2.taskOfModel(downModel));

    if (downTask && downTask.state === taskState) {
      focusSlice.focusByKey(store, down.key);
    } else if (upTask && upTask.state === taskState) {
      focusSlice.focusByKey(store, up.key);
    }
  }, [
    dispatch,
    focusableItem.key,
    isFocused,
    projectItem,
    select,
    store,
    taskId,
  ]);

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

    const isAddAfter = noModifiers && (e.code === "KeyA" || e.code === "KeyO");
    const isAddBefore = e.shiftKey && (e.code === "KeyA" || e.code === "KeyO");

    const isMoveUp = e.ctrlKey && (e.code === "ArrowUp" || e.code == "KeyK");
    const isMoveDown = e.ctrlKey && (e.code === "ArrowUp" || e.code == "KeyJ");
    const isMoveLeft =
      e.ctrlKey && (e.code === "ArrowLeft" || e.code == "KeyH");
    const isMoveRight =
      e.ctrlKey && (e.code === "ArrowRight" || e.code == "KeyL");

    const getId = (key: FocusKey) => {
      const { id, type } = parseColumnKey(key);
      return id;
    };

    const scroll = () => {
      ref.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "center",
      });
    };

    if (e.code === "Digit1" && noModifiers) {
      e.preventDefault();

      dispatch(
        tasksSlice2.update(taskId, {
          horizon: "week",
        }),
      );
    } else if (e.code === "Digit2" && noModifiers) {
      e.preventDefault();

      dispatch(
        tasksSlice2.update(taskId, {
          horizon: "month",
        }),
      );
    } else if (e.code === "Digit3" && noModifiers) {
      e.preventDefault();

      dispatch(
        tasksSlice2.update(taskId, {
          horizon: "year",
        }),
      );
    } else if (e.code === "Digit4" && noModifiers) {
      e.preventDefault();

      dispatch(
        tasksSlice2.update(taskId, {
          horizon: "someday",
        }),
      );
    } else if (e.code === "Space" && noModifiers) {
      e.preventDefault();

      handleTick();
    } else if (e.code === "KeyM" && noModifiers) {
      e.preventDefault();

      // NOTE: this is needed to restore focus back correctly after modal close
      ref.current?.focus();
      setIsMoveModalOpen(true);
    } else if (isMoveLeft || isMoveRight) {
      e.preventDefault();

      const [leftColumn, rightColumn] = focusManager.getColumnSiblings(
        focusableItem.key,
      );

      if (isMoveLeft && leftColumn) {
        const id = getId(leftColumn.key);

        dispatch(dropSlice2.handleDrop(id, taskBox.id, "top"));
        scroll();
      } else if (isMoveRight && rightColumn) {
        const id = getId(rightColumn.key);

        dispatch(dropSlice2.handleDrop(id, taskBox.id, "top"));
        scroll();
      }
    } else if (isMoveUp || isMoveDown) {
      e.preventDefault();
      if (isTask(projectItem) && projectItem.state === "done") return;

      const [up, down] = focusManager.getSiblings(focusableItem.key);

      if (isMoveUp && up) {
        const id = getId(up.key);
        if (!id) return;

        const model = dispatch(appSlice2.byId(id));
        if (!model) return;

        let edge: "top" | "bottom" = "top";
        if (isTask(model) && isTask(taskBox)) {
          if (model.projectId === taskBox.projectId) {
            edge = "top";
          } else {
            edge = "bottom";
          }
        } else if (isTaskProjection(model) && isTaskProjection(taskBox)) {
          if (model.dailyListId === taskBox.dailyListId) {
            edge = "top";
          } else {
            edge = "bottom";
          }
        } else {
          edge = "top";
        }

        dispatch(dropSlice2.handleDrop(id, taskBox.id, edge));

        scroll();
      } else if (isMoveDown && down) {
        const id = getId(down.key);
        if (!id) return;

        const model = dispatch(appSlice2.byId(id));
        if (!model) return;

        let edge: "top" | "bottom" = "top";
        if (isTask(model) && isTask(taskBox)) {
          if (model.projectId === taskBox.projectId) {
            edge = "bottom";
          } else {
            edge = "top";
          }
        } else if (isTaskProjection(model) && isTaskProjection(taskBox)) {
          if (model.dailyListId === taskBox.dailyListId) {
            edge = "bottom";
          } else {
            edge = "top";
          }
        } else {
          edge = "top";
        }

        dispatch(dropSlice2.handleDrop(id, taskBox.id, edge));

        scroll();
      }

      return;
    } else if (
      (e.code === "Backspace" || e.code === "KeyD" || e.code === "KeyX") &&
      noModifiers
    ) {
      e.preventDefault();

      const [up, down] = focusManager.getSiblings(focusableItem.key);
      dispatch(appSlice2.delete(taskBox.id));

      if (down) {
        focusSlice.focusByKey(store, down.key);
      } else if (up) {
        focusSlice.focusByKey(store, up.key);
      } else {
        focusSlice.resetFocus(store);
      }
    } else if ((e.code === "Enter" || e.code === "KeyI") && noModifiers) {
      e.preventDefault();

      focusSlice.editByKey(store, focusableItem.key);
    } else if (isAddAfter || isAddBefore) {
      if (isTask(projectItem) && projectItem.state === "done") return;

      e.preventDefault();

      unstable_batchedUpdates(() => {
        // TODO: maybe pass as prop to Task component
        const newBox = dispatch(
          appSlice2.createTaskBoxSibling(
            taskBox,
            isAddAfter ? "after" : "before",
            newTaskParams,
          ),
        );
        focusSlice.editByKey(store, buildFocusKey(newBox.id, newBox.type));
      });

      return;
    }
  });

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

  const handleMove = (projectId: string) => {
    setIsMoveModalOpen(false);
    dispatch(
      tasksSlice2.update(taskId, {
        projectId,
      }),
    );
  };

  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    invariant(element);

    if (isEditing) return;

    return combine(
      draggable({
        element: element,
        getInitialData: (): DndModelData => ({
          modelId: taskBox.id,
          modelType: taskBox.type,
        }),
        onGenerateDragPreview: ({ location, source, nativeSetDragImage }) => {
          const rect = source.element.getBoundingClientRect();

          setCustomNativeDragPreview({
            nativeSetDragImage,
            getOffset: preserveOffsetOnSource({
              element,
              input: location.current.input,
            }),
            render({ container }) {
              setDndState({ type: "preview", container, rect });

              return () => {
                setDndState(draggingState);
              };
            },
          });
        },

        onDragStart: () => setDndState(draggingState),
        onDrop: () => setDndState(idleState),
      }),
      dropTargetForExternal({
        element: element,
      }),
      dropTargetForElements({
        element: element,
        canDrop: ({ source }) => {
          const data = source.data;
          if (!isModelDNDData(data)) return false;

          return select(dropSlice2.canDrop(taskBox.id, data.modelId));
        },
        getIsSticky: () => true,
        getData: ({ input, element }) => {
          const data: DndModelData = {
            modelId: taskBox.id,
            modelType: taskBox.type,
          };

          return attachClosestEdge(data, {
            input,
            element,
            allowedEdges: ["top", "bottom"],
          });
        },
        onDragEnter: (args) => {
          const data = args.source.data;
          if (isModelDNDData(data)) {
            setDragId(data.modelId);
            setClosestEdge(extractClosestEdge(args.self.data));
          }
        },
        onDrag: (args) => {
          const data = args.source.data;

          if (isModelDNDData(data)) {
            setDragId(data.modelId);
            setClosestEdge(extractClosestEdge(args.self.data));
          }
        },
        onDragLeave: () => {
          setDragId(undefined);
          setClosestEdge(null);
        },
        onDrop: () => {
          setDragId(undefined);
          setClosestEdge(null);
        },
      }),
    );
  }, [dispatch, isEditing, select, store, taskBox.id, taskBox.type]);

  const handleRef = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.focus();

    el.selectionStart = el.value.length;
  }, []);

  // useEffect(() => {
  //   if (isFocused) {
  //     const el = ref.current;
  //     if (!el) return;
  //
  //     // el.scrollIntoView({
  //     //   behavior: "smooth",
  //     //   block: "center",
  //     //   inline: "center",
  //     // });
  //   }
  // }, [isFocused]);

  const prevIsEditing = usePrevious(isEditing);
  const taskTitle = projectItem.title;
  useEffect(() => {
    setEditingTitle(taskTitle);
  }, [taskTitle]);

  useEffect(() => {
    if (!isEditing && prevIsEditing && editingTitle !== taskTitle) {
      dispatch(
        tasksSlice2.update(taskId, {
          title: editingTitle,
        }),
      );
    }
  }, [
    dispatch,
    editingTitle,
    isEditing,
    prevIsEditing,
    store,
    taskId,
    taskTitle,
  ]);

  useUnmount(() => {
    if (editingTitle !== taskTitle) {
      dispatch(
        tasksSlice2.update(taskId, {
          title: editingTitle,
        }),
      );
    }
  });

  // const [isHidden, setIsHidden] = useState(false);
  // const isSelfDragging = dragId === taskBox.id;
  // useEffect(() => {
  //   const id = setTimeout(() => {
  //     setIsHidden(
  //       (dndState?.type === "dragging" || dndState?.type === "preview") &&
  //         !isSelfDragging,
  //     );
  //   }, 40);
  //
  //   return () => {
  //     clearTimeout(id);
  //   };
  // }, [dndState, isHidden, isSelfDragging]);
  //
  // console.log(
  //   "isSelfDragging",
  //   "dndState",
  //   dndState.type,
  //   "isSelfDragging",
  //   isSelfDragging,
  // );
  //
  // console.log("isHidden", isHidden);

  return (
    <div className="relative">
      {closestEdge == "top" && <DropTaskIndicator direction="top" />}
      <div
        data-focusable-key={focusableItem.key}
        tabIndex={0}
        className={clsx(
          `relative p-3 rounded-lg border  shadow-md  whitespace-break-spaces [overflow-wrap:anywhere]`,
          isFocused
            ? "border-blue-500 bg-gray-700"
            : "border-gray-700 bg-gray-750",

          // (dndState.type === "dragging" || dndState.type === "preview") &&
          //   !isSelfDragging &&
          //   "hidden",

          // isHidden && "hidden",
          // isSelfDragging && "h-12",
        )}
        style={{}}
        onClick={() => focusSlice.focusByKey(store, focusableItem.key, true)}
        onDoubleClick={(e) => {
          focusSlice.editByKey(store, focusableItem.key);
        }}
        ref={ref}
      >
        {/* {!isSelfDragging && ( */}
        <>
          <div className="absolute top-2 right-2 flex gap-1">
            {isTaskTemplate(projectItem) && (
              <CircleDashed className="h-3 w-3 text-gray-400" />
            )}
            {isTask(projectItem) && projectItem.templateId && (
              <RotateCw className="h-3 w-3 text-gray-400" />
            )}
          </div>
          <div className="flex items-start gap-2">
            {isEditing ? (
              <>
                <div className="flex items-center justify-end">
                  <input
                    key={projectItem.id}
                    type="checkbox"
                    className="h-4 w-4 bg-gray-700 border-gray-600 rounded mt-1"
                    aria-label="Task completion status"
                  />
                </div>
                <TextareaAutosize
                  ref={handleRef}
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onKeyDown={(e) => handleInputKeyDown(e)}
                  className="w-full bg-transparent text-gray-200 placeholder-gray-400 resize-none focus:outline-none "
                  aria-label="Edit task title"
                />
              </>
            ) : (
              <>
                {isTask(projectItem) && (
                  <>
                    <div className="flex justify-end">
                      <input
                        type="checkbox"
                        className="h-4 w-4 bg-gray-700 border-gray-600 rounded mt-1"
                        checked={projectItem.state === "done"}
                        onChange={(e) => {
                          handleTick();
                        }}
                        aria-label="Task completion status"
                      />
                    </div>
                  </>
                )}
              </>
            )}
          </div>
          <div className="flex justify-between  mt-3 text-gray-400 text-sm">
            <div>{projectItem.horizon}</div>

            {lastProjectionTime !== undefined &&
              lastProjectionTime !== 0 &&
              displayLastProjectionTime && (
                <div
                  className={cn("text-center text-gray-400", {
                    "text-amber-400": shouldHighlightProjectionTime,
                  })}
                >
                  {new Date(lastProjectionTime).toLocaleDateString("en-US", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </div>
              )}
            {(alwaysShowProject || displayedUnderProjectId !== project.id) && (
              <div className="text-right text-gray-400 ">
                {project.icon || "🟡"} {project.title}
              </div>
            )}
          </div>
        </>
        {/* )} */}
      </div>
      {closestEdge == "bottom" && <DropTaskIndicator direction="bottom" />}

      {/* {!isSelfDragging && closestEdge == "bottom" && <DropTaskIndicator />} */}

      {dndState.type === "preview" &&
        ReactDOM.createPortal(
          <TaskPrimitive
            title={projectItem.title}
            style={{
              boxSizing: "border-box",
              width: dndState.rect.width,
              height: dndState.rect.height,
            }}
          />,
          dndState.container,
        )}

      {isMoveModalOpen && (
        <MoveModal
          setIsOpen={setIsMoveModalOpen}
          handleMove={handleMove}
          exceptProjectId={project.id}
        />
      )}
    </div>
  );
};
