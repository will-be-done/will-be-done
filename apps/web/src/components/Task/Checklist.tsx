import { type ComponentProps, useEffect, useRef, useState } from "react";
import invariant from "tiny-invariant";
import { Checkbox } from "@base-ui-components/react/checkbox";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
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
import { cn } from "@/lib/utils";
import { buildFocusKey, useFocusStore } from "@/store/focusSlice";

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
      className="flex size-4 items-center justify-center rounded-sm bg-input-bg ring-1 ring-ring mt-0.5 transition-all hover:ring-ring-hover data-[checked]:bg-input-checked data-[checked]:ring-input-checked"
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
        direction === "top" ? "top-0" : "bottom-0",
      )}
    />
  );
};

const focusChecklistItem = (
  itemId: string,
  options?: { caret?: "end" },
) => {
  window.requestAnimationFrame(() => {
    const item = document.querySelector<HTMLElement>(
      `[data-checklist-item-id="${CSS.escape(itemId)}"]`,
    );
    const textarea = item?.querySelector<HTMLTextAreaElement>("textarea");

    if (!textarea) return;

    textarea.focus();

    if (options?.caret === "end") {
      const end = textarea.value.length;
      textarea.setSelectionRange(end, end);
    }
  });
};

type TaskFocusKey = ReturnType<typeof buildFocusKey>;

const focusTaskFromChecklist = (focusableItemKey: TaskFocusKey) => {
  const focusStore = useFocusStore.getState();

  focusStore.focusByKey(focusableItemKey, true);
  focusStore.resetEdit();
};

const ChecklistItemComp = ({
  item,
  focusableItemKey,
}: {
  item: ChecklistItem;
  focusableItemKey: TaskFocusKey;
}) => {
  const dispatch = useDispatch();
  const select = useSelect();
  const rowRef = useRef<HTMLDivElement | null>(null);
  const dragHandleRef = useRef<HTMLButtonElement | null>(null);
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null);

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
        <TextareaAutosize
          value={item.content}
          onChange={(e) =>
            dispatch(
              checklistItemsSlice.updateItem(item.id, {
                content: e.target.value,
              }),
            )
          }
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.stopPropagation();

              const newItem = dispatch(
                checklistItemsSlice.createItemAfter(item.id),
              );
              focusChecklistItem(newItem.id);
            } else if (
              e.key === "Backspace" &&
              e.currentTarget.value.length === 0
            ) {
              e.preventDefault();
              e.stopPropagation();

              const [before, after] = select(
                checklistItemsSlice.siblings(item.id),
              );
              dispatch(checklistItemsSlice.deleteItems([item.id]));

              if (before) {
                focusChecklistItem(before.id, { caret: "end" });
              } else if (after) {
                focusChecklistItem(after.id, { caret: "end" });
              }
            }
          }}
          onFocus={() => focusTaskFromChecklist(focusableItemKey)}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          className={cn(
            "min-h-4 flex-1 resize-none bg-transparent pt-0.5 leading-4 focus:outline-none",
            item.state === "done" && "text-content-tinted line-through",
          )}
          aria-label="Checklist item"
        />
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
  visible,
  focusableItemKey,
}: {
  parentId: string;
  parentType: ChecklistParentType;
  visible: boolean;
  focusableItemKey: TaskFocusKey;
}) => {
  const dispatch = useDispatch();
  const [content, setContent] = useState("");
  const items = useSyncSelector(
    () => checklistItemsSlice.children(parentId, parentType),
    [parentId, parentType],
  );

  const createItem = () => {
    const trimmed = content.trim();
    if (!trimmed) return;

    dispatch(
      checklistItemsSlice.createItem({
        parentId,
        parentType,
        content: trimmed,
      }),
    );
    setContent("");
  };

  if (!visible && items.length === 0) return null;

  return (
    <div className="border-t border-ring px-0 pt-2">
      {items.map((item) => (
        <ChecklistItemComp
          key={item.id}
          item={item}
          focusableItemKey={focusableItemKey}
        />
      ))}
      {visible && (
        <div className="flex min-h-5 items-center gap-1.5 px-2 pt-2 pb-1 text-xs">
          <Plus className="h-3.5 w-3.5 shrink-0 text-content-tinted" />
          <input
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                createItem();
              }
            }}
            onBlur={createItem}
            onFocus={() => focusTaskFromChecklist(focusableItemKey)}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            placeholder="Add checklist item"
            className="min-w-0 flex-1 bg-transparent text-xs text-content placeholder:text-content-tinted focus:outline-none"
            aria-label="Add checklist item"
          />
        </div>
      )}
    </div>
  );
};
