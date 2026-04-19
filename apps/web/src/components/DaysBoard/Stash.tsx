import { useCallback, useEffect, useRef, useState } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { useDispatch, useSelect, useSyncSelector } from "@will-be-done/hyperdb";
import {
  appSlice,
  projectsSlice,
  stashProjectionsSlice,
  STASH_ID,
  stashType,
} from "@will-be-done/slices/space";
import { DndModelData, isModelDNDData } from "@/lib/dnd/models.ts";
import { cn } from "@/lib/utils.ts";
import { buildFocusKey, useFocusStore } from "@/store/focusSlice.ts";
import { TaskComp } from "@/components/Task/Task.tsx";
import { TasksColumn } from "@/components/TasksGrid/TasksGrid.tsx";
import { ResizableDivider } from "./ResizableDivider.tsx";
import {
  STASH_BUTTON_WIDTH,
  useStashOpen,
  useStashSize,
} from "./StashStore.ts";

const StashColumnView = ({ onTaskAdd }: { onTaskAdd: () => void }) => {
  const taskIds = useSyncSelector(
    () => stashProjectionsSlice.childrenIds(),
    [],
  );

  const doneTaskIds = useSyncSelector(
    () => stashProjectionsSlice.doneChildrenIds(),
    [],
  );

  return (
    <TasksColumn
      isHidden={false}
      onHideClick={() => {}}
      header={null}
      columnModelId={STASH_ID}
      columnModelType={stashType}
      panelWidth={200}
    >
      <div className={cn("flex flex-col gap-4 w-full py-4 min-h-full")}>
        <button
          type="button"
          onClick={onTaskAdd}
          className="w-full flex items-center justify-center gap-2 text-sm text-content-tinted/60 hover:text-content-tinted py-1.5 transition-colors group cursor-pointer"
        >
          <span className="w-4 h-4 rounded-full border border-current flex items-center justify-center flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
            <svg
              width="8"
              height="8"
              viewBox="0 0 8 8"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M4 1v6M1 4h6"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <span>Add task</span>
        </button>
        {taskIds.map((id) => (
          <TaskComp
            key={id}
            taskId={id}
            cardWrapperId={id}
            cardWrapperType="stashProjection"
            alwaysShowProject
          />
        ))}
        {doneTaskIds.map((id) => (
          <TaskComp
            key={id}
            taskId={id}
            cardWrapperId={id}
            cardWrapperType="stashProjection"
            alwaysShowProject
          />
        ))}
      </div>
    </TasksColumn>
  );
};

export const FloatingStash = () => {
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dispatch = useDispatch();
  const select = useSelect();
  const inboxId = useSyncSelector(() => projectsSlice.inboxProjectId(), []);
  const { isOpen, toggle } = useStashOpen();
  const width = useStashSize((s) => s.width);
  const setWidth = useStashSize((s) => s.setWidth);
  const [isTaskOverButton, setIsTaskOverButton] = useState(false);

  useEffect(() => {
    const element = buttonRef.current;
    if (!element) return;

    return combine(
      dropTargetForElements({
        element,
        getData: (): DndModelData => ({
          modelId: STASH_ID,
          modelType: stashType,
        }),
        canDrop: ({ source }) => {
          const data = source.data;
          if (!isModelDNDData(data)) return false;

          return select(
            appSlice.canDrop(STASH_ID, stashType, data.modelId, data.modelType),
          );
        },
        getIsSticky: () => true,
        onDragEnter: () => setIsTaskOverButton(true),
        onDragLeave: () => setIsTaskOverButton(false),
        onDragStart: () => setIsTaskOverButton(true),
        onDrop: () => setIsTaskOverButton(false),
      }),
    );
  }, [select]);

  const handleAddTask = useCallback(() => {
    const task = dispatch(
      stashProjectionsSlice.createTaskInStash(inboxId, "prepend", "prepend"),
    );

    useFocusStore
      .getState()
      .editByKey(buildFocusKey(task.id, "stashProjection"));
  }, [dispatch, inboxId]);

  const handleResize = useCallback(
    (clientX: number) => {
      const rootLeft = rootRef.current?.getBoundingClientRect().left ?? 0;
      setWidth(clientX - rootLeft);
    },
    [setWidth],
  );

  return (
    <div
      ref={rootRef}
      className={cn(
        "absolute left-0 top-0 h-full flex z-10",
        "transition-transform duration-200 ease-out",
      )}
      style={{
        transform: isOpen
          ? "translateX(0)"
          : `translateX(calc(-100% + ${STASH_BUTTON_WIDTH}px))`,
      }}
    >
      <div
        className={cn(
          "h-full bg-surface/95 backdrop-blur-sm",
          "border-r border-ring/20",
          "overflow-hidden",
        )}
        style={{ width: `${width}px` }}
      >
        {isOpen && <StashColumnView onTaskAdd={handleAddTask} />}
      </div>

      <div
        className={cn(
          "flex items-center justify-center w-8 flex-shrink-0 h-full",
          "bg-panel-tinted/80 backdrop-blur-sm",
          "border-r border-ring/30",
          "relative transition-colors",
          "hover:bg-panel-tinted",
          isTaskOverButton && "bg-accent/10 ring-2 ring-accent ring-inset",
          isOpen && "border-l border-ring/30",
        )}
        style={{ width: `${STASH_BUTTON_WIDTH}px` }}
      >
        {isOpen && (
          <ResizableDivider
            orientation="vertical"
            onResizePosition={handleResize}
            className="left-0 top-0"
          />
        )}
        <button
          ref={buttonRef}
          type="button"
          onClick={toggle}
          className="flex h-full w-full cursor-pointer items-center justify-center focus:outline-none"
        >
          <span
            className="text-xs font-bold uppercase tracking-widest text-content-tinted select-none"
            style={{
              writingMode: "vertical-rl",
              textOrientation: "mixed",
              transform: "rotate(180deg)",
            }}
          >
            stash
          </span>
        </button>
      </div>
    </div>
  );
};
