import { useCallback, useEffect, useRef, useState } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { useAsyncSelector } from "@will-be-done/hyperdb/react";
import {
  ItemForDisplay,
  doneStashEntryChildrenForDisplay,
  inboxProjectId,
  STASH_ID,
  stashEntryChildrenForDisplay,
  stashType,
} from "@will-be-done/slices/space";
import { PreloadedTaskComp } from "@/components/Task/Task.tsx";
import { AddTaskComposer } from "@/components/Task/AddTaskComposer.tsx";
import { TasksColumn } from "@/components/TasksGrid/TasksGrid.tsx";
import { PlusIcon } from "@/components/ui/icons.tsx";
import { useGlobalListener } from "@/components/GlobalListener/hooks.tsx";
import { DndModelData, isModelDNDData } from "@/lib/dnd/models.ts";
import { cn } from "@/lib/utils.ts";
import { isInputElement } from "@/utils/isInputElement.ts";
import { useFocusStore } from "@/store/focusSlice.ts";
import { ResizableDivider } from "../DaysBoard/ResizableDivider.tsx";
import {
  STASH_BUTTON_WIDTH,
  useStashOpen,
  useStashSize,
} from "../DaysBoard/StashStore.ts";

const StashColumnView = ({
  itemsForDisplay,
  onAddTask,
  panelWidth,
}: {
  itemsForDisplay: ItemForDisplay[];
  onAddTask: () => void;
  panelWidth: number;
}) => {
  const { data: doneItemsForDisplay = [] } = useAsyncSelector({
    selector: doneStashEntryChildrenForDisplay,
    args: {},
  });

  return (
    <TasksColumn
      isHidden={false}
      header={
        <div className="uppercase text-content text-xl font-bold">Stash</div>
      }
      columnModelId={STASH_ID}
      columnModelType={stashType}
      panelWidth={panelWidth}
      onAddClick={onAddTask}
      actions={
        <button
          type="button"
          aria-label="Add task"
          onClick={onAddTask}
          className="flex size-7 items-center justify-center rounded-md text-content-tinted hover:bg-panel-hover hover:text-content cursor-pointer"
        >
          <PlusIcon />
        </button>
      }
    >
      <div className={cn("flex flex-col gap-4 w-full min-h-full")}>
        {itemsForDisplay.map((displayData) => (
          <PreloadedTaskComp
            key={displayData.listItem.id}
            item={displayData.item}
            section={displayData.section}
            listItem={displayData.listItem}
            project={displayData.project}
            lastScheduleTime={displayData.lastScheduleTime}
            hasCheclistItems={displayData.hasChecklist}
            alwaysShowProject
          />
        ))}
        {doneItemsForDisplay.map((displayData) => (
          <PreloadedTaskComp
            key={displayData.listItem.id}
            item={displayData.item}
            section={displayData.section}
            listItem={displayData.listItem}
            project={displayData.project}
            lastScheduleTime={displayData.lastScheduleTime}
            hasCheclistItems={displayData.hasChecklist}
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
  const { data: inboxId = "" } = useAsyncSelector({
    selector: inboxProjectId,
    args: {},
  });
  const { data: itemsForDisplay = [] } = useAsyncSelector({
    selector: stashEntryChildrenForDisplay,
    args: {},
  });
  const stashTaskCount = itemsForDisplay.length;
  const { isOpen, toggle } = useStashOpen();
  const width = useStashSize((s) => s.width);
  const setWidth = useStashSize((s) => s.setWidth);
  const [isTaskOverButton, setIsTaskOverButton] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);

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

    const target =
      e.target instanceof Element ? e.target : document.activeElement;
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

          return true;
        },
        getIsSticky: () => true,
        onDragEnter: () => setIsTaskOverButton(true),
        onDragLeave: () => setIsTaskOverButton(false),
        onDragStart: () => setIsTaskOverButton(true),
        onDrop: () => setIsTaskOverButton(false),
      }),
    );
  }, []);

  const handleResize = useCallback(
    (clientX: number) => {
      const rootLeft = rootRef.current?.getBoundingClientRect().left ?? 0;
      setWidth(clientX - rootLeft);
    },
    [setWidth],
  );

  const panelWidth = isOpen ? width : 0;
  const widthTransitionClass = isResizing
    ? "transition-none"
    : "transition-[width] duration-300 ease-out";

  const stashButton = (
    <button
      ref={buttonRef}
      type="button"
      aria-expanded={isOpen}
      aria-label="Toggle stash"
      data-testid="stash-toggle"
      onClick={toggle}
      className={cn(
        "relative flex w-full flex-col items-center justify-center px-0 py-3",
        "cursor-pointer rounded-r-md border border-l-0 border-ring",
        "bg-panel-tinted/80 backdrop-blur-sm transition-colors safari:bg-panel-tinted-opaque safari:backdrop-blur-none",
        "hover:bg-panel-tinted focus:outline-none",
        isTaskOverButton &&
          !isOpen &&
          "bg-accent/10 ring-2 ring-accent ring-inset",
      )}
    >
      {stashTaskCount > 0 && (
        <span
          data-testid="stash-count"
          className="mb-2.5 flex min-w-5 items-center justify-center rounded-full bg-content-tinted/10 px-1 text-[11px] font-semibold leading-none tabular-nums text-content-tinted/60 select-none h-5"
        >
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
    <>
      <div
        ref={rootRef}
        data-testid="stash-root"
        className={cn(
          "absolute left-0 top-0 z-20 hidden h-full min-w-0 sm:flex",
          widthTransitionClass,
        )}
        style={{ width: `${panelWidth}px` }}
      >
        <div
          className={cn(
            widthTransitionClass,
            "h-full min-w-0 bg-surface/95 backdrop-blur-sm safari:bg-surface safari:backdrop-blur-none",
            "overflow-hidden",
            isOpen && "border-r border-ring",
          )}
          style={{ width: `${panelWidth}px` }}
        >
          <div
            aria-hidden={!isOpen}
            data-testid="stash-panel"
            className={cn(
              "h-full min-w-0 overflow-y-auto transition-transform duration-300 ease-out",
              isOpen ? "translate-x-0" : "-translate-x-6 pointer-events-none",
            )}
            style={{ width: `${width}px` }}
          >
            <StashColumnView
              itemsForDisplay={itemsForDisplay}
              onAddTask={() => setComposerOpen(true)}
              panelWidth={width}
            />
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
          className="pointer-events-auto absolute top-1/2 z-30 flex shrink-0 -translate-y-1/2 items-center justify-center"
          style={{
            width: `${STASH_BUTTON_WIDTH}px`,
            left: `${panelWidth}px`,
          }}
        >
          {stashButton}
        </div>
      </div>
      <AddTaskComposer
        destination={{ type: "stash" }}
        defaultProjectId={inboxId}
        open={composerOpen}
        onOpenChange={setComposerOpen}
      />
    </>
  );
};
