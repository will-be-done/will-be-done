import { autoScrollForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element";
import invariant from "tiny-invariant";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import {
  draggable,
  dropTargetForElements,
  type ElementDropTargetEventBasePayload,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import {
  attachClosestEdge,
  type Edge,
} from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import {
  type DndModelData,
  isModelDNDData,
  canDropModelData,
  getDropIndicatorEdge,
  isActiveDropTarget,
} from "@/lib/dnd/models";
import { AnyModelType } from "@will-be-done/slices/space";
import { PlusIcon } from "@/components/ui/icons.tsx";
import { buildFocusKey } from "@/store/focusSlice.ts";

export const TasksColumnGrid = ({
  columnsCount,
  children,
  floatingColumn,
  paddingLeft,
  isFocusRegion = true,
}: {
  columnsCount: number;
  children: React.ReactNode;
  floatingColumn?: React.ReactNode;
  paddingLeft?: number;
  isFocusRegion?: boolean;
}) => {
  return (
    <div
      data-focus-region-direction={isFocusRegion ? "row" : undefined}
      className="relative max-h-full h-full overflow-x-clip"
    >
      {floatingColumn}
      <div
        className="max-h-full h-full overflow-x-auto"
        style={{
          paddingLeft: paddingLeft ? `${paddingLeft}px` : undefined,
          transition: "padding-left 200ms ease-out",
        }}
      >
        <div
          className="grid max-h-full h-full"
          style={{
            gridTemplateColumns: `repeat(${columnsCount}, fit-content(40px))`,
            gridTemplateRows: `1fr`,
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

export const TasksColumn = ({
  isHidden,
  onHideClick,
  header,
  columnModelId,
  columnModelType,
  columnProjectId,
  children,
  panelWidth,
  onAddClick,
  actions,
}: {
  isHidden: boolean;
  onHideClick: () => void;
  header?: React.ReactNode;
  columnModelId: string;
  children: React.ReactNode;
  panelWidth?: number;
  onAddClick?: () => void;
  actions?: React.ReactNode;
} & (
  | { columnModelType: "projectSection"; columnProjectId: string }
  | {
      columnModelType: Extract<AnyModelType, "dailyList" | "stash">;
      columnProjectId?: never;
    }
)) => {
  const columnRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLButtonElement>(null);
  const scrollableRef = useRef<HTMLDivElement>(null);
  const [dndState, setDndState] = useState<DailyListDndState>(idle);
  const [dropEdge, setDropEdge] = useState<Edge | null>(null);
  const [isPlaceholderFocused, setIsPlaceholderFocused] = useState(false);
  const isOver = dndState.type == "is-task-over";

  useEffect(() => {
    invariant(columnRef.current);
    invariant(scrollableRef.current);
    invariant(headerRef.current);
    const updateDropIndicator = (args: ElementDropTargetEventBasePayload) => {
      setDndState(isActiveDropTarget(args) ? isTaskOver : idle);
      setDropEdge(getDropIndicatorEdge(args));
    };
    const resetDropIndicator = () => {
      setDndState(idle);
      setDropEdge(null);
    };
    const data: DndModelData =
      columnModelType === "projectSection"
        ? {
            modelId: columnModelId,
            modelType: columnModelType,
            projectId: columnProjectId,
          }
        : { modelId: columnModelId, modelType: columnModelType };

    return combine(
      ...(columnModelType === "projectSection"
        ? [
            draggable({
              element: headerRef.current,
              getInitialData: () => data,
            }),
          ]
        : []),
      dropTargetForElements({
        element: columnRef.current,
        // Only column drags pick a side; tasks keep dropping at the top.
        getData: ({ input, element, source }) =>
          source.data.modelType === columnModelType
            ? attachClosestEdge(data, {
                input,
                element,
                allowedEdges: ["left", "right"],
              })
            : data,
        canDrop: ({ source }) => canDropModelData(source.data, data),
        getIsSticky: () => true,
        onDragEnter: updateDropIndicator,
        onDrag: updateDropIndicator,
        onDropTargetChange: updateDropIndicator,
        onDragLeave: resetDropIndicator,
        onDragStart: updateDropIndicator,
        onDrop: resetDropIndicator,
      }),
      autoScrollForElements({
        element: scrollableRef.current,
        canScroll: ({ source }) => isModelDNDData(source.data),
      }),
    );
  }, [columnModelId, columnModelType, columnProjectId]);

  return (
    <div
      data-focus-column
      data-drop-active={isOver || undefined}
      data-column-model-id={columnModelId}
      data-column-model-type={columnModelType}
      ref={columnRef}
      className={cn(
        "relative flex h-full px-1 pt-1 flex-shrink-0 min-h-0 group",
        isOver &&
          !isHidden &&
          !dropEdge &&
          "rounded-lg ring-2 ring-inset ring-accent",
      )}
      style={!isHidden ? { minWidth: `${panelWidth ?? 400}px` } : {}}
    >
      {dropEdge && (
        <div
          className={cn(
            "absolute inset-y-0 w-0.5 rounded-full bg-accent",
            dropEdge === "left" ? "left-0" : "right-0",
          )}
        />
      )}
      <div
        className="flex justify-end"
        style={{
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          transform: "rotate(180deg)",
        }}
      >
        <div className="mb-4 flex">
          {actions}
          {header != null && onAddClick && (
            <button
              className="cursor-pointer text-white mb-2"
              onClick={onAddClick}
              type="button"
              aria-label="Add task"
            >
              <PlusIcon className="rotate-180" />
            </button>
          )}
        </div>
        <button
          ref={headerRef}
          type="button"
          className={cn(
            "flex gap-3 justify-end flex-shrink-0 p-1 rounded-lg group focus:outline-none transition-all",
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
      </div>
      <div
        className={cn("w-full min-h-0 flex-1 overflow-y-auto", {
          hidden: isHidden,
        })}
        ref={scrollableRef}
        tabIndex={-1}
      >
        <div className={cn("flex flex-col gap-4 w-full px-1")}>{children}</div>
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
