import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { Download, X } from "lucide-react";
import type { Attachment } from "@will-be-done/slices/space";
import {
  downloadAttachment,
  formatFileSize,
  useAttachmentTransfers,
  useAttachmentUrl,
} from "./attachmentFiles";

// Full-screen view of an image attachment. Clicking outside the image or
// pressing Escape closes it.
export function AttachmentPreview({
  attachment,
  onClose,
}: {
  attachment: Attachment;
  onClose: () => void;
}) {
  const transfers = useAttachmentTransfers();
  const url = useAttachmentUrl(attachment.id);

  return (
    <Dialog open onClose={onClose} className="relative z-[1100]">
      <div className="fixed inset-0 bg-black/90" aria-hidden="true" />
      <DialogPanel
        data-testid="attachment-preview"
        className="fixed inset-0 flex flex-col"
        onClick={onClose}
      >
        <div className="flex shrink-0 justify-end p-3">
          <button
            type="button"
            aria-label="Close preview"
            onClick={onClose}
            className="cursor-pointer rounded-lg p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center px-4">
          {url ? (
            <img
              src={url}
              alt={attachment.name}
              onClick={(event) => event.stopPropagation()}
              className="max-h-full max-w-full rounded object-contain"
            />
          ) : (
            <span className="text-sm text-white/60">Downloading…</span>
          )}
        </div>
        <div
          className="flex shrink-0 items-center justify-center gap-4 p-4"
          onClick={(event) => event.stopPropagation()}
        >
          <DialogTitle className="min-w-0 truncate text-sm text-white/80">
            {attachment.name}
            <span className="ml-2 text-white/50">
              {formatFileSize(attachment.size)}
            </span>
          </DialogTitle>
          <button
            type="button"
            onClick={() => void downloadAttachment(transfers, attachment)}
            className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-[13px] font-medium text-white ring-1 ring-white/15 transition-colors hover:bg-white/15"
          >
            <Download className="h-4 w-4" />
            Download
          </button>
        </div>
      </DialogPanel>
    </Dialog>
  );
}
