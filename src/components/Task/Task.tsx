import { observer } from "mobx-react-lite";
import { TaskProjection } from "../../models/models";
import { currentProjectionState } from "../../states/task";
import { CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import invariant from "tiny-invariant";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { useBoardContext } from "../../contexts/dnd";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview";
import { preserveOffsetOnSource } from "@atlaskit/pragmatic-drag-and-drop/element/preserve-offset-on-source";
import { dropTargetForExternal } from "@atlaskit/pragmatic-drag-and-drop/external/adapter";
import {
  attachClosestEdge,
  type Edge,
  extractClosestEdge,
} from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import ReactDOM from "react-dom";
import { isTaskPassingData, TaskPassingData } from "../../dnd/models";
import TextareaAutosize from "react-textarea-autosize";

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
  taskProjection,
  onAddNewTask,
}: {
  taskProjection: TaskProjection;
  onAddNewTask: (porjection: TaskProjection) => void;
}) {
  const task = taskProjection.itemRef.current;
  const tasksState = currentProjectionState;
  const isEditing = tasksState.isProjFocused(taskProjection);
  const isSelected = tasksState.isProjSelected(taskProjection);
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null);

  const [dndState, setDndState] = useState<State>(idleState);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    console.log("key", e.key);
    if ((e.key === "Enter" && !e.shiftKey) || e.key === "Escape") {
      e.preventDefault();
      tasksState.resetFocus();

      if (e.key === "Enter") {
        onAddNewTask(taskProjection);
      }
    }
  };

  const ref = useRef<HTMLDivElement | null>(null);

  const { instanceId } = useBoardContext();

  const listId = taskProjection.listRef.id;
  const taskId = taskProjection.itemRef.id;
  const projectionId = taskProjection.id;

  useEffect(() => {
    const element = ref.current;
    invariant(element);
    return combine(
      draggable({
        element: element,
        getInitialData: (): TaskPassingData => ({
          type: "task",
          listId: listId,
          taskId: taskId,
          projectionId: projectionId,
          instanceId,
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
          return (
            isTaskPassingData(data) &&
            data.instanceId === instanceId &&
            data.type === "task"
          );
        },
        getIsSticky: () => true,
        getData: ({ input, element }) => {
          const data: TaskPassingData = {
            projectionId: projectionId,
            type: "task",
            listId: listId,
            taskId: taskId,
            instanceId: instanceId,
          };

          return attachClosestEdge(data, {
            input,
            element,
            allowedEdges: ["top", "bottom"],
          });
        },
        onDragEnter: (args) => {
          const data = args.source.data;
          if (isTaskPassingData(data) && data.taskId !== taskId) {
            setClosestEdge(extractClosestEdge(args.self.data));
          }
        },
        onDrag: (args) => {
          const data = args.source.data;

          if (isTaskPassingData(data) && data.taskId !== taskId) {
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
  }, [instanceId, listId, projectionId, taskId]);

  const handleRef = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.focus();

    el.selectionStart = el.value.length;
  }, []);

  useEffect(() => {
    if (isSelected) {
      const el = ref.current;
      if (!el) return;

      el.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "center",
      });
    }
  }, [isSelected]);

  return (
    <>
      {closestEdge == "top" && <DropTaskIndicator />}

      <div
        className={`p-3 rounded-lg border ${
          isSelected
            ? "border-blue-500 bg-gray-700"
            : "border-gray-700 bg-gray-750"
        } shadow-md transition-colors whitespace-break-spaces [overflow-wrap:anywhere]`}
        style={{}}
        onClick={() => tasksState.setSelectedProjection(taskProjection)}
        onDoubleClick={(e) => {
          e.preventDefault();
          tasksState.setFocusedProjection(taskProjection);
        }}
        ref={ref}
      >
        <div className="flex items-start gap-2">
          {isEditing ? (
            <>
              <div className="flex items-center justify-end">
                <input
                  type="checkbox"
                  className="h-4 w-4 bg-gray-700 border-gray-600 rounded mt-1"
                />
              </div>
              <TextareaAutosize
                ref={handleRef}
                value={task.title}
                onChange={(e) => task.setTitle(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e)}
                className="w-full bg-transparent text-gray-200 placeholder-gray-400 resize-none focus:outline-none font-medium"
                aria-label="Edit task title"
              />
            </>
          ) : (
            <>
              <div className="flex justify-end">
                <input
                  type="checkbox"
                  className="h-4 w-4 bg-gray-700 border-gray-600 rounded mt-1"
                />
              </div>
              <div className="font-medium text-gray-200 min-h-6">
                {task.title}
              </div>
            </>
          )}
        </div>
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
    </>
  );
});
