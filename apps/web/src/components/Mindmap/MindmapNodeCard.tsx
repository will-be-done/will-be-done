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
  updateMindmap,
  updateMindmapNode,
  updateNote,
  updateTask,
} from "@will-be-done/slices/space";
import { ListTodo, Plus, StickyNote, Trash2, Unlink } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { useFocusStore } from "@/store/focusSlice.ts";
import { CheckboxComp } from "@/components/Checklist/Checklist";
import { RichTextEditor } from "@/components/RichText/RichTextEditor";
import { RichTextView } from "@/components/RichText/RichTextView";
import { useSavedRichText } from "@/components/RichText/useSavedRichText";
import { setElementDragPreview } from "@/lib/dnd/dragPreview";
import { TaskDatePicker } from "@/components/Task/TaskDatePicker.tsx";
import { format } from "date-fns";
import type { LaidOutNode } from "./mindmapLayout.ts";
import {
  type CanvasNode,
  type NodeKind,
  branchColor,
  nodeShapeClass,
  useMindmapDatePicker,
  useMindmapDrop,
  useMindmapSelection,
} from "./mindmapModel.ts";
import { mindmapNodeDragData } from "./mindmapDnd.ts";

export type MindmapNodeActions = {
  addChild: (id: string) => void;
  remove: (id: string) => void;
  convert: (id: string, to: NodeKind) => void;
  toggleCollapsed: (id: string) => void;
  // A topic left empty after editing is discarded, like an empty new task.
  discardIfEmpty: (id: string, refocus: boolean) => void;
  register: (id: string, element: HTMLElement | null) => void;
  toggleSelected: (id: string) => void;
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
  const isEditing = isEditingInStore || isStartEditing;
  const isDropParent = useMindmapDrop((s) => {
    const intent = s.preview?.intent;
    return intent?.kind === "child" && intent.nodeId === id;
  });
  const isSelected = useMindmapSelection((s) => s.ids.has(id));
  const isDatePickerOpen = useMindmapDatePicker((s) => s.nodeId === id);

  const node = entry.kind === "node" ? entry.tree.node : undefined;
  const task = entry.kind === "node" ? entry.tree.task : undefined;
  const note = entry.kind === "node" ? entry.tree.note : undefined;
  const item = task ?? note;
  const project = entry.kind === "node" ? entry.tree.project : undefined;
  const hasChildren = entry.kind === "node" && entry.tree.children.length > 0;
  const isDone = task?.state === "done";
  const { data: scheduledAt } = useAsyncSelector({
    selector: dailyEntryDateOfTask,
    args: { taskId: task?.id ?? "" },
    enabled: !!task,
  });
  const color = branchColor(layout.branch);

  const stored =
    entry.kind === "root"
      ? { text: entry.mindmap.title, doc: entry.mindmap.titleDoc }
      : item
        ? { text: item.title, doc: item.titleDoc }
        : { text: entry.tree.node.title, doc: entry.tree.node.titleDoc };
  const isEmptyRef = useRef(!stored.text.trim());
  const persist = useCallback(
    async (titleDoc: string) => {
      isEmptyRef.current = !richTextDocToMarkdown(titleDoc, "title").trim();
      if (entry.kind === "root") {
        await dispatch(updateMindmap({ id, mindmap: { titleDoc } }));
      } else if (task) {
        await dispatch(updateTask({ id: task.id, task: { titleDoc } }));
      } else if (note) {
        await dispatch(updateNote({ id: note.id, note: { titleDoc } }));
      } else {
        await dispatch(updateMindmapNode({ id, node: { titleDoc } }));
      }
    },
    [dispatch, entry.kind, id, note, task],
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
    useFocusStore.getState().resetEdit();
    ref.current?.focus({ preventScroll: true });
    if (!item && entry.kind === "node" && isEmptyRef.current) {
      actions.discardIfEmpty(id, true);
    }
  };

  const handleBlur = () => {
    setIsStartEditing(false);
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
        if (e.button === 0 && (e.shiftKey || e.metaKey || e.ctrlKey)) {
          actions.toggleSelected(id);
        }
      }}
      onClick={(e) => {
        if (!(e.shiftKey || e.metaKey || e.ctrlKey)) {
          useMindmapSelection.getState().clear();
        }
      }}
      onDoubleClick={() => useFocusStore.getState().editByKey(focusKey)}
      className={cn(
        "group/node absolute left-0 top-0 w-max max-w-[280px] cursor-default outline-none hover:z-10",
        nodeShapeClass(layout.depth),
        isDone ? "text-done-content" : "text-content",
        (isFocused || isEditing) && "z-10 ring-2 ring-accent",
        isSelected && "bg-focused-panel ring-2 ring-accent/70",
        isDropParent && "bg-focused-panel ring-2 ring-accent",
        isMoving && "opacity-40",
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
        <div className={cn("min-w-0 flex-1", isDone && "line-through")}>
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
                autoFocus
                placeholder={placeholder}
                ariaLabel={
                  entry.kind === "root" ? "Edit mindmap title" : "Edit topic"
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
      {(project || scheduledAt) && (
        <div className="mt-0.5 truncate text-[10px] font-normal text-content-tinted/60">
          {project && `${project.icon} ${project.title}`}
          {project && scheduledAt && " · "}
          {scheduledAt && format(scheduledAt, "MMM d")}
        </div>
      )}
      {task && isDatePickerOpen && (
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

      {hasChildren && node && (
        <button
          type="button"
          tabIndex={-1}
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
          className={cn(
            "absolute bottom-full left-0 pb-1 transition-opacity",
            !isFocused &&
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
                {item ? (
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
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
