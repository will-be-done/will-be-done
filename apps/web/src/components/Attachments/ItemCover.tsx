import { useState } from "react";
import { useAsyncSelector } from "@will-be-done/hyperdb/react";
import {
  attachmentById,
  type AttachmentParentType,
} from "@will-be-done/slices/space";
import { isImageAttachment } from "./attachmentFiles";
import { AttachmentThumb } from "./AttachmentThumb";
import { AttachmentPreview } from "./AttachmentPreview";
import { cn } from "@/lib/utils";

export function ItemCover({
  attachmentId,
  muted = false,
  className,
  previewParent,
}: {
  attachmentId: string | null | undefined;
  muted?: boolean;
  className?: string;
  // Clicking opens the cover full screen, paging through this parent's images.
  previewParent?: { parentType: AttachmentParentType; parentId: string };
}) {
  const { data: attachment, isLoading } = useAsyncSelector({
    selector: attachmentById,
    args: { id: attachmentId ?? "" },
    enabled: !!attachmentId,
  });
  const [isPreviewing, setIsPreviewing] = useState(false);

  // Covers are always images, so the box is reserved before the row loads: the
  // mindmap measures node sizes, and a cover that appears a frame later moves
  // everything below it. A cover whose file is gone reserves nothing.
  if (!attachmentId) return null;
  if (!attachment && !isLoading) return null;
  if (attachment && !isImageAttachment(attachment.mimeType)) return null;

  return (
    <>
      <div
        data-testid="item-cover"
        onClick={
          previewParent &&
          ((e) => {
            // Modifier clicks change the selection instead.
            if (!e.shiftKey && !e.metaKey && !e.ctrlKey) setIsPreviewing(true);
          })
        }
        className={cn(
          "aspect-[16/9] max-h-44 w-full overflow-hidden rounded-t-lg bg-panel-tinted",
          muted && "opacity-65 saturate-50",
          previewParent && "cursor-zoom-in",
          className,
        )}
      >
        {attachment && (
          <AttachmentThumb
            attachment={attachment}
            rememberSize
            className="h-full w-full rounded-none"
          />
        )}
      </div>
      {isPreviewing && attachment && (
        // The dialog is portaled, but React still bubbles its events to the
        // card, where a double-click would start editing.
        <span className="contents" onDoubleClick={(e) => e.stopPropagation()}>
          <AttachmentPreview
            attachment={attachment}
            parent={previewParent}
            onClose={() => setIsPreviewing(false)}
          />
        </span>
      )}
    </>
  );
}
