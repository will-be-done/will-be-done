import { useCallback } from "react";
import { useAsyncSelector } from "@will-be-done/hyperdb/react";
import { noteById, taskById } from "@will-be-done/slices/space";
import { StickyNote } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { RichTextView } from "@/components/RichText/RichTextView";
import { ItemCover } from "@/components/Attachments/ItemCover";
import type { LaidOutNode } from "./mindmapLayout.ts";
import type { MindmapItem } from "./mindmapDnd.ts";
import {
  type CanvasNode,
  branchColor,
  nodeKind,
  nodeShapeClass,
} from "./mindmapModel.ts";

// Where a dragged node, task or note lands if dropped now.
export function MindmapGhostCard({
  layout,
  source,
  register,
}: {
  layout: LaidOutNode;
  source:
    | { kind: "node"; entry: CanvasNode }
    | { kind: "item"; item: MindmapItem };
  register: (id: string, element: HTMLElement | null) => void;
}) {
  const dropped = source.kind === "item" ? source.item : undefined;
  const { data: droppedTask } = useAsyncSelector({
    selector: taskById,
    args: { id: dropped?.type === "task" ? dropped.id : "" },
  });
  const { data: droppedNote } = useAsyncSelector({
    selector: noteById,
    args: { id: dropped?.type === "note" ? dropped.id : "" },
  });
  const entry = source.kind === "node" ? source.entry : undefined;
  const tree = entry?.kind === "node" ? entry.tree : undefined;
  const kind = dropped ? dropped.type : tree ? nodeKind(tree) : "topic";
  const item = tree
    ? (tree.task ?? tree.note)
    : (droppedTask ?? droppedNote ?? undefined);
  const title = item ? item.title : (tree?.node.title ?? "");
  const { id } = layout;

  const setRef = useCallback(
    (element: HTMLDivElement | null) => {
      if (!element) return;
      register(id, element);
      return () => register(id, null);
    },
    [id, register],
  );

  return (
    <div
      ref={setRef}
      aria-hidden
      data-drop-ghost
      className={cn(
        "pointer-events-none absolute left-0 top-0 w-max max-w-[280px] border-dashed text-content opacity-70",
        nodeShapeClass(layout.depth),
      )}
      style={{
        transform: `translate(${layout.x}px, ${layout.y}px)`,
        borderColor: branchColor(layout.branch),
      }}
    >
      <ItemCover
        attachmentId={item?.coverAttachmentId}
        muted={item?.type === "task" && item.state === "done"}
        className="mb-1.5 aspect-[3/1] max-h-20 min-w-44 rounded-md"
      />
      <div className="flex items-start gap-2">
        {kind === "task" && (
          <span className="mt-0.5 size-4 shrink-0 rounded border border-content-tinted/60" />
        )}
        {kind === "note" && (
          <StickyNote className="mt-0.5 size-3.5 shrink-0 text-content-tinted" />
        )}
        <div className="min-w-0 flex-1">
          {title.trim() ? (
            <RichTextView text={title} />
          ) : (
            <span className="italic text-content-tinted/50">
              {kind === "task"
                ? "Untitled task"
                : kind === "note"
                  ? "Untitled note"
                  : "Topic"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
