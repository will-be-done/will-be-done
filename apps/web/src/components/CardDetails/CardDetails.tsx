import { useRef, useState, useCallback } from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSyncSelector } from "@will-be-done/hyperdb-lib";
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
import { isInputElement } from "@/utils/isInputElement.ts";
import {
  useCardDetailsSize,
  useCardDetailsOpen,
  useCardDetailsEditRequest,
} from "./CardDetailsStore.ts";

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
    function*() {
      if (!cardId) return false;
      return yield* cardsSlice.exists(cardId);
    },
    [cardId],
  );

  const width = useCardDetailsSize((s) => s.width);
  const setWidth = useCardDetailsSize((s) => s.setWidth);
  const { isOpen: isPanelOpen, toggle } = useCardDetailsOpen();
  const {
    isEditingTitle,
    setIsEditingTitle,
    isEditingDescription,
    setIsEditingDescription,
    isEditingAnyField,
  } = useCardDetailsEditing(cardId);

  // Escape closes panel (not while editing title)
  useGlobalListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape" && isVisible && !isEditingAnyField) {
      useFocusStore.getState().resetFocus();
      return;
    }

    const noModifiers = !(e.shiftKey || e.ctrlKey || e.metaKey || e.altKey);

    if (
      e.code === "KeyV" &&
      noModifiers &&
      !isEditingAnyField &&
      !e.defaultPrevented
    ) {
      const target =
        e.target instanceof Element ? e.target : document.activeElement;
      if (target && isInputElement(target)) return;

      e.preventDefault();
      toggle();
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
      className={cn(
        "relative h-full flex-shrink-0 z-1000",
        widthTransitionClass,
      )}
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
          className={cn(
            "text-content-tinted transition-transform duration-300 ease-out",
            {
              "rotate-180": isPanelOpen,
            },
          )}
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
              isEditingDescription={isEditingDescription}
              setIsEditingDescription={setIsEditingDescription}
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

export function CardDetailsPage({
  cardId,
  onBack,
  onCardIdChange,
}: {
  cardId: string;
  onBack: () => void;
  onCardIdChange?: (cardId: string) => void;
}) {
  const isVisible = useSyncSelector(
    function*() {
      return yield* cardsSlice.exists(cardId);
    },
    [cardId],
  );
  const {
    isEditingTitle,
    setIsEditingTitle,
    isEditingDescription,
    setIsEditingDescription,
  } = useCardDetailsEditing(cardId);

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-task-panel/95 text-content shadow-2xl backdrop-blur-sm safari:bg-task-panel safari:backdrop-blur-none">
      <div
        className="sticky top-0 z-10 border-b border-task-panel-divider bg-task-panel/95 px-3 pb-2 backdrop-blur-sm safari:bg-task-panel safari:backdrop-blur-none"
        style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}
      >
        <div className="flex h-10 items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="flex h-9 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-content-tinted transition-colors hover:bg-task-panel-hover hover:text-content active:bg-task-panel-hover cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <span className="min-w-0 flex-1 text-center text-sm font-medium text-content">
            Task details
          </span>
          <div aria-hidden className="h-9 w-[68px]" />
        </div>
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto"
        style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
      >
        {isVisible ? (
          <CardDetailsBody
            cardId={cardId}
            isEditingTitle={isEditingTitle}
            setIsEditingTitle={setIsEditingTitle}
            isEditingDescription={isEditingDescription}
            setIsEditingDescription={setIsEditingDescription}
            onCardIdChange={onCardIdChange}
          />
        ) : (
          <div className="flex h-40 items-center justify-center px-4 text-center text-sm text-content-tinted/60">
            Task details are not available.
          </div>
        )}
      </div>
    </div>
  );
}

function useCardDetailsEditing(cardId: string | null) {
  const [editingFieldKey, setEditingFieldKey] = useState<string | null>(null);
  const titleFieldKey = cardId ? `${cardId}:title` : null;
  const descriptionFieldKey = cardId ? `${cardId}:description` : null;
  const editRequest = useCardDetailsEditRequest((s) => s.request);
  const isDescriptionEditRequested =
    !!cardId &&
    editRequest?.cardId === cardId &&
    editRequest.field === "description";
  const isEditingTitle = editingFieldKey === titleFieldKey;
  const isEditingDescription =
    editingFieldKey === descriptionFieldKey || isDescriptionEditRequested;
  const isEditingAnyField =
    !!cardId &&
    (editingFieldKey?.startsWith(`${cardId}:`) === true ||
      isDescriptionEditRequested);

  const setIsEditingTitle = useCallback(
    (v: boolean) => setEditingFieldKey(v && cardId ? `${cardId}:title` : null),
    [cardId],
  );
  const setIsEditingDescription = useCallback(
    (v: boolean) => {
      if (!v) {
        useCardDetailsEditRequest.getState().clearRequest();
      }

      setEditingFieldKey(v && cardId ? `${cardId}:description` : null);
    },
    [cardId],
  );

  return {
    isEditingTitle,
    setIsEditingTitle,
    isEditingDescription,
    setIsEditingDescription,
    isEditingAnyField,
  };
}

// ─── Body dispatcher ──────────────────────────────────────────────────────────

function CardDetailsBody({
  cardId,
  isEditingTitle,
  setIsEditingTitle,
  isEditingDescription,
  setIsEditingDescription,
  onCardIdChange,
}: {
  cardId: string;
  isEditingTitle: boolean;
  setIsEditingTitle: (v: boolean) => void;
  isEditingDescription: boolean;
  setIsEditingDescription: (v: boolean) => void;
  onCardIdChange?: (cardId: string) => void;
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
        isEditingDescription={isEditingDescription}
        setIsEditingDescription={setIsEditingDescription}
        onCardIdChange={onCardIdChange}
      />
    );
  }

  if (isTaskTemplate(card)) {
    return (
      <TemplateBody
        template={card}
        isEditingTitle={isEditingTitle}
        setIsEditingTitle={setIsEditingTitle}
        isEditingDescription={isEditingDescription}
        setIsEditingDescription={setIsEditingDescription}
        onCardIdChange={onCardIdChange}
      />
    );
  }

  return null;
}
