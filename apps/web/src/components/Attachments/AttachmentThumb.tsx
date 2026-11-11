import type { Attachment } from "@will-be-done/slices/space";
import { cn } from "@/lib/utils";
import {
  fileExtension,
  isImageAttachment,
  useAttachmentUrl,
  useRememberImageSize,
} from "./attachmentFiles";

// An image's picture, or the file's extension as a badge. `rememberSize`
// stores the size of an image saved without one; Settings leaves it off, as a
// write to a file no item lists would restart its unused-file grace period.
export function AttachmentThumb({
  attachment,
  rememberSize: remember = false,
  className,
}: {
  attachment: Pick<Attachment, "id" | "name" | "mimeType" | "width">;
  rememberSize?: boolean;
  className?: string;
}) {
  const image = isImageAttachment(attachment.mimeType);
  const url = useAttachmentUrl(image ? attachment.id : undefined);
  const rememberSize = useRememberImageSize();
  return url ? (
    <img
      src={url}
      alt=""
      draggable={false}
      onLoad={(event) => {
        if (remember) rememberSize(attachment, event.currentTarget);
      }}
      className={cn("shrink-0 rounded object-cover", className)}
    />
  ) : (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded bg-white/10 text-[9px] font-semibold tracking-wide text-content-tinted uppercase",
        className,
      )}
    >
      {!image && (fileExtension(attachment.name)?.slice(0, 4) ?? "file")}
    </span>
  );
}
