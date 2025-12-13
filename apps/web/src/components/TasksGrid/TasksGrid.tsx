import { ColumnListProvider } from "@/components/Focus/ParentListProvider.tsx";
import { autoScrollForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element";
import invariant from "tiny-invariant";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { cn } from "@/lib/utils";
import { FocusKey } from "@/store/focusSlice.ts";
import { useEffect, useRef, useState } from "react";
import { DndModelData, isModelDNDData } from "@/lib/dnd/models";
import { useSelect } from "@will-be-done/hyperdb";
import { appSlice } from "@will-be-done/slices";

export const TasksColumnGrid = ({
  columnsCount,
  children,
}: {
  columnsCount: number;
  children: React.ReactNode;
}) => {
  return (
    <div
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
  focusKey,
  orderNumber,
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
  focusKey: FocusKey;
  orderNumber: number;
  isHidden: boolean;
  onHideClick: () => void;
  header?: React.ReactNode;
  columnModelId: string;
  columnModelType: string;
  children: React.ReactNode;
  panelWidth?: number;
  onAddClick?: () => void;
  actions?: React.ReactNode;
}) => {
  const select = useSelect();
  const columnRef = useRef<HTMLDivElement>(null);
  const scrollableRef = useRef<HTMLDivElement>(null);
  const [dndState, setDndState] = useState<DailyListDndState>(idle);
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

          return select(appSlice.canDrop(columnModelId, data.modelId));
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
    <ColumnListProvider
      focusKey={focusKey}
      priority={(orderNumber + 100).toString()}
    >
      <div
        ref={columnRef}
        className={cn("flex h-full p-1 flex-shrink-0 min-h-0 group")}
        style={!isHidden ? { minWidth: `${panelWidth ?? 400}px` } : {}}
      >
        <div
          className="flex justify-end"
          style={{
            writingMode: "vertical-rl",
            textOrientation: "mixed",
            transform: "rotate(180deg)",
            // width: "48px",
          }}
        >
          {onAddClick && (
            <button
              className="hidden group-hover:block cursor-pointer text-panel mb-6"
              onClick={onAddClick}
              type="button"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width={24}
                height={24}
                fill="none"
              >
                <path
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 12h14m-7-7v14"
                />
              </svg>
            </button>
          )}
          {actions}
          <button
            type="button"
            className={cn(
              "flex gap-3 justify-end flex-shrink-0  p-1 rounded-lg  group Focus:outline-none ",
              " group-Focus-visible:outline-2 group-Focus-visible:outline-offset-1 group-Focus-visible:outline-solid group-Focus-visible:outline-panel-selected",
              {
                "outline-2 outline-offset-1 outline-solid outline-panel-selected":
                  isOver && isHidden,
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
    </ColumnListProvider>
  );
};
