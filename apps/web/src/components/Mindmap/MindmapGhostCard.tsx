import { useCallback } from "react";
import { useAsyncSelector } from "@will-be-done/hyperdb/react";
import { taskById } from "@will-be-done/slices/space";
import { cn } from "@/lib/utils.ts";
import { RichTextView } from "@/components/RichText/RichTextView";
import type { LaidOutNode } from "./mindmapLayout.ts";
import {
  type CanvasNode,
  branchColor,
  nodeShapeClass,
} from "./mindmapModel.ts";

// Where a dragged node or task lands if dropped now.
export function MindmapGhostCard({
  layout,
  source,
  register,
}: {
  layout: LaidOutNode;
  source:
    | { kind: "node"; entry: CanvasNode }
    | { kind: "task"; taskId: string };
  register: (id: string, element: HTMLElement | null) => void;
}) {
  const { data: droppedTask } = useAsyncSelector({
    selector: taskById,
    args: { id: source.kind === "task" ? source.taskId : "" },
  });
  const entry = source.kind === "node" ? source.entry : undefined;
  const task =
    entry?.kind === "node" ? entry.tree.task : (droppedTask ?? undefined);
  const title =
    entry?.kind === "node" && !entry.tree.task
      ? entry.tree.node.title
      : (task?.title ?? "");
  const isTask = source.kind === "task" || !!task;
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
      className={cn(
        "pointer-events-none absolute left-0 top-0 w-max max-w-[280px] border-dashed text-content opacity-70",
        nodeShapeClass(layout.depth),
      )}
      style={{
        transform: `translate(${layout.x}px, ${layout.y}px)`,
        borderColor: branchColor(layout.branch),
      }}
    >
      <div className="flex items-start gap-2">
        {isTask && (
          <span className="mt-0.5 size-4 shrink-0 rounded border border-content-tinted/60" />
        )}
        <div className="min-w-0 flex-1">
          {title.trim() ? (
            <RichTextView text={title} />
          ) : (
            <span className="italic text-content-tinted/50">
              {isTask ? "Untitled task" : "Topic"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
