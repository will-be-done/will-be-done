import { useCallback, useEffect, useRef, useState } from "react";
import { draggable } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import {
  useAsyncDispatch,
  useAsyncSelector,
} from "@will-be-done/hyperdb/react";
import { richTextDocToMarkdown } from "@will-be-done/slices/common";
import {
  dailyEntryDateOfTask,
  toggleTaskState,
  updateMindmapNode,
  updateNote,
  updateTask,
} from "@will-be-done/slices/space";
import { ListTodo, Plus, StickyNote, Trash2, Unlink } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { useFocusStore } from "@/store/focusSlice.ts";
import { CheckboxComp, ChecklistItems } from "@/components/Checklist/Checklist";
import { RichTextEditor } from "@/components/RichText/RichTextEditor";
import { RichTextView } from "@/components/RichText/RichTextView";
import { viewTextOffset } from "@/components/RichText/caret";
import { useSavedRichText } from "@/components/RichText/useSavedRichText";
import { setElementDragPreview } from "@/lib/dnd/dragPreview";
import { TaskDatePicker } from "@/components/Task/TaskDatePicker.tsx";
import { SelectionDatePicker } from "@/components/Selection/SelectionDatePicker.tsx";
import { useClipboardStore } from "@/components/Selection/clipboard";
import type { LaidOutNode } from "./mindmapLayout.ts";
import {
  type CanvasNode,
  type Direction,
  type NodeKind,
  branchColor,
  nodeShapeClass,
  useMindmapDatePicker,
  useMindmapMenu,
  useMindmapDrop,
  useMindmapSelection,
} from "./mindmapModel.ts";
import { mindmapNodeDragData } from "./mindmapDnd.ts";
import { MindmapItemPlace } from "./MindmapItemPlace.tsx";
import { MindmapNodeMenu } from "./MindmapNodeMenu.tsx";

export type MindmapNodeActions = {
  addChild: (id: string) => void;
  addSibling: (id: string, edge: "before" | "after") => void;
  remove: (id: string) => void;
  removeNodes: (ids: string[]) => void;
  // Acts on the selection the node is in; task and note nodes keep their place.
  convert: (id: string, to: NodeKind) => void;
  trashItem: (id: string) => void;
  toggleCollapsed: (id: string) => void;
  toggleTask: (id: string) => void;
  // A topic left empty after editing is discarded, like an empty new task.
  discardIfEmpty: (id: string, refocus: boolean) => void;
  register: (id: string, element: HTMLElement | null) => void;
  // Ctrl/Cmd-click adds or removes; Shift-click selects a range.
  toggleSelected: (id: string) => void;
  selectRangeTo: (id: string) => void;
  scheduleSelection: (date: Date) => void;
  unscheduleSelection: () => void;
  moveInTree: (id: string, direction: Direction) => void;
  moveToProject: (id: string) => void;
  moveToSection: (id: string, projectSectionId: string) => void;
  schedule: (id: string) => void;
  scheduleToday: (id: string) => void;
  resetSchedule: (id: string) => void;
  stash: (id: string) => void;
  editDescription: (id: string) => void;
  addChecklistItem: (id: string) => void;
};

const toolbarButtonClass =
  "flex size-6 cursor-pointer items-center justify-center rounded-md text-content-tinted transition-colors hover:bg-white/10 hover:text-content";

export function MindmapNodeCard({
  mindmapId,
  entry,
  layout,
  actions,
  isMoving,
  startEditing = false,
}: {
  mindmapId: string;
  entry: CanvasNode;
  layout: LaidOutNode;
  actions: MindmapNodeActions;
  // Dimmed while a drag previews this node elsewhere.
  isMoving: boolean;
  // Navigation resets the focus store, so a new map's root edits on its own.
  startEditing?: boolean;
}) {
  const dispatch = useAsyncDispatch();
  const { id, focusKey } = entry;
  const ref = useRef<HTMLDivElement | null>(null);
  const isFocused = useFocusStore(
    (s) => !s.isFocusDisabled && s.focusItemKey === focusKey,
  );
  const isEditingInStore = useFocusStore(
    (s) => !s.isFocusDisabled && s.editItemKey === focusKey,
  );
  const [isStartEditing, setIsStartEditing] = useState(startEditing);
  // Where a double-click opened the editor; other ways in put it at the end.
  const [caretOffset, setCaretOffset] = useState<number>();
  const isEditing = isEditingInStore || isStartEditing;
  // Touch has no reliable double tap, so tapping a focused title edits it.
  const editOnTapRef = useRef(false);
  const isDropParent = useMindmapDrop((s) => {
    const intent = s.preview?.intent;
    return intent?.kind === "child" && intent.nodeId === id;
  });
  const isSelected = useMindmapSelection((s) => s.ids.has(id));
  const isDatePickerOpen = useMindmapDatePicker((s) => s.nodeId === id);
  const isDatePickerForSelection = useMindmapDatePicker((s) => s.forSelection);
  const isCut = useClipboardStore(
    (s) =>
      s.clipboard?.mode === "cut" &&
      !!s.clipboard.mindmap?.nodeIds.includes(id),
  );
  const isMenuOpen = useMindmapMenu((s) => s.nodeId === id);

  const node = entry.kind === "node" ? entry.tree.node : entry.node;
  const task = entry.kind === "node" ? entry.tree.task : undefined;
  const note = entry.kind === "node" ? entry.tree.note : undefined;
  const item = task ?? note;
  const hasChildren = entry.kind === "node" && entry.tree.children.length > 0;
  // Like the center topic, a floating root stays a topic and never collapses.
  const isFloating = entry.kind === "node" && entry.parentId === null;
  const isDone = task?.state === "done";
  const { data: scheduledAt } = useAsyncSelector({
    selector: dailyEntryDateOfTask,
    args: { taskId: task?.id ?? "" },
    enabled: !!task,
  });
  const color = branchColor(layout.branch);

  const stored = item
    ? { text: item.title, doc: item.titleDoc }
    : { text: node.title, doc: node.titleDoc };
  const isEmptyRef = useRef(!stored.text.trim());
  const persist = useCallback(
    async (titleDoc: string) => {
      isEmptyRef.current = !richTextDocToMarkdown(titleDoc, "title").trim();
      if (task) {
        await dispatch(updateTask({ id: task.id, task: { titleDoc } }));
      } else if (note) {
        await dispatch(updateNote({ id: note.id, note: { titleDoc } }));
      } else {
        await dispatch(updateMindmapNode({ id, node: { titleDoc } }));
      }
    },
    [dispatch, id, note, task],
  );
  const { text, doc, saveDoc } = useSavedRichText(
    stored.text,
    stored.doc,
    "title",
    persist,
  );

  const setRef = useCallback(
    (element: HTMLDivElement | null) => {
      ref.current = element;
      if (!element) return;
      actions.register(id, element);
      return () => actions.register(id, null);
    },
    [actions, id],
  );

  useEffect(() => {
    const element = ref.current;
    if (!element || entry.kind === "root" || isEditing) return;
    return draggable({
      element,
      // Dragging a selected node carries the whole selection.
      getInitialData: () => {
        const selection = useMindmapSelection.getState();
        if (selection.ids.has(id)) {
          return mindmapNodeDragData(mindmapId, [...selection.ids]);
        }
        selection.clear();
        return mindmapNodeDragData(mindmapId, [id]);
      },
      onGenerateDragPreview: ({ location, source, nativeSetDragImage }) => {
        setElementDragPreview({
          source: source.element,
          input: location.current.input,
          nativeSetDragImage,
        });
      },
    });
  }, [entry.kind, id, isEditing, mindmapId]);

  const handleExit = () => {
    setIsStartEditing(false);
    setCaretOffset(undefined);
    useFocusStore.getState().resetEdit();
    ref.current?.focus({ preventScroll: true });
    if (!item && entry.kind === "node" && isEmptyRef.current) {
      actions.discardIfEmpty(id, true);
    }
  };

  const handleBlur = () => {
    setIsStartEditing(false);
    setCaretOffset(undefined);
    useFocusStore.getState().resetEdit();
    if (!item && entry.kind === "node" && isEmptyRef.current) {
      actions.discardIfEmpty(id, false);
    }
  };

  const placeholder =
    entry.kind === "root"
      ? "Central topic"
      : task
        ? "Untitled task"
        : note
          ? "Untitled note"
          : "Topic";

  return (
    <div
      ref={setRef}
      data-mindmap-node={id}
      data-focusable-key={focusKey}
      tabIndex={0}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        if (e.metaKey || e.ctrlKey) actions.toggleSelected(id);
        else if (e.shiftKey) actions.selectRangeTo(id);
      }}
      onClick={(e) => {
        if (e.shiftKey || e.metaKey || e.ctrlKey) return;
        // The node's controls and their portaled menus act on its selection.
        const fromControl =
          !(e.target instanceof Element) ||
          !e.currentTarget.contains(e.target) ||
          !!e.target.closest("button");
        if (fromControl && useMindmapSelection.getState().ids.has(id)) return;
        useMindmapSelection.getState().clear();
      }}
      // The second click would select a word before the editor opens.
      onMouseDown={(e) => {
        if (e.detail > 1 && !isEditing) e.preventDefault();
      }}
      onDoubleClick={(e) => {
        if (isEditing) return;
        setCaretOffset(viewTextOffset(e));
        useFocusStore.getState().editByKey(focusKey);
      }}
      className={cn(
        "group/node absolute left-0 top-0 w-max max-w-[280px] cursor-default outline-none hover:z-10",
        nodeShapeClass(layout.depth),
        isDone ? "text-done-content" : "text-content",
        (isFocused || isEditing) && "z-10 ring-2 ring-accent",
        isSelected && "bg-focused-panel ring-2 ring-accent/70",
        isDropParent && "bg-focused-panel ring-2 ring-accent",
        (isMoving || isCut) && "opacity-40",
      )}
      style={{
        transform: `translate(${layout.x}px, ${layout.y}px)`,
        borderColor: color
          ? `${color}${layout.depth === 1 ? "" : "66"}`
          : undefined,
      }}
    >
      <div className="flex items-start gap-2">
        {task && (
          <CheckboxComp
            checked={isDone}
            onChange={() => void dispatch(toggleTaskState({ taskId: task.id }))}
          />
        )}
        {note && (
          <StickyNote className="mt-0.5 size-3.5 shrink-0 text-content-tinted" />
        )}
        <div
          className={cn("min-w-0 flex-1", isDone && "line-through")}
          onPointerDown={(e) => {
            editOnTapRef.current =
              e.pointerType === "touch" && isFocused && !isEditing;
          }}
          onClick={(e) => {
            if (
              !editOnTapRef.current ||
              (e.target instanceof Element && e.target.closest("a"))
            ) {
              return;
            }
            editOnTapRef.current = false;
            setCaretOffset(viewTextOffset(e));
            useFocusStore.getState().editByKey(focusKey);
          }}
        >
          {isEditing ? (
            <div data-task-title-input className="min-w-12">
              <RichTextEditor
                kind="title"
                doc={doc}
                text={text}
                onSave={saveDoc}
                onExit={handleExit}
                onBlur={handleBlur}
                required={!!item}
                itemField={!!item}
                autoFocus
                caretOffset={caretOffset}
                placeholder={placeholder}
                ariaLabel={
                  entry.kind === "root" ? "Edit central topic" : "Edit topic"
                }
              />
            </div>
          ) : text.trim() ? (
            <RichTextView text={text} />
          ) : (
            <span className="italic text-content-tinted/50">{placeholder}</span>
          )}
        </div>
      </div>
      {task && (
        <ChecklistItems
          hasChecklistItems={undefined}
          parent={task}
          focusableItemKey={focusKey}
          editTrigger="doubleClick"
          onItemsRemoved={() => ref.current?.focus({ preventScroll: true })}
          className="-mx-1 mt-1.5 pt-1"
        />
      )}
      {entry.kind === "node" && (
        <MindmapItemPlace
          id={id}
          tree={entry.tree}
          actions={actions}
          scheduledAt={scheduledAt}
        />
      )}
      {isDatePickerOpen && isDatePickerForSelection && (
        <SelectionDatePicker
          open
          onOpenChange={(open) => {
            if (!open) useMindmapDatePicker.getState().setNodeId(null);
          }}
          onSelectDate={actions.scheduleSelection}
          onClearDate={actions.unscheduleSelection}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            ref.current?.focus({ preventScroll: true });
          }}
          anchor={
            <span className="pointer-events-none absolute inset-x-0 bottom-0" />
          }
        />
      )}
      {task && isDatePickerOpen && !isDatePickerForSelection && (
        <TaskDatePicker
          taskId={task.id}
          currentDate={scheduledAt}
          open
          onOpenChange={(open) => {
            if (!open) useMindmapDatePicker.getState().setNodeId(null);
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            ref.current?.focus({ preventScroll: true });
          }}
          anchor={
            <span className="pointer-events-none absolute inset-x-0 bottom-0" />
          }
        />
      )}

      {hasChildren && entry.kind === "node" && !isFloating && (
        <button
          type="button"
          tabIndex={-1}
          data-drag-preview-exclude
          aria-label={node.collapsed ? "Expand" : "Collapse"}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => actions.toggleCollapsed(id)}
          className={cn(
            "absolute top-1/2 flex h-4 min-w-4 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-panel px-1 text-[10px] font-semibold leading-none text-content-tinted ring-1 ring-white/10 transition-opacity hover:text-content",
            layout.side === "left" ? "right-full mr-1" : "left-full ml-1",
            !node.collapsed &&
              "opacity-0 group-hover/node:opacity-100 group-focus/node:opacity-100",
          )}
        >
          {node.collapsed ? layout.hiddenCount : "−"}
        </button>
      )}

      {!isEditing && !isMoving && (
        // The bottom padding bridges the gap so hover survives the trip up.
        <div
          data-drag-preview-exclude
          className={cn(
            "absolute bottom-full left-0 pb-1 transition-opacity",
            !isFocused &&
              !isMenuOpen &&
              "pointer-events-none opacity-0 group-hover/node:pointer-events-auto group-hover/node:opacity-100",
          )}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
        >
          <div className="flex items-center gap-0.5 rounded-lg bg-task-dropdown p-0.5 ring-1 ring-white/10">
            <button
              type="button"
              tabIndex={-1}
              title={
                task
                  ? "Add subtask (Tab)"
                  : note
                    ? "Add subnote (Tab)"
                    : "Add subtopic (Tab)"
              }
              className={toolbarButtonClass}
              onClick={() => actions.addChild(id)}
            >
              <Plus className="size-3.5" />
            </button>
            {entry.kind === "node" && (
              <>
                {isFloating ? null : item ? (
                  <button
                    type="button"
                    tabIndex={-1}
                    title={`Unlink ${task ? "task" : "note"}, keep as topic`}
                    className={toolbarButtonClass}
                    onClick={() => actions.convert(id, "topic")}
                  >
                    <Unlink className="size-3.5" />
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      tabIndex={-1}
                      title="Convert to task"
                      className={toolbarButtonClass}
                      onClick={() => actions.convert(id, "task")}
                    >
                      <ListTodo className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      tabIndex={-1}
                      title="Convert to note"
                      className={toolbarButtonClass}
                      onClick={() => actions.convert(id, "note")}
                    >
                      <StickyNote className="size-3.5" />
                    </button>
                  </>
                )}
                <button
                  type="button"
                  tabIndex={-1}
                  title="Remove from mindmap (Backspace)"
                  className={toolbarButtonClass}
                  onClick={() => actions.remove(id)}
                >
                  <Trash2 className="size-3.5" />
                </button>
                <MindmapNodeMenu
                  id={id}
                  tree={entry.tree}
                  actions={actions}
                  isScheduled={!!scheduledAt}
                  isRoot={isFloating}
                  open={isMenuOpen}
                  onOpenChange={(open) =>
                    useMindmapMenu.getState().setNodeId(open ? id : null)
                  }
                  onCloseAutoFocus={(event) => {
                    event.preventDefault();
                    // Unless an action moved focus on, as the move dialog does.
                    if (
                      !document.activeElement ||
                      document.activeElement === document.body
                    ) {
                      ref.current?.focus({ preventScroll: true });
                    }
                  }}
                  triggerClassName={toolbarButtonClass}
                />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
