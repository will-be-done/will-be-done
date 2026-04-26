import { useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useSyncSelector } from "@will-be-done/hyperdb";
import { useFocusStore, parseColumnKey } from "@/store/focusSlice.ts";
import {
  projectCategoryCardsSlice,
  cardsSlice,
  isTask,
  isTaskTemplate,
} from "@will-be-done/slices/space";
import { useGlobalListener } from "@/components/GlobalListener/hooks.tsx";
import { TaskBody } from "./TaskBody.tsx";
import { TemplateBody } from "./TemplateBody.tsx";
import { ResizableDivider } from "@/components/DaysBoard/ResizableDivider.tsx";
import { useCardDetailsSize, useCardDetailsOpen } from "./CardDetailsStore.ts";

// ─── Main sidebar panel ──────────────────────────────────────────────────────

export function CardDetails() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);
  const focusKey = useFocusStore((s) => s.focusItemKey);
  const parsed = focusKey ? parseColumnKey(focusKey) : null;
  const isCardFocused =
    parsed?.type === "task" ||
    parsed?.type === "projection" ||
    parsed?.type === "template";
  const cardId = isCardFocused ? parsed.id : null;
  const isVisible = useSyncSelector(
    function* () {
      if (!cardId) return false;
      return yield* cardsSlice.exists(cardId);
    },
    [cardId],
  );

  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const isEditingTitle = editingTaskId === cardId;
  const setIsEditingTitle = useCallback(
    (v: boolean) => setEditingTaskId(v ? cardId : null),
    [cardId],
  );

  const width = useCardDetailsSize((s) => s.width);
  const setWidth = useCardDetailsSize((s) => s.setWidth);
  const { isOpen: isPanelOpen, toggle } = useCardDetailsOpen();

  // Escape closes panel (not while editing title)
  useGlobalListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape" && isVisible && !isEditingTitle) {
      useFocusStore.getState().resetFocus();
    }
  });

  const handleResize = useCallback(
    (clientX: number) => {
      const rootRight =
        rootRef.current?.getBoundingClientRect().right ?? window.innerWidth;
      setWidth(rootRight - clientX);
    },
    [setWidth],
  );

  const hasCard = isVisible && !!cardId;
  const panelWidth = isPanelOpen ? width : 0;
  const widthTransitionClass = isResizing
    ? "transition-none"
    : "transition-[width] duration-300 ease-out";
  const buttonTransitionClass = isResizing
    ? "transition-colors"
    : "transition-[right,colors] duration-300 ease-out";

  return (
    <div
      ref={rootRef}
      className={cn("relative h-full flex-shrink-0 z-1000", widthTransitionClass)}
      style={{
        width: `${panelWidth}px`,
      }}
    >
      {/* Toggle button */}
      <button
        type="button"
        onClick={toggle}
        className={cn(
          "absolute top-1/2 -translate-y-1/2 z-10 w-3 h-6 bg-task-panel border border-task-panel-ring/40 border-r-0 rounded-l-md flex justify-center items-center cursor-pointer hover:brightness-125 focus:outline-none",
          buttonTransitionClass,
        )}
        style={{
          right: `${panelWidth}px`,
        }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width={3}
          height={6}
          fill="none"
          className={cn("text-content-tinted transition-transform duration-300 ease-out", {
            "rotate-180": isPanelOpen,
          })}
        >
          <path
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.167.5.5 2.737l1.667 2.237"
          />
        </svg>
      </button>

      {/* Panel content */}
      <div
        className={cn(
          "absolute right-0 top-0 h-full",
          widthTransitionClass,
          "bg-task-panel/95 backdrop-blur-sm safari:bg-task-panel safari:backdrop-blur-none",
          isPanelOpen && "border-l border-task-panel-ring/20",
          "overflow-hidden",
        )}
        style={{
          width: `${panelWidth}px`,
        }}
      >
        {isPanelOpen && (
          <ResizableDivider
            orientation="vertical"
            onResizePosition={handleResize}
            onResizeStart={() => setIsResizing(true)}
            onResizeEnd={() => setIsResizing(false)}
            className="left-0 top-0"
          />
        )}
        <div
          aria-hidden={!isPanelOpen}
          className={cn(
            "h-full overflow-y-auto transition-[transform,opacity] duration-300 ease-out",
            isPanelOpen
              ? "translate-x-0 opacity-100"
              : "translate-x-6 opacity-0 pointer-events-none",
          )}
          style={{ width: `${width}px` }}
        >
          {/* Header */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-task-panel-divider">
            <span className="text-content-tinted text-xs font-medium flex-1">
              Card Details
            </span>
          </div>

          {hasCard && cardId ? (
            <CardDetailsBody
              cardId={cardId}
              isEditingTitle={isEditingTitle}
              setIsEditingTitle={setIsEditingTitle}
            />
          ) : (
            <div className="flex items-center justify-center h-32 text-content-tinted/50 text-sm">
              Select a task
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Body dispatcher ──────────────────────────────────────────────────────────

function CardDetailsBody({
  cardId,
  isEditingTitle,
  setIsEditingTitle,
}: {
  cardId: string;
  isEditingTitle: boolean;
  setIsEditingTitle: (v: boolean) => void;
}) {
  const card = useSyncSelector(
    () => projectCategoryCardsSlice.byId(cardId),
    [cardId],
  );

  if (isTask(card)) {
    return (
      <TaskBody
        task={card}
        isEditingTitle={isEditingTitle}
        setIsEditingTitle={setIsEditingTitle}
      />
    );
  }

  if (isTaskTemplate(card)) {
    return (
      <TemplateBody
        template={card}
        isEditingTitle={isEditingTitle}
        setIsEditingTitle={setIsEditingTitle}
      />
    );
  }

  return null;
}
