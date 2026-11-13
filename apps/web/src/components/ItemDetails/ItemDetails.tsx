import { useRef, useState, useCallback } from "react";
import { Maximize2 } from "lucide-react";
import { itemPageLocation } from "@/components/ItemPage/useOpenItemPage.ts";
import { Link } from "@tanstack/react-router";
import { Route as SpaceRoute } from "@/routes/spaces.$spaceId.tsx";
import { useItemDetailsEditing } from "./useItemDetailsEditing.ts";
import { cn } from "@/lib/utils";
import { useAsyncSelector } from "@will-be-done/hyperdb/react";
import { useFocusStore, parseColumnKey } from "@/store/focusSlice.ts";
import {
  dailyEntryType,
  itemByListItemId,
  isTask,
  isTaskTemplate,
  isNote,
  type Item,
  type ListItemType,
  stashEntryType,
  taskTemplateType,
  noteType,
  taskType,
} from "@will-be-done/slices/space";
import { useGlobalListener } from "@/components/GlobalListener/hooks.tsx";
import { TaskBody } from "./TaskBody.tsx";
import { TemplateBody } from "./TemplateBody.tsx";
import { NoteBody } from "./NoteBody.tsx";
import { ResizableDivider } from "@/components/DaysBoard/ResizableDivider.tsx";
import { isInputElement } from "@/utils/isInputElement.ts";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AttachmentDropZone } from "@/components/Attachments/AttachmentDropZone.tsx";
import {
  useItemDetailsSize,
  useItemDetailsOpen,
} from "@/components/ItemDetails/ItemDetailsStore.ts";

const isListItemType = (type: string): type is ListItemType =>
  type === taskType ||
  type === taskTemplateType ||
  type === noteType ||
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
  // Keep the previous item while the next loads so focus moves don't flash empty.
  const { data: selectedItem } = useAsyncSelector({
    selector: itemByListItemId,
    args: {
      id: focusedListItemId ?? "",
      modelType: focusedListItemType ?? taskType,
    },
    placeholderData: (previous) => previous,
  });
  const focusedItem = focusedListItemId ? selectedItem : undefined;
  const itemId = focusedItem?.id ?? null;
  const isVisible = focusedItem !== undefined;

  const { spaceId } = SpaceRoute.useParams();
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

  // Escape closes panel (not while editing title, or closing a dialog)
  useGlobalListener("keydown", (e: KeyboardEvent) => {
    if (
      e.key === "Escape" &&
      !e.defaultPrevented &&
      isVisible &&
      !isEditingAnyField &&
      !useFocusStore.getState().isFocusDisabled
    ) {
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
            "h-full transition-[transform,opacity] duration-300 ease-out",
            isPanelOpen
              ? "translate-x-0 opacity-100"
              : "translate-x-6 opacity-0 pointer-events-none",
          )}
          style={{ width: `${width}px` }}
        >
          <AttachmentDropZone
            parent={
              focusedItem
                ? { parentType: focusedItem.type, parentId: focusedItem.id }
                : undefined
            }
            className="h-full"
          >
            <ScrollArea rootClassName="h-full">
              {/* Header */}
              <div className="flex items-center gap-2 px-3 py-2 border-b border-task-panel-divider">
                <span className="text-content-tinted text-xs font-medium flex-1">
                  Item Details
                </span>
                {focusedItem && (
                  <Link
                    {...itemPageLocation(spaceId, focusedItem)}
                    title="Open as page"
                    aria-label="Open as page"
                    className="-my-1 cursor-pointer rounded p-1 text-content-tinted transition-colors hover:bg-task-panel-hover hover:text-content"
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>

              {focusedItem ? (
                <ItemDetailsBody
                  item={focusedItem}
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
            </ScrollArea>
          </AttachmentDropZone>
        </div>
      </div>
    </div>
  );
}

// ─── Body dispatcher ──────────────────────────────────────────────────────────

export function ItemDetailsBody({
  item,
  isEditingTitle,
  setIsEditingTitle,
  isEditingDescription,
  setIsEditingDescription,
  onItemIdChange,
}: {
  item: Item;
  isEditingTitle: boolean;
  setIsEditingTitle: (v: boolean) => void;
  isEditingDescription: boolean;
  setIsEditingDescription: (v: boolean) => void;
  onItemIdChange?: (itemId: string) => void;
}) {
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

  if (isNote(item)) {
    return (
      <NoteBody
        note={item}
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
