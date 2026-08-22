import { autoScrollForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element";
import invariant from "tiny-invariant";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import { DndModelData, isModelDNDData } from "@/lib/dnd/models";
import { AnyModelType } from "@will-be-done/slices/space";
import { PlusIcon } from "@/components/ui/icons.tsx";
import { buildFocusKey } from "@/store/focusSlice.ts";

export const TasksColumnGrid = ({
  children,
  paddingLeft,
}: {
  children: React.ReactNode;
  paddingLeft?: number;
}) => {
  return (
    <div
      data-focus-region-direction="row"
      className="relative max-h-full h-full overflow-x-clip"
    >
      <div className="max-h-full h-full overflow-x-auto">
        <div
          className="flex h-full max-h-full w-max min-w-full"
          style={{
            paddingLeft: paddingLeft != null ? `${paddingLeft}px` : undefined,
            transition: "padding-left 200ms ease-out",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
};

type DailyListDndState = { type: "idle" } | { type: "is-task-over" };

const idle: DailyListDndState = { type: "idle" };
const isTaskOver: DailyListDndState = { type: "is-task-over" };

const ColumnProgressBar = ({
  done,
  total,
}: {
  done: number;
  total: number;
}) => {
  const percent = total === 0 ? 0 : Math.min(100, (done / total) * 100);
  const isComplete = total > 0 && done >= total;

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
      aria-label={`${done} of ${total} tasks complete`}
      className="mx-1 mb-2 h-1.5 overflow-hidden rounded-full bg-overlay"
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width,background-color] duration-300 ease-out",
          isComplete ? "bg-complete" : "bg-accent",
        )}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
};

export const TasksColumn = ({
  isHidden,
  onHideClick,
  header,
  columnModelId,
  columnModelType,
  children,
  panelWidth,
  onAddClick,
  actions,
  progress,
}: {
  isHidden: boolean;
  onHideClick?: () => void;
  header?: React.ReactNode;
  columnModelId: string;
  columnModelType: AnyModelType;
  children: React.ReactNode;
  panelWidth?: number;
  onAddClick?: () => void;
  actions?: React.ReactNode;
  progress?: { done: number; total: number };
}) => {
  const columnRef = useRef<HTMLDivElement>(null);
  const scrollableRef = useRef<HTMLDivElement>(null);
  const [dndState, setDndState] = useState<DailyListDndState>(idle);
  const [isPlaceholderFocused, setIsPlaceholderFocused] = useState(false);
  const isOver = dndState.type == "is-task-over";

  useEffect(() => {
    invariant(columnRef.current);
    invariant(scrollableRef.current);
    return combine(
      dropTargetForElements({
        element: columnRef.current,
        getData: (): DndModelData => ({
          modelId: columnModelId,
          modelType: columnModelType,
        }),
        canDrop: ({ source }) => {
          const data = source.data;
          if (!isModelDNDData(data)) return false;

          return true;
        },
        getIsSticky: () => true,
        onDragEnter: () => setDndState(isTaskOver),
        onDragLeave: () => setDndState(idle),
        onDragStart: () => setDndState(isTaskOver),
        onDrop: () => setDndState(idle),
      }),
      autoScrollForElements({
        element: scrollableRef.current,
        canScroll: ({ source }) => isModelDNDData(source.data),
      }),
    );
  }, [columnModelId, columnModelType]);

  return (
    <div
      data-focus-column
      data-column-model-id={columnModelId}
      data-column-model-type={columnModelType}
      ref={columnRef}
      className={cn(
        "relative flex h-full min-h-0 min-w-0 flex-col px-1.5 pt-1 pb-2 group",
        isHidden || panelWidth != null ? "flex-none" : "w-72 shrink-0",
      )}
      style={
        !isHidden && panelWidth != null
          ? { width: `${panelWidth}px` }
          : undefined
      }
    >
      {(header || actions || onAddClick) && (
        <>
          <div
            className={cn(
              "flex items-start justify-between gap-2 px-1",
              progress == null ? "pb-2" : "pb-1",
            )}
          >
            {onHideClick ? (
              <button
                type="button"
                className={cn(
                  "min-w-0 flex-1 rounded-lg p-1 text-left focus:outline-none transition-all",
                  "group-focus-visible:ring-2 group-focus-visible:ring-accent",
                  {
                    "ring-2 ring-accent":
                      (isOver || isPlaceholderFocused) && isHidden,
                  },
                )}
                onClick={onHideClick}
              >
                {header}
              </button>
            ) : (
              <div className="min-w-0 flex-1 p-1">{header}</div>
            )}
            <div className="flex shrink-0 items-center gap-0.5 pt-1">
              {onAddClick && !actions && (
                <button
                  className="hidden cursor-pointer text-content group-hover:block"
                  onClick={onAddClick}
                  type="button"
                >
                  <PlusIcon />
                </button>
              )}
              {actions}
            </div>
          </div>
          {progress != null && (
            <ColumnProgressBar done={progress.done} total={progress.total} />
          )}
        </>
      )}
      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto rounded-xl bg-[#fbfbfa] ring-1 ring-border dark:bg-[oklch(48%_0.02_55)]",
          {
            hidden: isHidden,
            "ring-2 ring-accent": isOver && !isHidden,
          },
        )}
        ref={scrollableRef}
        tabIndex={-1}
      >
        <div className={cn("flex min-h-full w-full flex-col gap-4 px-2 py-3")}>
          {children}
        </div>
      </div>
      {onAddClick && (
        <div
          data-focus-placeholder
          data-focusable-key={buildFocusKey(
            columnModelId,
            columnModelType,
            "Column",
          )}
          tabIndex={0}
          className="absolute w-0 h-0 overflow-hidden"
          onFocus={() => setIsPlaceholderFocused(true)}
          onBlur={() => setIsPlaceholderFocused(false)}
          onKeyDown={(e) => {
            const noModifiers = !(e.shiftKey || e.ctrlKey || e.metaKey);
            if (noModifiers && (e.code === "KeyO" || e.code === "KeyA")) {
              e.preventDefault();
              onAddClick();
            }
          }}
        />
      )}

      {/* <ScrollArea.Root */}
      {/*   className={cn("w-full min-h-0", { */}
      {/*     hidden: isHidden, */}
      {/*   })} */}
      {/* > */}
      {/*   <ScrollArea.Viewport */}
      {/*     className="h-full overscroll-contain rounded-md w-full pr-4 pl-1" */}
      {/*     ref={scrollableRef} */}
      {/*   > */}
      {/*     <div className={cn("flex flex-col gap-4 w-full py-4")}> */}
      {/*       {children} */}
      {/*     </div> */}
      {/*   </ScrollArea.Viewport> */}
      {/*   <ScrollArea.Scrollbar className="m-2 flex w-1 justify-center rounded bg-gray-200 opacity-0 transition-opacity delay-300 pointer-events-none data-[hovering]:opacity-100 data-[hovering]:delay-0 data-[hovering]:duration-75 data-[hovering]:pointer-events-auto data-[scrolling]:opacity-100 data-[scrolling]:delay-0 data-[scrolling]:duration-75 data-[scrolling]:pointer-events-auto"> */}
      {/*     <ScrollArea.Thumb className="w-full rounded bg-gray-500" /> */}
      {/*   </ScrollArea.Scrollbar> */}
      {/* </ScrollArea.Root> */}
    </div>
  );
};
