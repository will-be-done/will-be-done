import {
  type ComponentProps,
  type MouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import invariant from "tiny-invariant";
import { Checkbox } from "@base-ui-components/react/checkbox";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview";
import { preserveOffsetOnSource } from "@atlaskit/pragmatic-drag-and-drop/element/preserve-offset-on-source";
import {
  attachClosestEdge,
  type Edge,
  extractClosestEdge,
} from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import TextareaAutosize from "react-textarea-autosize";
import clsx from "clsx";
import { GripVertical, Plus } from "lucide-react";
import { useDispatch, useSelect, useSyncSelector } from "@will-be-done/hyperdb";
import {
  appSlice,
  checklistItemsSlice,
  checklistItemType,
  type ChecklistItem,
  type ChecklistParentType,
} from "@will-be-done/slices/space";
import { DndModelData, isModelDNDData } from "@/lib/dnd/models";
import { createElementDragPreview } from "@/lib/dnd/dragPreview";
import { cn } from "@/lib/utils";
import { buildFocusKey, useFocusStore } from "@/store/focusSlice";
import { useDebouncedPersistedDraft } from "@/hooks/useDebouncedPersistedDraft";
import { focusChecklistItem } from "./focus";

export function CheckboxComp({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Checkbox.Root
      defaultChecked
      className="flex size-4 items-center justify-center rounded-sm bg-input-bg ring-1 ring-ring mt-0.5 transition-all hover:ring-ring-hover data-[checked]:bg-input-checked data-[checked]:ring-input-checked flex-shrink-0 cursor-pointer"
      tabIndex={-1}
      checked={checked}
      onCheckedChange={onChange}
    >
      <Checkbox.Indicator className="flex text-white data-[unchecked]:hidden">
        <CheckIcon className="size-2.5" />
      </Checkbox.Indicator>
    </Checkbox.Root>
  );
}

function CheckIcon(props: ComponentProps<"svg">) {
  return (
    <svg
      fill="currentcolor"
      width="10"
      height="10"
      viewBox="0 0 10 10"
      {...props}
    >
      <path d="M9.1603 1.12218C9.50684 1.34873 9.60427 1.81354 9.37792 2.16038L5.13603 8.66012C5.01614 8.8438 4.82192 8.96576 4.60451 8.99384C4.3871 9.02194 4.1683 8.95335 4.00574 8.80615L1.24664 6.30769C0.939709 6.02975 0.916013 5.55541 1.19372 5.24822C1.47142 4.94102 1.94536 4.91731 2.2523 5.19524L4.36085 7.10461L8.12299 1.33999C8.34934 0.993152 8.81376 0.895638 9.1603 1.12218Z" />
    </svg>
  );
}

const DropChecklistIndicator = ({
  direction,
}: {
  direction: "top" | "bottom";
}) => {
  return (
    <div
      className={clsx(
        "pointer-events-none absolute left-0 right-0 z-10 h-[2px] bg-accent",
        direction === "top"
          ? "top-0 -translate-y-1/2"
          : "bottom-0 translate-y-1/2",
      )}
    />
  );
};

type ChecklistFocusKey = ReturnType<typeof buildFocusKey>;
type ChecklistEditTrigger = "click" | "doubleClick" | "always";

const focusParentFromChecklist = (focusableItemKey?: ChecklistFocusKey) => {
  if (!focusableItemKey) return;

  const focusStore = useFocusStore.getState();

  focusStore.focusByKey(focusableItemKey, true);
  focusStore.resetEdit();
};

const focusParentElementFromChecklist = (
  focusableItemKey?: ChecklistFocusKey,
) => {
  focusParentFromChecklist(focusableItemKey);
  if (!focusableItemKey) return;

  window.requestAnimationFrame(() => {
    document
      .querySelector<HTMLElement>(
        `[data-focusable-key="${CSS.escape(focusableItemKey)}"]`,
      )
      ?.focus();
  });
};

const ChecklistItemComp = ({
  item,
  focusableItemKey,
  editTrigger,
  onItemsRemoved,
}: {
  item: ChecklistItem;
  focusableItemKey?: ChecklistFocusKey;
  editTrigger: ChecklistEditTrigger;
  onItemsRemoved: () => void;
}) => {
  const dispatch = useDispatch();
  const select = useSelect();
  const rowRef = useRef<HTMLDivElement | null>(null);
  const dragHandleRef = useRef<HTMLButtonElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const persistContent = useCallback(
    (content: string) => {
      if (!select(checklistItemsSlice.byId(item.id))) return;

      dispatch(checklistItemsSlice.updateContent(item.id, content));
    },
    [dispatch, item.id, select],
  );
  const {
    draft: content,
    setDraft: setContent,
    flush: flushContent,
  } = useDebouncedPersistedDraft({
    value: item.content,
    persist: persistContent,
  });
  const isTextareaVisible = editTrigger === "always" || isEditing;

  useEffect(() => {
    const rowElement = rowRef.current;
    const dragHandleElement = dragHandleRef.current;
    invariant(rowElement);
    invariant(dragHandleElement);

    return combine(
      draggable({
        element: dragHandleElement,
        getInitialData: (): DndModelData => ({
          modelId: item.id,
          modelType: checklistItemType,
        }),
        onGenerateDragPreview: ({ location, nativeSetDragImage }) => {
          const rect = rowElement.getBoundingClientRect();

          setCustomNativeDragPreview({
            nativeSetDragImage,
            getOffset: preserveOffsetOnSource({
              element: rowElement,
              input: location.current.input,
            }),
            render({ container }) {
              const preview = createElementDragPreview({
                source: rowElement,
                rect,
              });
              container.appendChild(preview);

              return () => {
                preview.remove();
              };
            },
          });
        },
      }),
      dropTargetForElements({
        element: rowElement,
        canDrop: ({ source }) => {
          const data = source.data;
          if (!isModelDNDData(data)) return false;

          return select(
            appSlice.canDrop(
              item.id,
              checklistItemType,
              data.modelId,
              data.modelType,
            ),
          );
        },
        getIsSticky: () => true,
        getData: ({ input, element }) => {
          const data: DndModelData = {
            modelId: item.id,
            modelType: checklistItemType,
          };

          return attachClosestEdge(data, {
            input,
            element,
            allowedEdges: ["top", "bottom"],
          });
        },
        onDragEnter: (args) => {
          if (isModelDNDData(args.source.data)) {
            setClosestEdge(extractClosestEdge(args.self.data));
          }
        },
        onDrag: (args) => {
          if (isModelDNDData(args.source.data)) {
            setClosestEdge(extractClosestEdge(args.self.data));
          }
        },
        onDragLeave: () => setClosestEdge(null),
        onDrop: () => setClosestEdge(null),
      }),
    );
  }, [item.id, select]);

  useEffect(() => {
    const rowElement = rowRef.current;
    if (!rowElement) return;

    const handleEditRequest = () => setIsEditing(true);
    rowElement.addEventListener("checklist-item-edit", handleEditRequest);

    return () => {
      rowElement.removeEventListener("checklist-item-edit", handleEditRequest);
    };
  }, []);

  useEffect(() => {
    if (!isEditing) return;

    window.requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      textarea.focus();
      const end = textarea.value.length;
      textarea.setSelectionRange(end, end);
    });
  }, [isEditing]);

  const handleReadonlyItemClick = (event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();

    if (editTrigger === "click") {
      setIsEditing(true);
    }
  };

  const handleReadonlyItemDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();

    if (editTrigger === "doubleClick") {
      setIsEditing(true);
    }
  };

  const focusItemInCurrentChecklist = (
    itemId: string,
    options?: { caret?: "end" },
  ) => {
    focusChecklistItem(itemId, {
      ...options,
      root: rowRef.current?.closest("[data-checklist-container]"),
    });
  };

  return (
    <div className="relative">
      {closestEdge === "top" && <DropChecklistIndicator direction="top" />}
      <div
        ref={rowRef}
        data-checklist-item-id={item.id}
        className="group/checklist-item flex min-h-7 items-start gap-1.5 px-2 py-1 text-xs text-content"
      >
        <button
          ref={dragHandleRef}
          className="mt-0.5 flex h-3.5 w-3.5 shrink-0 cursor-grab items-center justify-center text-content-tinted opacity-0 transition-opacity hover:opacity-100 active:cursor-grabbing group-hover/checklist-item:opacity-100 focus-visible:opacity-100"
          aria-label="Drag checklist item"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <CheckboxComp
          checked={item.state === "done"}
          onChange={() => dispatch(checklistItemsSlice.toggleState(item.id))}
        />
        {isTextareaVisible ? (
          <TextareaAutosize
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.stopPropagation();
                flushContent();
                setIsEditing(false);

                const newItem = dispatch(
                  checklistItemsSlice.createItemAfter(item.id),
                );
                focusItemInCurrentChecklist(newItem.id);
              } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                flushContent();
                setIsEditing(false);

                if (focusableItemKey) {
                  focusParentElementFromChecklist(focusableItemKey);
                } else {
                  e.currentTarget.blur();
                }
              } else if (
                e.key === "Backspace" &&
                e.currentTarget.value.length === 0
              ) {
                e.preventDefault();
                e.stopPropagation();

                const [before, after] = select(
                  checklistItemsSlice.siblings(item.id),
                );
                flushContent();
                dispatch(checklistItemsSlice.deleteItems([item.id]));

                if (before) {
                  focusItemInCurrentChecklist(before.id, { caret: "end" });
                } else if (after) {
                  focusItemInCurrentChecklist(after.id, { caret: "end" });
                } else {
                  onItemsRemoved();
                }
              }
            }}
            onFocus={() => focusParentFromChecklist(focusableItemKey)}
            onBlur={() => {
              flushContent();
              if (editTrigger !== "always") {
                setIsEditing(false);
              }
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            data-gramm="false"
            data-gramm_editor="false"
            data-enable-grammarly="false"
            className={cn(
              "min-h-4 flex-1 resize-none bg-transparent pt-0.5 leading-4 focus:outline-none",
              item.state === "done" && "text-content-tinted line-through",
            )}
            aria-label="Checklist item"
          />
        ) : (
          <div
            className={cn(
              "min-h-4 flex-1 cursor-default whitespace-break-spaces pt-0.5 leading-4 [overflow-wrap:anywhere]",
              item.state === "done" && "text-content-tinted line-through",
            )}
            onClick={handleReadonlyItemClick}
            onDoubleClick={handleReadonlyItemDoubleClick}
          >
            {content}
          </div>
        )}
      </div>
      {closestEdge === "bottom" && (
        <DropChecklistIndicator direction="bottom" />
      )}
    </div>
  );
};

export const ChecklistItems = ({
  parentId,
  parentType,
  focusableItemKey,
  onItemsRemoved = () => {},
  editTrigger = "doubleClick",
  showAddItem = false,
  className,
}: {
  parentId: string;
  parentType: ChecklistParentType;
  visible?: boolean;
  focusableItemKey?: ChecklistFocusKey;
  onItemsRemoved?: () => void;
  editTrigger?: ChecklistEditTrigger;
  showAddItem?: boolean;
  className?: string;
}) => {
  const dispatch = useDispatch();
  const select = useSelect();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null);
  const items = useSyncSelector(
    () => checklistItemsSlice.children(parentId, parentType),
    [parentId, parentType],
  );
  const isParentDropTargetEnabled = items.length === 0;

  const createItem = () => {
    const item = dispatch(
      checklistItemsSlice.createItem({
        parentId,
        parentType,
      }),
    );

    focusChecklistItem(item.id, { root: containerRef.current });
  };

  useEffect(() => {
    if (!isParentDropTargetEnabled) {
      setClosestEdge(null);
      return;
    }

    const containerElement = containerRef.current;
    if (!containerElement) return;

    return dropTargetForElements({
      element: containerElement,
      canDrop: ({ source }) => {
        const data = source.data;
        if (!isModelDNDData(data)) return false;

        return select(
          appSlice.canDrop(parentId, parentType, data.modelId, data.modelType),
        );
      },
      getIsSticky: () => true,
      getData: ({ input, element }) => {
        const data: DndModelData = {
          modelId: parentId,
          modelType: parentType,
        };

        return attachClosestEdge(data, {
          input,
          element,
          allowedEdges: ["top", "bottom"],
        });
      },
      onDragEnter: (args) => {
        if (isModelDNDData(args.source.data)) {
          setClosestEdge(extractClosestEdge(args.self.data));
        }
      },
      onDrag: (args) => {
        if (isModelDNDData(args.source.data)) {
          setClosestEdge(extractClosestEdge(args.self.data));
        }
      },
      onDragLeave: () => setClosestEdge(null),
      onDrop: () => setClosestEdge(null),
    });
  }, [isParentDropTargetEnabled, parentId, parentType, select]);

  if (items.length === 0 && !showAddItem) return null;

  return (
    <div
      ref={containerRef}
      data-checklist-container
      className={cn("relative border-t border-ring px-0 pt-2", className)}
    >
      {isParentDropTargetEnabled && closestEdge === "top" && (
        <DropChecklistIndicator direction="top" />
      )}
      {items.map((item) => (
        <ChecklistItemComp
          key={item.id}
          item={item}
          focusableItemKey={focusableItemKey}
          editTrigger={editTrigger}
          onItemsRemoved={onItemsRemoved}
        />
      ))}
      {showAddItem && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            createItem();
          }}
          onDoubleClick={(event) => event.stopPropagation()}
          className="mt-1 flex min-h-7 w-full cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs text-content-tinted transition-colors hover:bg-task-panel-hover hover:text-content"
        >
          <Plus className="h-3.5 w-3.5 shrink-0" />
          Add checklist item
        </button>
      )}
      {isParentDropTargetEnabled && closestEdge === "bottom" && (
        <DropChecklistIndicator direction="bottom" />
      )}
    </div>
  );
};
