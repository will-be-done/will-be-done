import { useRef, useState } from "react";
import { Paperclip, Plus, X } from "lucide-react";
import {
  useAsyncDispatch,
  useAsyncSelector,
} from "@will-be-done/hyperdb/react";
import {
  type Attachment,
  type AttachmentParentType,
  type ItemAttachment,
  itemAttachments,
  removeItemAttachment,
} from "@will-be-done/slices/space";
import { attachmentUrl } from "@will-be-done/slices/common";
import { cn } from "@/lib/utils";
import { confirmDialog } from "@/components/ui/prompt-dialog-service";
import {
  formatFileSize,
  isImageAttachment,
  openAttachment,
  useAttachFiles,
  useAttachmentTransfers,
} from "./attachmentFiles";
import { AttachmentPreview } from "./AttachmentPreview";
import { AttachmentThumb } from "./AttachmentThumb";

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

// The description's editor parses the HTML into an inline attachment, so a
// drop lands where the pointer is.
function putAttachmentOnDrag(event: React.DragEvent, attachment: Attachment) {
  const src = attachmentUrl(attachment.id);
  event.dataTransfer.effectAllowed = "copy";
  event.dataTransfer.setData(
    "text/html",
    `<img src="${src}" alt="${escapeHtml(attachment.name)}">`,
  );
  event.dataTransfer.setData("text/plain", `![${attachment.name}](${src})`);
}

// Touch screens have no hover, so the button stays visible there.
const revealOnHover =
  "opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100";

function RemoveButton({
  name,
  onRemove,
  className,
}: {
  name: string;
  onRemove: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      title="Remove"
      aria-label={`Remove ${name}`}
      onClick={(event) => {
        event.stopPropagation();
        onRemove();
      }}
      className={cn("cursor-pointer", revealOnHover, className)}
    >
      <X className="h-3 w-3" />
    </button>
  );
}

export function ItemAttachments({
  parentType,
  parentId,
}: {
  parentType: AttachmentParentType;
  parentId: string;
}) {
  const dispatch = useAsyncDispatch();
  const transfers = useAttachmentTransfers();
  const attachFiles = useAttachFiles(parentType, parentId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewing, setPreviewing] = useState<Attachment | null>(null);
  const { data: rows } = useAsyncSelector({
    selector: itemAttachments,
    args: { parentType, parentId },
    defaultValue: [],
  });
  const images = rows.filter(({ attachment }) =>
    isImageAttachment(attachment.mimeType),
  );
  const files = rows.filter(
    ({ attachment }) => !isImageAttachment(attachment.mimeType),
  );

  const pickFiles = () => inputRef.current?.click();
  const remove = async (link: ItemAttachment, attachment: Attachment) => {
    const confirmed = await confirmDialog({
      title: "Remove file?",
      description: `“${attachment.name}” will be removed from this item and its description.`,
      confirmLabel: "Remove",
    });
    if (confirmed) void dispatch(removeItemAttachment({ id: link.id }));
  };

  return (
    <div data-testid="item-attachments" className="space-y-1.5">
      {rows.length === 0 ? (
        <button
          type="button"
          onClick={pickFiles}
          className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 text-content-tinted transition-colors hover:text-content"
        >
          <Paperclip className="h-3 w-3" />
          Attach file
        </button>
      ) : (
        <div className="flex items-center justify-between pl-1">
          <span className="text-xs font-medium text-content-tinted">
            Files
            <span className="ml-1.5 text-content-tinted/60 tabular-nums">
              {rows.length}
            </span>
          </span>
          <button
            type="button"
            title="Attach file"
            aria-label="Attach file"
            onClick={pickFiles}
            className="cursor-pointer rounded p-1 text-content-tinted transition-colors hover:bg-task-panel-hover hover:text-content"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {images.length > 0 && (
        <div className="grid grid-cols-4 gap-1.5">
          {images.map(({ link, attachment }) => (
            <div
              key={link.id}
              draggable
              title={attachment.name}
              onDragStart={(event) => putAttachmentOnDrag(event, attachment)}
              className="group relative aspect-square"
            >
              <button
                type="button"
                aria-label={`Open ${attachment.name}`}
                onClick={() => setPreviewing(attachment)}
                className="block h-full w-full cursor-zoom-in overflow-hidden rounded-md ring-1 ring-white/10 transition hover:ring-white/30"
              >
                <AttachmentThumb
                  attachment={attachment}
                  rememberSize
                  className="h-full w-full rounded-none"
                />
              </button>
              <RemoveButton
                name={attachment.name}
                onRemove={() => void remove(link, attachment)}
                className="absolute top-1 right-1 rounded-full bg-black/65 p-0.5 text-white/90 hover:bg-black/85 hover:text-white"
              />
            </div>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <div>
          {files.map(({ link, attachment }) => (
            <div
              key={link.id}
              draggable
              title={attachment.name}
              onDragStart={(event) => putAttachmentOnDrag(event, attachment)}
              className="group flex items-center gap-2 rounded-md px-1 py-1 transition-colors hover:bg-task-panel-hover"
            >
              <button
                type="button"
                onClick={() => void openAttachment(transfers, attachment)}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
              >
                <AttachmentThumb
                  attachment={attachment}
                  rememberSize
                  className="h-8 w-8"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-content">
                    {attachment.name}
                  </span>
                  <span className="block text-[10px] text-content-tinted">
                    {formatFileSize(attachment.size)}
                  </span>
                </span>
              </button>
              <RemoveButton
                name={attachment.name}
                onRemove={() => void remove(link, attachment)}
                className="rounded p-1 text-content-tinted hover:text-content"
              />
            </div>
          ))}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        multiple
        data-testid="attachment-input"
        className="hidden"
        onChange={(event) => {
          const picked = Array.from(event.target.files ?? []);
          event.target.value = "";
          void attachFiles(picked);
        }}
      />
      {previewing && (
        <AttachmentPreview
          attachment={previewing}
          parent={{ parentType, parentId }}
          onClose={() => setPreviewing(null)}
        />
      )}
    </div>
  );
}
