import { observer } from "mobx-react-lite";
import {
  getRootStore,
  Task,
  TaskProjection,
  TaskTemplate,
} from "../../models/models";
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
import { BaseListItem, OrderableItem } from "../../models/listActions";
import { usePrevious, useUnmount } from "../../utils";
import { MoveModal } from "../MoveModel/MoveModel";
import { computed } from "mobx";
import { globalKeysState } from "../../states/isGlobalKeyDisables";
import { useGlobalListener } from "../../globalListener/hooks";
import { isInputElement } from "../../utils/isInputElement";
import { detach, getSnapshot } from "mobx-keystone";
import { useRegisterFocusItem } from "@/hooks/useLists";
import { buildFocusKey, focusManager } from "@/states/FocusManager";

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
  task,
  listItem,
  showProject,
}: {
  task: Task;
  listItem: Task | TaskProjection;
  showProject: boolean;
}) {
  const [editingTitle, setEditingTitle] = useState<string>(task.title);
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null);
  const [dndState, setDndState] = useState<State>(idleState);
  const project = task.projectRef.current;
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const rootStore = getRootStore();
  const focusableItem = useRegisterFocusItem(
    buildFocusKey(listItem.id, listItem.$modelType),
    listItem.orderToken,
  );

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === "Enter" && !e.shiftKey) || e.key === "Escape") {
      e.preventDefault();
      focusManager.resetEdit();

      // if (e.key === "Enter") {
      //   task.setTitle(editingTitle);
      //   const siblings = listItem.siblings;
      //   const list = listItem.listRef.current;
      //   const newItem = list.createChild([listItem, siblings[1]], listItem);
      //
      //   currentProjectionState.setFocusedItemId(newItem.id);
      // }
    }
  };

  useGlobalListener("keydown", (e: KeyboardEvent) => {
    if (focusManager.isSomethingEditing) return;
    if (!focusableItem.isFocused) return;
    if (!globalKeysState.isEnabled) return;

    const target =
      e.target instanceof Element ? e.target : document.activeElement;
    if (target && isInputElement(target)) return;

    const isAddAfter = !e.shiftKey && (e.code === "KeyA" || e.code === "KeyO");
    const isAddBefore = e.shiftKey && (e.code === "KeyA" || e.code === "KeyO");

    if (e.code === "KeyM") {
      e.preventDefault();

      setIsMoveModalOpen(true);
    } else if (
      e.code === "Backspace" ||
      e.code === "KeyD" ||
      e.code === "KeyX"
    ) {
      e.preventDefault();

      const [up, down] = focusableItem.siblings;
      detach(listItem);

      setTimeout(() => {
        if (down) {
          focusManager.focusByKey(down.key);
        } else if (up) {
          focusManager.focusByKey(up.key);
        } else {
          focusManager.resetFocus();
        }
      }, 0);
    } else if (e.code === "Enter" || e.code === "KeyI") {
      e.preventDefault();

      focusableItem.edit();
    } else if (isAddAfter || isAddBefore) {
      e.preventDefault();

      const newItem = listItem.createSibling(isAddAfter ? "after" : "before");
      focusManager.editByKey(buildFocusKey(newItem.id, newItem.$modelType));

      return;
    }
  });

  useGlobalListener("mousedown", (e: MouseEvent) => {
    if (
      focusableItem.isFocused &&
      ref.current &&
      !ref.current.contains(e.target as Node) &&
      globalKeysState.isEnabled
    ) {
      focusManager.resetFocus();
    }
  });

  const handleMove = (projectId: string) => {
    const targetProject = rootStore.allProjectsList.children.find(
      (p) => p.id === projectId,
    );
    if (targetProject) {
      task.setProjectRef(targetProject.makeListRef());
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
          modelId: listItem.id,
          modelType: listItem.$modelType,
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

          const entity = getRootStore().getEntity(data.modelId);
          if (!entity) return false;

          return listItem.canDrop(entity);
        },
        getIsSticky: () => true,
        getData: ({ input, element }) => {
          const data: DndModelData = {
            modelId: listItem.id,
            modelType: listItem.$modelType,
          };

          return attachClosestEdge(data, {
            input,
            element,
            allowedEdges: ["top", "bottom"],
          });
        },
        onDragEnter: (args) => {
          const data = args.source.data;
          if (isModelDNDData(data) && data.modelId !== listItem.id) {
            setClosestEdge(extractClosestEdge(args.self.data));
          }
        },
        onDrag: (args) => {
          const data = args.source.data;

          if (isModelDNDData(data) && data.modelId !== listItem.id) {
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
  }, [focusableItem.isEditing, listItem]);

  const handleRef = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.focus();

    el.selectionStart = el.value.length;
  }, []);

  useEffect(() => {
    if (focusableItem.isFocused) {
      const el = ref.current;
      if (!el) return;

      el.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "center",
      });
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
      task.setTitle(editingTitle);
    }
  }, [editingTitle, focusableItem.isEditing, prevIsEditing, task, taskTitle]);

  useUnmount(() => {
    if (editingTitle !== taskTitle) {
      task.setTitle(editingTitle);
    }
  });

  return (
    <>
      {closestEdge == "top" && <DropTaskIndicator />}

      <div
        data-focusable-key={buildFocusKey(listItem.id, listItem.$modelType)}
        tabIndex={0}
        className={`p-3 rounded-lg border ${
          focusableItem.isFocused
            ? "border-blue-500 bg-gray-700"
            : "border-gray-700 bg-gray-750"
        } shadow-md transition-colors whitespace-break-spaces [overflow-wrap:anywhere]`}
        style={{}}
        onClick={() => focusableItem.focus()}
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
                  onChange={() => task.toggleState()}
                  aria-label="Task completion status"
                />
              </div>
              <div className="text-gray-200 min-h-6">{task.title}</div>
            </>
          )}
        </div>
        {showProject && (
          <div className="text-right mt-3 text-gray-400 text-sm">
            {project.icon} {project.title}
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
