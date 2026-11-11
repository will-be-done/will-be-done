import { useRef, useState } from "react";
import { FileText, Paperclip, X } from "lucide-react";
import {
  useAsyncDispatch,
  useAsyncSelector,
} from "@will-be-done/hyperdb/react";
import {
  type Attachment,
  type AttachmentParentType,
  itemAttachments,
  removeItemAttachment,
} from "@will-be-done/slices/space";
import { attachmentUrl } from "@will-be-done/slices/common";
import { cn } from "@/lib/utils";
import {
  formatFileSize,
  isImageAttachment,
  openAttachment,
  useAttachFiles,
  useAttachmentTransfers,
  useAttachmentUrl,
} from "./attachmentFiles";
import { AttachmentPreview } from "./AttachmentPreview";

function AttachmentThumb({ attachment }: { attachment: Attachment }) {
  const image = isImageAttachment(attachment.mimeType);
  const url = useAttachmentUrl(image ? attachment.id : undefined);
  return url ? (
    <img src={url} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
  ) : (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-task-panel-hover">
      <FileText className="h-3.5 w-3.5" />
    </span>
  );
}

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
  const [dragging, setDragging] = useState(false);
  const [previewing, setPreviewing] = useState<Attachment | null>(null);
  const { data: rows = [] } = useAsyncSelector({
    selector: itemAttachments,
    args: { parentType, parentId },
    defaultValue: [],
  });

  const hasFiles = (event: React.DragEvent) =>
    event.dataTransfer.types.includes("Files");

  return (
    <div
      data-testid="item-attachments"
      className={cn(
        "space-y-1 rounded-md",
        dragging && "ring-1 ring-accent bg-task-panel-hover/40",
      )}
      onDragOver={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        setDragging(false);
        void attachFiles(Array.from(event.dataTransfer.files));
      }}
    >
      {rows.map(({ link, attachment }) => (
        <div
          key={link.id}
          draggable
          title="Drag into the description to place it inline"
          onDragStart={(event) => putAttachmentOnDrag(event, attachment)}
          className="group flex cursor-grab items-center gap-2 rounded px-1 py-0.5 hover:bg-task-panel-hover active:cursor-grabbing"
        >
          <button
            type="button"
            onClick={() =>
              isImageAttachment(attachment.mimeType)
                ? setPreviewing(attachment)
                : void openAttachment(transfers, attachment)
            }
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
          >
            <AttachmentThumb attachment={attachment} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-content">
                {attachment.name}
              </span>
              <span className="block text-[10px] text-content-tinted">
                {formatFileSize(attachment.size)}
              </span>
            </span>
          </button>
          <button
            type="button"
            title="Remove attachment"
            aria-label={`Remove ${attachment.name}`}
            onClick={() => void dispatch(removeItemAttachment({ id: link.id }))}
            className="cursor-pointer rounded p-0.5 text-content-tinted opacity-0 transition-opacity hover:text-content group-hover:opacity-100 focus-visible:opacity-100"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 text-content-tinted transition-colors hover:text-content"
      >
        <Paperclip className="h-3 w-3" />
        Attach file
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        data-testid="attachment-input"
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          void attachFiles(files);
        }}
      />
      {previewing && (
        <AttachmentPreview
          attachment={previewing}
          onClose={() => setPreviewing(null)}
        />
      )}
    </div>
  );
}
