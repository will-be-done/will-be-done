import { useEffect, useRef, useState } from "react";
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { useAsyncSelector } from "@will-be-done/hyperdb/react";
import {
  attachmentSiblings,
  itemAttachments,
  type Attachment,
  type AttachmentParentType,
} from "@will-be-done/slices/space";
import { useFocusStore } from "@/store/focusSlice";
import {
  downloadAttachment,
  formatFileSize,
  isImageAttachment,
  useAttachmentTransfers,
  useAttachmentUrl,
} from "./attachmentFiles";

const SWIPE_DISTANCE = 50;

const navButtonClass =
  "absolute top-1/2 z-10 -translate-y-1/2 cursor-pointer rounded-full bg-black/40 p-2.5 text-white/80 ring-1 ring-white/10 backdrop-blur transition-colors hover:bg-black/60 hover:text-white";

// Full-screen view of an image attachment that pages through the other images
// of its item: `parent` when known, else the first item listing the file.
// Clicking outside the image or pressing Escape closes it.
export function AttachmentPreview({
  attachment,
  parent,
  onClose,
}: {
  attachment: Attachment;
  parent?: { parentType: AttachmentParentType; parentId: string };
  onClose: () => void;
}) {
  const transfers = useAttachmentTransfers();
  const { data: listed } = useAsyncSelector({
    selector: itemAttachments,
    args: parent ?? { parentType: "task", parentId: "" },
    enabled: !!parent,
    defaultValue: [],
  });
  const { data: siblings } = useAsyncSelector({
    selector: attachmentSiblings,
    args: { attachmentId: attachment.id },
    enabled: !parent,
    defaultValue: [],
  });
  const files = parent ? listed.map((row) => row.attachment) : siblings;
  const images = files.filter((file) => isImageAttachment(file.mimeType));
  const gallery = images.some((file) => file.id === attachment.id)
    ? images
    : [attachment];
  const [currentId, setCurrentId] = useState(attachment.id);
  const index = Math.max(
    0,
    gallery.findIndex((file) => file.id === currentId),
  );
  const current = gallery[index] ?? attachment;
  const previous = gallery[index - 1];
  const next = gallery[index + 1];
  const url = useAttachmentUrl(current.id);
  // Reads the neighbours ahead so stepping shows them at once.
  useAttachmentUrl(previous?.id);
  useAttachmentUrl(next?.id);
  // One finger swipes; a second one makes it a pinch, which never pages.
  const swipe = useRef<{ id: number; x: number; y: number } | null>(null);
  const touches = useRef(new Set<number>());

  // Keeps arrows and Escape away from the lists behind the preview.
  useEffect(() => {
    useFocusStore.getState().disableFocus();
    return () => useFocusStore.getState().enableFocus();
  }, []);

  const show = (file: Attachment | undefined) => {
    if (file) setCurrentId(file.id);
  };

  // On the window: focus may still be in the editor that opened the preview.
  useEffect(() => {
    const step = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      event.stopPropagation();
      const target = event.key === "ArrowLeft" ? previous : next;
      if (target) setCurrentId(target.id);
    };
    window.addEventListener("keydown", step, true);
    return () => window.removeEventListener("keydown", step, true);
  }, [previous, next]);

  return (
    <Dialog open onClose={onClose} className="relative z-[1100]">
      <div className="fixed inset-0 bg-black/90" aria-hidden="true" />
      <DialogPanel
        data-testid="attachment-preview"
        className="fixed inset-0 flex flex-col"
        onClick={onClose}
      >
        <div className="flex shrink-0 items-center justify-between p-3">
          <span className="px-2 text-sm text-white/60 tabular-nums">
            {gallery.length > 1 && `${index + 1} / ${gallery.length}`}
          </span>
          <button
            type="button"
            aria-label="Close preview"
            onClick={onClose}
            className="cursor-pointer rounded-lg p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div
          className="relative flex min-h-0 flex-1 touch-pan-y touch-pinch-zoom items-center justify-center px-4 sm:px-16"
          onPointerDown={(event) => {
            if (event.pointerType === "mouse") return;
            touches.current.add(event.pointerId);
            swipe.current =
              touches.current.size === 1
                ? { id: event.pointerId, x: event.clientX, y: event.clientY }
                : null;
          }}
          onPointerCancel={(event) => {
            touches.current.delete(event.pointerId);
            swipe.current = null;
          }}
          onPointerUp={(event) => {
            touches.current.delete(event.pointerId);
            const start = swipe.current;
            if (start?.id !== event.pointerId) return;
            swipe.current = null;
            const dx = event.clientX - start.x;
            const dy = event.clientY - start.y;
            if (Math.abs(dx) < SWIPE_DISTANCE || Math.abs(dx) < Math.abs(dy)) {
              return;
            }
            show(dx < 0 ? next : previous);
          }}
        >
          {previous && (
            <button
              type="button"
              aria-label="Previous image"
              onClick={(event) => {
                event.stopPropagation();
                show(previous);
              }}
              className={`${navButtonClass} left-3 hidden sm:block`}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          {url ? (
            <img
              key={current.id}
              src={url}
              alt={current.name}
              draggable={false}
              onClick={(event) => event.stopPropagation()}
              className="max-h-full max-w-full rounded object-contain select-none"
            />
          ) : (
            <span className="aspect-square w-64 max-w-full rounded bg-white/10" />
          )}
          {next && (
            <button
              type="button"
              aria-label="Next image"
              onClick={(event) => {
                event.stopPropagation();
                show(next);
              }}
              className={`${navButtonClass} right-3 hidden sm:block`}
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}
        </div>
        <div
          className="flex shrink-0 items-center justify-center gap-4 p-4"
          onClick={(event) => event.stopPropagation()}
        >
          <DialogTitle className="min-w-0 truncate text-sm text-white/80">
            {current.name}
            <span className="ml-2 text-white/50">
              {formatFileSize(current.size)}
            </span>
          </DialogTitle>
          <button
            type="button"
            onClick={() => void downloadAttachment(transfers, current)}
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
