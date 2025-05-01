import { observer } from "mobx-react-lite";
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
import ReactDOM from "react-dom";
import { DndModelData, isModelDNDData } from "../../dnd/models";
import TextareaAutosize from "react-textarea-autosize";
import { usePrevious, useUnmount } from "../../utils";
import { MoveModal } from "../MoveModel/MoveModel";
import { useGlobalListener } from "../../globalListener/hooks";
import { isInputElement } from "../../utils/isInputElement";
import { useRegisterFocusItem } from "@/hooks/useLists";
import {
  buildFocusKey,
  FocusKey,
  focusManager,
  parseColumnKey,
} from "@/states/FocusManager";
import {
  appSlice,
  dropActions,
  dropSelectors,
  projectsSlice,
  tasksSlice,
  taskBoxesSlice,
} from "@/models/models2";
import { useAppSelector, useAppStore } from "@/hooks/state";

type State =
  | { type: "idle" }
  | { type: "preview"; container: HTMLElement; rect: DOMRect }
  | { type: "dragging" };

const idleState: State = { type: "idle" };
const draggingState: State = { type: "dragging" };

const TaskPrimitive = observer(function TaskPrimitiveComponent({
  title,
  style,
}: {
  title: string;
  style: CSSProperties;
}) {
  return (
    <div
      className={`p-3 rounded-lg border ${"border-gray-700 bg-gray-750"} shadow-md transition-colors`}
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
});

export const DropTaskIndicator = observer(function DropTaskIndicatorComp() {
  return (
    <div
      className={`p-3 rounded-lg border border-blue-500 bg-gray-700 shadow-md transition-colors h-12`}
    ></div>
  );
});

export const TaskComp = observer(function TaskComponent({
  taskId,
  taskBoxId,
  showProject,
}: {
  taskId: string;
  taskBoxId: string;
  showProject: boolean;
}) {
  const task = useAppSelector((state) =>
    tasksSlice.byIdOrDefault(state, taskId),
  );
  const taskBox = useAppSelector((state) =>
    appSlice.taskBoxByIdOrDefault(state, taskBoxId),
  );
  const project = useAppSelector((state) =>
    projectsSlice.byIdOrDefault(state, task.projectId),
  );

  const [editingTitle, setEditingTitle] = useState<string>(task.title);
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null);
  const [dndState, setDndState] = useState<State>(idleState);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const store = useAppStore();
  const focusableItem = useRegisterFocusItem(
    buildFocusKey(taskBox.id, taskBox.type),
    "orderToken" in taskBox ? taskBox.orderToken : "",
  );

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === "Enter" && !e.shiftKey) || e.key === "Escape") {
      e.preventDefault();
      focusManager.resetEdit();

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

  const handleTick = useCallback(
    (moveFocus: boolean = false) => {
      // const isFocused = focusableItem.isFocused;
      // const [up, down] = focusableItem.siblings;
      tasksSlice.toggleState(store, taskId);
      //
      // if (!moveFocus) return;
      //
      // if (wasMoved && isFocused) {
      //   setTimeout(() => {
      //     if (up) {
      //       focusManager.focusByKey(up.key);
      //     } else if (down) {
      //       focusManager.focusByKey(down.key);
      //     }
      //   }, 0);
      // }
    },
    [store, taskId],
  );

  useGlobalListener("keydown", (e: KeyboardEvent) => {
    if (focusManager.isSomethingEditing) return;
    if (!focusableItem.isFocused) return;
    if (focusManager.isFocusDisabled || e.defaultPrevented) return;

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

    if (e.code === "Space" && noModifiers) {
      e.preventDefault();

      handleTick(true);
    } else if (e.code === "KeyM" && noModifiers) {
      e.preventDefault();

      setIsMoveModalOpen(true);
    } else if (isMoveLeft || isMoveRight) {
      e.preventDefault();

      const [leftColumn, rightColumn] = focusableItem.columnSiblings;
      if (isMoveLeft && leftColumn) {
        const id = getId(leftColumn.key);

        dropActions.handleDrop(store, taskBox.id, id, "top");
        scroll();
      } else if (isMoveRight && rightColumn) {
        const id = getId(rightColumn.key);

        dropActions.handleDrop(store, taskBox.id, id, "top");
        scroll();
      }
    } else if (isMoveUp || isMoveDown) {
      e.preventDefault();

      const [up, down] = focusableItem.siblings;

      if (isMoveUp && up) {
        // TODO: Return back
        const id = getId(up.key);
        if (!id) return;

        // if ("listRef" in model) {
        //   if (taskBox.listRef.id === model.listRef.id) {
        //     // model.handleDrop(taskBox, "top");
        //   } else {
        //     model.handleDrop(taskBox, "bottom");
        //   }
        // } else {
        //   model.handleDrop(taskBox, "top");
        // }

        scroll();
      } else if (isMoveDown && down) {
        // TODO: Return back
        const id = getId(down.key);
        if (!id) return;

        // if ("listRef" in model) {
        //   if (taskBox.listRef.id === model.listRef.id) {
        //     model.handleDrop(taskBox, "bottom");
        //   } else {
        //     model.handleDrop(taskBox, "top");
        //   }
        // } else {
        //   model.handleDrop(taskBox, "top");
        // }

        scroll();
      }

      return;
    } else if (
      (e.code === "Backspace" || e.code === "KeyD" || e.code === "KeyX") &&
      noModifiers
    ) {
      e.preventDefault();

      const [up, down] = focusableItem.siblings;
      taskBoxesSlice.delete(store, taskBox.id);

      if (down) {
        focusManager.focusByKey(down.key);
      } else if (up) {
        focusManager.focusByKey(up.key);
      } else {
        focusManager.resetFocus();
      }
    } else if ((e.code === "Enter" || e.code === "KeyI") && noModifiers) {
      e.preventDefault();

      focusableItem.edit();
    } else if (isAddAfter || isAddBefore) {
      e.preventDefault();

      const newBox = taskBoxesSlice.createSibling(
        store,
        taskBox,
        isAddAfter ? "after" : "before",
      );
      focusManager.editByKey(buildFocusKey(newBox.id, newBox.type));

      return;
    }
  });

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

  const handleMove = (projectId: string) => {
    try {
      tasksSlice.update(store, taskId, {
        projectId,
      });
    } finally {
      setIsMoveModalOpen(false);
    }
  };

  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    invariant(element);

    if (focusableItem.isEditing) return;

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

          return dropSelectors.canDrop(
            store.getState(),
            taskBox.id,
            data.modelId,
          );
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
          console.log("onDragEnter", args);
          const data = args.source.data;
          if (isModelDNDData(data) && data.modelId !== taskBox.id) {
            setClosestEdge(extractClosestEdge(args.self.data));
          }
        },
        onDrag: (args) => {
          const data = args.source.data;

          if (isModelDNDData(data) && data.modelId !== taskBox.id) {
            setClosestEdge(extractClosestEdge(args.self.data));
          }
        },
        onDragLeave: () => {
          setClosestEdge(null);
        },
        onDrop: () => {
          setClosestEdge(null);
        },
      }),
    );
  }, [focusableItem.isEditing, taskBox.id, taskBox.type, store]);

  const handleRef = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.focus();

    el.selectionStart = el.value.length;
  }, []);

  useEffect(() => {
    if (focusableItem.isFocused) {
      const el = ref.current;
      if (!el) return;

      // el.scrollIntoView({
      //   behavior: "smooth",
      //   block: "center",
      //   inline: "center",
      // });
    }
  }, [focusableItem.isFocused]);

  const prevIsEditing = usePrevious(focusableItem.isEditing);
  const taskTitle = task.title;
  useEffect(() => {
    setEditingTitle(taskTitle);
  }, [taskTitle]);

  useEffect(() => {
    if (
      !focusableItem.isEditing &&
      prevIsEditing &&
      editingTitle !== taskTitle
    ) {
      tasksSlice.update(store, taskId, {
        title: editingTitle,
      });
    }
  }, [
    editingTitle,
    focusableItem.isEditing,
    prevIsEditing,
    store,
    taskId,
    taskTitle,
  ]);

  useUnmount(() => {
    if (editingTitle !== taskTitle) {
      tasksSlice.update(store, taskId, {
        title: editingTitle,
      });
    }
  });

  return (
    <>
      {closestEdge == "top" && <DropTaskIndicator />}

      <div
        data-focusable-key={focusableItem.key}
        tabIndex={0}
        className={`p-3 rounded-lg border ${
          focusableItem.isFocused
            ? "border-blue-500 bg-gray-700"
            : "border-gray-700 bg-gray-750"
        } shadow-md transition-colors whitespace-break-spaces [overflow-wrap:anywhere]`}
        style={{}}
        onClick={() => focusableItem.focus(true)}
        onDoubleClick={(e) => {
          // e.preventDefault();
          focusableItem.edit();
        }}
        ref={ref}
      >
        <div className="flex items-start gap-2">
          {focusableItem.isEditing ? (
            <>
              <div className="flex items-center justify-end">
                <input
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
              <div className="flex justify-end">
                <input
                  type="checkbox"
                  className="h-4 w-4 bg-gray-700 border-gray-600 rounded mt-1"
                  checked={task.state === "done"}
                  onChange={(e) => {
                    handleTick();
                  }}
                  aria-label="Task completion status"
                />
              </div>
              <div className="text-gray-200 min-h-6">{task.title}</div>
            </>
          )}
        </div>
        {showProject && (
          <div className="text-right mt-3 text-gray-400 text-sm">
            {project.icon || "🟡"} {project.title}
          </div>
        )}
      </div>

      {closestEdge == "bottom" && <DropTaskIndicator />}

      {dndState.type === "preview" &&
        ReactDOM.createPortal(
          <TaskPrimitive
            title={task.title}
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
          isOpen={isMoveModalOpen}
          setIsOpen={setIsMoveModalOpen}
          handleMove={handleMove}
          exceptProjectId={project.id}
        />
      )}
    </>
  );
});
