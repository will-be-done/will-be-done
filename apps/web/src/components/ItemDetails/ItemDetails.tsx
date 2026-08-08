import { useRef, useState, useCallback } from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAsyncSelector } from "@will-be-done/hyperdb/react";
import { useFocusStore, parseColumnKey } from "@/store/focusSlice.ts";
import {
  dailyEntryType,
  itemByListItemId,
  isTask,
  isTaskTemplate,
  type ListItemType,
  projectSectionItemById,
  stashEntryType,
  taskTemplateType,
  taskType,
} from "@will-be-done/slices/space";
import { useGlobalListener } from "@/components/GlobalListener/hooks.tsx";
import { TaskBody } from "./TaskBody.tsx";
import { TemplateBody } from "./TemplateBody.tsx";
import { ResizableDivider } from "@/components/DaysBoard/ResizableDivider.tsx";
import { isInputElement } from "@/utils/isInputElement.ts";
import {
  useItemDetailsSize,
  useItemDetailsOpen,
  useItemDetailsEditRequest,
} from "@/components/ItemDetails/ItemDetailsStore.ts";

const isListItemType = (type: string): type is ListItemType =>
  type === taskType ||
  type === taskTemplateType ||
  type === dailyEntryType ||
  type === stashEntryType;

// ─── Main sidebar panel ──────────────────────────────────────────────────────

export function ItemDetails() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);
  const focusKey = useFocusStore((s) => s.focusItemKey);
  const parsed = focusKey ? parseColumnKey(focusKey) : null;
  const focusedListItemType =
    parsed && isListItemType(parsed.type) ? parsed.type : null;
  const focusedListItemId = focusedListItemType && parsed ? parsed.id : null;
  const { data: focusedItem } = useAsyncSelector({
    selector: itemByListItemId,
    args: {
      id: focusedListItemId ?? "",
      modelType: focusedListItemType ?? taskType,
    },
    enabled: !!focusedListItemId,
  });
  const itemId = focusedItem?.id ?? null;
  const isVisible = focusedItem !== undefined;

  const width = useItemDetailsSize((s) => s.width);
  const setWidth = useItemDetailsSize((s) => s.setWidth);
  const { isOpen: isPanelOpen, toggle } = useItemDetailsOpen();
  const {
    isEditingTitle,
    setIsEditingTitle,
    isEditingDescription,
    setIsEditingDescription,
    isEditingAnyField,
  } = useItemDetailsEditing(itemId);

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

  const hasItem = isVisible && !!itemId;
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
          data-testid="item-details-panel"
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
              Item Details
            </span>
          </div>

          {hasItem && itemId ? (
            <ItemDetailsBody
              itemId={itemId}
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

export function ItemDetailsPage({
  itemId,
  onBack,
  onItemIdChange,
}: {
  itemId: string;
  onBack: () => void;
  onItemIdChange?: (itemId: string) => void;
}) {
  const { data: item } = useAsyncSelector({
    selector: projectSectionItemById,
    args: { id: itemId },
  });
  const isVisible = item !== undefined;
  const {
    isEditingTitle,
    setIsEditingTitle,
    isEditingDescription,
    setIsEditingDescription,
  } = useItemDetailsEditing(itemId);

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
          <ItemDetailsBody
            itemId={itemId}
            isEditingTitle={isEditingTitle}
            setIsEditingTitle={setIsEditingTitle}
            isEditingDescription={isEditingDescription}
            setIsEditingDescription={setIsEditingDescription}
            onItemIdChange={onItemIdChange}
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

function useItemDetailsEditing(itemId: string | null) {
  const [editingFieldKey, setEditingFieldKey] = useState<string | null>(null);
  const titleFieldKey = itemId ? `${itemId}:title` : null;
  const descriptionFieldKey = itemId ? `${itemId}:description` : null;
  const editRequest = useItemDetailsEditRequest((s) => s.request);
  const isDescriptionEditRequested =
    !!itemId &&
    editRequest?.itemId === itemId &&
    editRequest.field === "description";
  const isEditingTitle = editingFieldKey === titleFieldKey;
  const isEditingDescription =
    editingFieldKey === descriptionFieldKey || isDescriptionEditRequested;
  const isEditingAnyField =
    !!itemId &&
    (editingFieldKey?.startsWith(`${itemId}:`) === true ||
      isDescriptionEditRequested);

  const setIsEditingTitle = useCallback(
    (v: boolean) => setEditingFieldKey(v && itemId ? `${itemId}:title` : null),
    [itemId],
  );
  const setIsEditingDescription = useCallback(
    (v: boolean) => {
      if (!v) {
        useItemDetailsEditRequest.getState().clearRequest();
      }

      setEditingFieldKey(v && itemId ? `${itemId}:description` : null);
    },
    [itemId],
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

function ItemDetailsBody({
  itemId,
  isEditingTitle,
  setIsEditingTitle,
  isEditingDescription,
  setIsEditingDescription,
  onItemIdChange,
}: {
  itemId: string;
  isEditingTitle: boolean;
  setIsEditingTitle: (v: boolean) => void;
  isEditingDescription: boolean;
  setIsEditingDescription: (v: boolean) => void;
  onItemIdChange?: (itemId: string) => void;
}) {
  const { data: item } = useAsyncSelector({
    selector: projectSectionItemById,
    args: { id: itemId },
  });

  if (isTask(item)) {
    return (
      <TaskBody
        task={item}
        isEditingTitle={isEditingTitle}
        setIsEditingTitle={setIsEditingTitle}
        isEditingDescription={isEditingDescription}
        setIsEditingDescription={setIsEditingDescription}
        onItemIdChange={onItemIdChange}
      />
    );
  }

  if (isTaskTemplate(item)) {
    return (
      <TemplateBody
        template={item}
        isEditingTitle={isEditingTitle}
        setIsEditingTitle={setIsEditingTitle}
        isEditingDescription={isEditingDescription}
        setIsEditingDescription={setIsEditingDescription}
        onItemIdChange={onItemIdChange}
      />
    );
  }

  return null;
}
