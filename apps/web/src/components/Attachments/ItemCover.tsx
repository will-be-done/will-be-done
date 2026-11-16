import { useAsyncSelector } from "@will-be-done/hyperdb/react";
import { attachmentById } from "@will-be-done/slices/space";
import { isImageAttachment } from "./attachmentFiles";
import { AttachmentThumb } from "./AttachmentThumb";
import { cn } from "@/lib/utils";

export function ItemCover({
  attachmentId,
  muted = false,
  className,
}: {
  attachmentId: string | null | undefined;
  muted?: boolean;
  className?: string;
}) {
  const { data: attachment, isLoading } = useAsyncSelector({
    selector: attachmentById,
    args: { id: attachmentId ?? "" },
    enabled: !!attachmentId,
  });

  // Covers are always images, so the box is reserved before the row loads: the
  // mindmap measures node sizes, and a cover that appears a frame later moves
  // everything below it. A cover whose file is gone reserves nothing.
  if (!attachmentId) return null;
  if (!attachment && !isLoading) return null;
  if (attachment && !isImageAttachment(attachment.mimeType)) return null;

  return (
    <div
      data-testid="item-cover"
      className={cn(
        "aspect-[16/9] max-h-44 w-full overflow-hidden rounded-t-lg bg-panel-tinted",
        muted && "opacity-65 saturate-50",
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
  );
}
