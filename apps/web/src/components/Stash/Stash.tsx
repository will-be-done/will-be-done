import { useCallback, useEffect, useRef, useState } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { useDispatch, useSelect, useSyncSelector } from "@will-be-done/hyperdb";
import { flushSync } from "react-dom";
import {
  appSlice,
  projectsSlice,
  stashProjectionsSlice,
  STASH_ID,
  stashType,
} from "@will-be-done/slices/space";
import { TaskComp } from "@/components/Task/Task.tsx";
import { TasksColumn } from "@/components/TasksGrid/TasksGrid.tsx";
import { useGlobalListener } from "@/components/GlobalListener/hooks.tsx";
import { DndModelData, isModelDNDData } from "@/lib/dnd/models.ts";
import { cn } from "@/lib/utils.ts";
import { isInputElement } from "@/utils/isInputElement.ts";
import {
  buildFocusKey,
  focusTaskTitleTextareaByKey,
  prepareTextInputFocus,
  useFocusStore,
} from "@/store/focusSlice.ts";
import { ResizableDivider } from "../DaysBoard/ResizableDivider.tsx";
import {
  STASH_BUTTON_WIDTH,
  useStashOpen,
  useStashSize,
} from "../DaysBoard/StashStore.ts";

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
          className="w-full flex items-center justify-center gap-2 text-sm text-content-tinted/60 hover:text-content-tinted py-1.5 transition-colors group/stash-add cursor-pointer"
        >
          <span className="w-4 h-4 rounded-full border border-current flex items-center justify-center flex-shrink-0 opacity-60 group-hover/stash-add:opacity-100 transition-opacity">
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

export const Stash = () => {
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dispatch = useDispatch();
  const select = useSelect();
  const inboxId = useSyncSelector(() => projectsSlice.inboxProjectId(), []);
  const stashTaskIds = useSyncSelector(
    () => stashProjectionsSlice.childrenIds(),
    [],
  );
  const stashTaskCount = stashTaskIds.length;
  const { isOpen, toggle } = useStashOpen();
  const width = useStashSize((s) => s.width);
  const setWidth = useStashSize((s) => s.setWidth);
  const [isTaskOverButton, setIsTaskOverButton] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  useGlobalListener("keydown", (e: KeyboardEvent) => {
    const focusState = useFocusStore.getState();
    const noModifiers = !(e.shiftKey || e.ctrlKey || e.metaKey || e.altKey);

    if (
      e.code !== "Backslash" ||
      !noModifiers ||
      focusState.isFocusDisabled ||
      !!focusState.editItemKey ||
      e.defaultPrevented
    ) {
      return;
    }

    const target = e.target instanceof Element ? e.target : document.activeElement;
    if (target && isInputElement(target)) return;

    e.preventDefault();
    toggle();
  });

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
    prepareTextInputFocus();

    let focusKey: ReturnType<typeof buildFocusKey> | undefined;

    // eslint-disable-next-line react-dom/no-flush-sync -- iOS opens the keyboard only when the editable task is focused during the tap.
    flushSync(() => {
      const task = dispatch(
        stashProjectionsSlice.createTaskInStash(inboxId, "prepend", "prepend"),
      );

      focusKey = buildFocusKey(task.id, "stashProjection");
      useFocusStore.getState().editByKey(focusKey);
    });

    if (!focusKey) return;

    const key = focusKey;
    if (focusTaskTitleTextareaByKey(key)) return;

    window.requestAnimationFrame(() => {
      focusTaskTitleTextareaByKey(key);
    });
  }, [dispatch, inboxId]);

  const handleResize = useCallback(
    (clientX: number) => {
      const rootLeft = rootRef.current?.getBoundingClientRect().left ?? 0;
      setWidth(clientX - rootLeft);
    },
    [setWidth],
  );

  const panelWidth = isOpen ? width : 0;
  const rootWidth = isOpen ? panelWidth : STASH_BUTTON_WIDTH;
  const widthTransitionClass = isResizing
    ? "transition-none"
    : "transition-[width] duration-300 ease-out";

  const stashButton = (
    <button
      ref={buttonRef}
      type="button"
      onClick={toggle}
      className={cn(
        "relative flex w-full flex-col items-center justify-center px-0 py-3",
        "cursor-pointer rounded-r-md border-r border-ring/30",
        "bg-panel-tinted/80 backdrop-blur-sm transition-colors safari:bg-panel-tinted-opaque safari:backdrop-blur-none",
        "hover:bg-panel-tinted focus:outline-none",
        isTaskOverButton &&
          !isOpen &&
          "bg-accent/10 ring-2 ring-accent ring-inset",
      )}
    >
      {stashTaskCount > 0 && (
        <span className="mb-2.5 flex min-w-5 items-center justify-center rounded-full bg-content-tinted/10 px-1 text-[11px] font-semibold leading-none tabular-nums text-content-tinted/60 select-none h-5">
          {stashTaskCount}
        </span>
      )}
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
  );

  return (
    <div
      ref={rootRef}
      className={cn(
        "absolute left-0 top-0 z-20 hidden h-full sm:flex",
        widthTransitionClass,
      )}
      style={{ width: `${rootWidth}px` }}
    >
      <div
        className={cn(
          widthTransitionClass,
          "h-full bg-surface/95 backdrop-blur-sm safari:bg-surface safari:backdrop-blur-none",
          "overflow-hidden",
        )}
        style={{ width: `${panelWidth}px` }}
      >
        <div
          aria-hidden={!isOpen}
          className={cn(
            "h-full overflow-y-auto transition-transform duration-300 ease-out",
            isOpen ? "translate-x-0" : "-translate-x-6 pointer-events-none",
          )}
          style={{ width: `${width}px` }}
        >
          <StashColumnView onTaskAdd={handleAddTask} />
        </div>
      </div>

      {isOpen && (
        <ResizableDivider
          orientation="vertical"
          onResizePosition={handleResize}
          onResizeStart={() => setIsResizing(true)}
          onResizeEnd={() => setIsResizing(false)}
          className="left-full top-0"
        />
      )}

      <div
        className={cn(
          "flex flex-shrink-0 items-center justify-center",
          isOpen
            ? "absolute top-1/2 z-30 -translate-y-1/2"
            : "relative -ml-px h-full border-l border-ring/30",
        )}
        style={{
          width: `${STASH_BUTTON_WIDTH}px`,
          left: isOpen ? `${panelWidth}px` : undefined,
        }}
      >
        {stashButton}
      </div>
    </div>
  );
};
