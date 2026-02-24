import { autoScrollForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element";
import invariant from "tiny-invariant";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import { DndModelData, isModelDNDData } from "@/lib/dnd/models";
import { useSelect } from "@will-be-done/hyperdb";
import { appSlice, AnyModelType } from "@will-be-done/slices/space";
import { PlusIcon } from "@/components/ui/icons.tsx";
import { buildFocusKey } from "@/store/focusSlice.ts";

export const TasksColumnGrid = ({
  columnsCount,
  children,
}: {
  columnsCount: number;
  children: React.ReactNode;
}) => {
  return (
    <div
      data-focus-region
      className="grid max-h-full h-full"
      style={{
        gridTemplateColumns: `repeat(${columnsCount}, fit-content(40px))`,
        gridTemplateRows: `1fr`,
      }}
    >
      {children}
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
  children,
  panelWidth,
  onAddClick,
  actions,
}: {
  isHidden: boolean;
  onHideClick: () => void;
  header?: React.ReactNode;
  columnModelId: string;
  columnModelType: AnyModelType;
  children: React.ReactNode;
  panelWidth?: number;
  onAddClick?: () => void;
  actions?: React.ReactNode;
}) => {
  const select = useSelect();
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

          return select(
            appSlice.canDrop(
              columnModelId,
              columnModelType,
              data.modelId,
              data.modelType,
            ),
          );
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
  }, [columnModelId, columnModelType, select]);

  return (
    <div
      data-focus-column
      data-column-model-id={columnModelId}
      data-column-model-type={columnModelType}
      ref={columnRef}
      className={cn("relative flex h-full p-1 flex-shrink-0 min-h-0 group")}
      style={!isHidden ? { minWidth: `${panelWidth ?? 400}px` } : {}}
    >
        <div
          className="flex justify-end"
          style={{
            writingMode: "vertical-rl",
            textOrientation: "mixed",
            transform: "rotate(180deg)",
          }}
        >
          <div className="mb-4 flex">
            {onAddClick && (
              <button
                className="hidden group-hover:block cursor-pointer text-white mb-2"
                onClick={onAddClick}
                type="button"
              >
                <PlusIcon className="rotate-180" />
              </button>
            )}
            {actions}
          </div>
          <button
            type="button"
            className={cn(
              "flex gap-3 justify-end flex-shrink-0 p-1 rounded-lg group focus:outline-none transition-all",
              "group-focus-visible:ring-2 group-focus-visible:ring-accent",
              {
                "ring-2 ring-accent": (isOver || isPlaceholderFocused) && isHidden,
              },
            )}
            onClick={onHideClick}
          >
            {header}
          </button>
        </div>
        <div
          className={cn("w-full min-h-0 overflow-y-auto", {
            hidden: isHidden,
          })}
          ref={scrollableRef}
          tabIndex={-1}
        >
          <div className={cn("flex flex-col gap-4 w-full px-1")}>
            {children}
          </div>
        </div>
        {onAddClick && (
          <div
            data-focus-placeholder
            data-focusable-key={buildFocusKey(columnModelId, columnModelType, "Column")}
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
