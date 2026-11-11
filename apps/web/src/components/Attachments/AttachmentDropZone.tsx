import { useState, type ReactNode } from "react";
import { Paperclip } from "lucide-react";
import type { AttachmentParentType } from "@will-be-done/slices/space";
import { cn } from "@/lib/utils";
import { useAttachFiles } from "./attachmentFiles";

const hasFiles = (event: React.DragEvent) =>
  event.dataTransfer.types.includes("Files");

// Files dropped anywhere on an item's details attach to the item. The
// description editor takes drops itself to place them inline.
export function AttachmentDropZone({
  parent,
  className,
  children,
}: {
  parent: { parentType: AttachmentParentType; parentId: string } | undefined;
  className?: string;
  children: ReactNode;
}) {
  const attachFiles = useAttachFiles(
    parent?.parentType ?? "task",
    parent?.parentId ?? "",
  );
  const [dragging, setDragging] = useState(false);

  return (
    <div
      className={cn("relative", className)}
      onDragOver={(event) => {
        if (!parent || !hasFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDragging(false);
        }
      }}
      onDrop={(event) => {
        setDragging(false);
        if (!parent || !hasFiles(event) || event.defaultPrevented) return;
        event.preventDefault();
        void attachFiles(Array.from(event.dataTransfer.files));
      }}
    >
      {children}
      {dragging && (
        <div
          data-testid="attachment-drop-overlay"
          className="pointer-events-none absolute inset-1.5 z-20 flex items-end justify-center rounded-xl border-2 border-dashed border-accent/70 bg-accent/10 pb-8"
        >
          <span className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-white shadow-lg">
            <Paperclip className="h-3.5 w-3.5" />
            Drop to attach
          </span>
        </div>
      )}
    </div>
  );
}
