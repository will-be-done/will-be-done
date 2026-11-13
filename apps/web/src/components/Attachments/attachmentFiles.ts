import { useCallback, useEffect, useReducer } from "react";
import { useAsyncDispatch, useDB } from "@will-be-done/hyperdb/react";
import {
  INLINE_ATTACHMENT_TYPE,
  isImageAttachmentType,
  setAttachmentImageSize,
  type Attachment,
  type AttachmentParentType,
} from "@will-be-done/slices/space";
import { Cause, Effect, Option, Predicate } from "effect";
import { toast } from "sonner";
import { attachmentTransfersByDB } from "@/store/attachments/transfers";

export const isImageAttachment = isImageAttachmentType;

export const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export const fileExtension = (name: string) => {
  const dot = name.lastIndexOf(".");
  return dot > 0 && dot < name.length - 1
    ? name.slice(dot + 1).toLowerCase()
    : undefined;
};

// Keeps a short extension, so "meeting notes.txt" becomes "meetin….txt".
export const shortFileName = (name: string, max = 10) => {
  if (name.length <= max) return name;
  const extension = fileExtension(name);
  const suffix =
    extension && extension.length <= 4 ? name.slice(-extension.length - 1) : "";
  return `${name.slice(0, Math.max(1, max - suffix.length))}…${suffix}`;
};

export function useAttachmentTransfers() {
  return attachmentTransfersByDB.get(useDB());
}

type AttachmentTransfers = NonNullable<
  ReturnType<typeof useAttachmentTransfers>
>;

type UrlEntry = {
  url: string | undefined;
  listeners: Set<() => void>;
  loading: boolean;
  disposed: boolean;
  load: () => void;
  dispose: () => void;
};

// Reading bytes is async, so unused URLs are kept and a file shown again is
// on its first frame. Bounded: bytes read from the server while browser
// storage is full live in memory.
const MAX_IDLE_URLS = 100;
// Least recently used first.
const idleUrls = new Set<UrlEntry>();
const urlEntries = new WeakMap<AttachmentTransfers, Map<string, UrlEntry>>();

const markIdle = (entry: UrlEntry) => {
  idleUrls.delete(entry);
  idleUrls.add(entry);
  for (const oldest of idleUrls) {
    if (idleUrls.size <= MAX_IDLE_URLS) break;
    idleUrls.delete(oldest);
    oldest.dispose();
  }
};

function urlEntry(transfers: AttachmentTransfers, id: string) {
  let entries = urlEntries.get(transfers);
  if (!entries) {
    entries = new Map();
    urlEntries.set(transfers, entries);
  }
  const existing = entries.get(id);
  if (existing) return existing;

  const entry: UrlEntry = {
    url: undefined,
    listeners: new Set(),
    loading: false,
    disposed: false,
    load: () => {
      entry.loading = true;
      void Effect.runPromise(
        transfers.getBlob(id).pipe(
          Effect.map((blob) => {
            if (entry.disposed || !blob) return;
            if (entry.url) URL.revokeObjectURL(entry.url);
            entry.url = URL.createObjectURL(blob);
            for (const listener of entry.listeners) listener();
          }),
          Effect.catchCause((cause) =>
            Effect.logError(`Could not read attachment ${id}`, cause),
          ),
          Effect.ensuring(Effect.sync(() => (entry.loading = false))),
        ),
      );
    },
    dispose: () => {
      entry.disposed = true;
      unsubscribe();
      if (entry.url) URL.revokeObjectURL(entry.url);
      entries.delete(id);
    },
  };
  const unsubscribe = transfers.subscribeBlob(id, entry.load);
  entries.set(id, entry);
  // Covers a render that never commits.
  markIdle(entry);
  entry.load();
  return entry;
}

// An object URL for the file once it is on this device; asks for it first in
// the download queue when it is not.
export function useAttachmentUrl(id: string | undefined) {
  const transfers = useAttachmentTransfers();
  const entry = transfers && id ? urlEntry(transfers, id) : undefined;
  const url = entry?.url;
  const [, rerender] = useReducer((count: number) => count + 1, 0);

  // useSyncExternalStore updates got stuck inside tiptap node views.
  useEffect(() => {
    if (!entry) return;
    // Evicted between render and commit, as when many files mount at once.
    if (entry.disposed) {
      rerender();
      return;
    }
    idleUrls.delete(entry);
    entry.listeners.add(rerender);
    if (entry.url !== url) rerender();
    // A read that found nothing, such as a download that failed, tries again
    // each time the file is shown.
    else if (!entry.url && !entry.loading) entry.load();
    return () => {
      entry.listeners.delete(rerender);
      if (entry.listeners.size === 0 && !entry.disposed) markIdle(entry);
    };
  }, [entry, url]);

  return url;
}

// For an <img> onLoad: stores the size of an image saved without one.
export function useRememberImageSize() {
  const dispatch = useAsyncDispatch();
  return (
    attachment: Pick<Attachment, "id" | "width">,
    image: HTMLImageElement,
  ) => {
    if (attachment.width !== undefined || !image.naturalWidth) return;
    void dispatch(
      setAttachmentImageSize({
        id: attachment.id,
        width: image.naturalWidth,
        height: image.naturalHeight,
      }),
    );
  };
}

async function attachmentBlob(
  transfers: ReturnType<typeof useAttachmentTransfers>,
  attachment: Attachment,
) {
  const blob = transfers
    ? await Effect.runPromise(
        transfers
          .getBlob(attachment.id)
          .pipe(Effect.orElseSucceed(() => undefined)),
      )
    : undefined;
  if (!blob) toast(`${attachment.name} is still downloading`);
  return blob;
}

// The download has its own reference by then.
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

// A blob: URL carries no name, so the file opens in a page of its own that
// is titled with the name and downloads under it.
function showInTab(tab: Window, blob: Blob, name: string) {
  const doc = tab.document;
  doc.title = name;
  // Created in the tab, so it lives exactly as long as the tab.
  const url = (tab as Window & typeof globalThis).URL.createObjectURL(blob);
  doc.body.style.cssText =
    "margin:0;height:100vh;display:flex;flex-direction:column;background:#0f1115;color:#e5e7eb;font:13px system-ui,sans-serif";
  const bar = doc.createElement("div");
  bar.style.cssText =
    "display:flex;align-items:center;gap:12px;padding:8px 12px;border-bottom:1px solid #262a33";
  const label = doc.createElement("span");
  label.textContent = name;
  label.style.cssText =
    "flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500";
  const download = doc.createElement("a");
  download.href = url;
  download.download = name;
  download.textContent = "Download";
  download.style.cssText =
    "color:#fff;text-decoration:none;padding:5px 10px;border-radius:6px;background:#ffffff1a";
  const frame = doc.createElement("iframe");
  frame.src = url;
  frame.title = name;
  frame.style.cssText = "flex:1;width:100%;border:0;background:#fff";
  bar.append(label, download);
  doc.body.replaceChildren(bar, frame);
}

// Resolves once the file is on this device, asking for it first in the
// download queue; undefined when `wanted` turns false before then.
const blobWhenStored = (
  transfers: AttachmentTransfers,
  id: string,
  wanted: () => boolean,
) =>
  new Promise<Blob | undefined>((resolve) => {
    const read = () =>
      void Effect.runPromise(
        transfers.getBlob(id).pipe(Effect.orElseSucceed(() => undefined)),
      ).then((blob) => {
        if (!blob && wanted()) return;
        unsubscribe();
        resolve(blob);
      });
    const unsubscribe = transfers.subscribeBlob(id, read);
    read();
  });

// Phones only show a PDF's first page, or none, inside a frame.
const framesFiles = () => !window.matchMedia("(pointer: coarse)").matches;

export async function openAttachment(
  transfers: ReturnType<typeof useAttachmentTransfers>,
  attachment: Attachment,
) {
  // The desktop shell hands new windows to the system browser, which cannot
  // read this page's blob URLs.
  if (
    !transfers ||
    !INLINE_ATTACHMENT_TYPE.test(attachment.mimeType) ||
    window.desktopApi
  ) {
    await downloadAttachment(transfers, attachment);
    return;
  }
  // Opened before reading the file so popup blockers see the click.
  const tab = window.open("", "_blank");
  if (!tab) {
    await downloadAttachment(transfers, attachment);
    return;
  }
  tab.opener = null;
  tab.document.title = attachment.name;
  tab.document.body.style.cssText =
    "margin:0;padding:16px;background:#0f1115;color:#9ca3af;font:13px system-ui,sans-serif";
  tab.document.body.textContent = `Downloading ${attachment.name}…`;
  const stored = await blobWhenStored(
    transfers,
    attachment.id,
    () => !tab.closed,
  );
  if (!stored || tab.closed) return;
  // The row's type passed the inline check; the stored bytes' type may not,
  // as when a restored backup pairs them with another row.
  const blob = new Blob([stored], { type: attachment.mimeType });
  if (framesFiles()) {
    showInTab(tab, blob, attachment.name);
    return;
  }
  const url = URL.createObjectURL(blob);
  tab.location.href = url;
  revokeLater(url);
}

export function useAttachFiles(
  parentType: AttachmentParentType,
  parentId: string,
) {
  const transfers = useAttachmentTransfers();
  return useCallback(
    (files: File[]) =>
      attachFilesToItem(transfers, parentType, parentId, files),
    [parentId, parentType, transfers],
  );
}

export async function attachFilesToItem(
  transfers: ReturnType<typeof useAttachmentTransfers>,
  parentType: AttachmentParentType,
  parentId: string,
  files: File[],
) {
  if (!transfers) return [];
  const added = await Effect.runPromise(
    Effect.forEach(files, (file) =>
      transfers.add(file, { parentType, parentId }).pipe(
        Effect.tapCause((cause) =>
          Effect.sync(() => {
            const error = Option.getOrUndefined(Cause.findErrorOption(cause));
            if (error?._tag === "AttachmentTooLargeError") {
              toast(error.message);
              return;
            }
            toast(`Couldn't attach ${file.name}`);
            console.error(`Couldn't attach ${file.name}`, cause);
          }),
        ),
        Effect.catchCause(() => Effect.succeed(undefined)),
      ),
    ),
  );
  return added.filter(Predicate.isNotUndefined);
}
