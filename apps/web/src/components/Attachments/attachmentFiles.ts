import { useCallback, useEffect, useState } from "react";
import { useDB } from "@will-be-done/hyperdb/react";
import type {
  Attachment,
  AttachmentParentType,
} from "@will-be-done/slices/space";
import { toast } from "sonner";
import { attachmentTransfersByDB } from "@/store/attachments/transfers";

// Opening other types from a blob URL would run them on the app's origin.
const INLINE_TYPES =
  /^(image\/(png|jpeg|gif|webp|avif|bmp)|application\/pdf|text\/plain|audio\/[\w.+-]+|video\/[\w.+-]+)$/;

export const isImageAttachment = (mimeType: string) =>
  /^image\/(png|jpeg|gif|webp|avif|bmp|svg\+xml)$/.test(mimeType);

export const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export function useAttachmentTransfers() {
  return attachmentTransfersByDB.get(useDB());
}

// An object URL for the file once it is on this device; asks for it first in
// the download queue when it is not.
export function useAttachmentUrl(id: string | undefined) {
  const transfers = useAttachmentTransfers();
  const [state, setState] = useState<{ id: string; url: string }>();

  useEffect(() => {
    if (!transfers || !id) return;
    let cancelled = false;
    let url: string | undefined;
    const load = async () => {
      const blob = await transfers.getBlob(id);
      if (cancelled || !blob) return;
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(blob);
      setState({ id, url });
    };
    void load();
    const unsubscribe = transfers.subscribeBlob(id, () => void load());
    return () => {
      cancelled = true;
      unsubscribe();
      if (url) URL.revokeObjectURL(url);
    };
  }, [id, transfers]);

  return state && state.id === id ? state.url : undefined;
}

async function attachmentBlob(
  transfers: ReturnType<typeof useAttachmentTransfers>,
  attachment: Attachment,
) {
  const blob = await transfers?.getBlob(attachment.id);
  if (!blob) toast(`${attachment.name} is still downloading`);
  return blob;
}

// The opened tab or download has its own reference by then.
const revokeLater = (url: string) =>
  setTimeout(() => URL.revokeObjectURL(url), 60_000);

export async function downloadAttachment(
  transfers: ReturnType<typeof useAttachmentTransfers>,
  attachment: Attachment,
) {
  const blob = await attachmentBlob(transfers, attachment);
  if (!blob) return;
  const url = URL.createObjectURL(
    new Blob([blob], { type: "application/octet-stream" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = attachment.name;
  link.click();
  revokeLater(url);
}

export async function openAttachment(
  transfers: ReturnType<typeof useAttachmentTransfers>,
  attachment: Attachment,
) {
  if (!INLINE_TYPES.test(attachment.mimeType)) {
    await downloadAttachment(transfers, attachment);
    return;
  }
  const blob = await attachmentBlob(transfers, attachment);
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener");
  revokeLater(url);
}

export function useAttachFiles(
  parentType: AttachmentParentType,
  parentId: string,
) {
  const transfers = useAttachmentTransfers();
  return useCallback(
    async (files: File[]) => {
      if (!transfers) return [];
      const added: Attachment[] = [];
      for (const file of files) {
        try {
          added.push(await transfers.add(file, { parentType, parentId }));
        } catch (error) {
          toast(
            error instanceof Error
              ? error.message
              : `Couldn't attach ${file.name}`,
          );
        }
      }
      return added;
    },
    [parentId, parentType, transfers],
  );
}
