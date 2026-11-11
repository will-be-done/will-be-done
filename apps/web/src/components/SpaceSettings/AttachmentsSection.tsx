import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { Trash2 } from "lucide-react";
import {
  useAsyncDispatch,
  useAsyncSelector,
} from "@will-be-done/hyperdb/react";
import {
  allAttachments,
  attachmentsPage,
  attachmentUsages,
  deleteAttachments,
  type Attachment,
  type AttachmentUsage,
} from "@will-be-done/slices/space";
import { Route } from "@/routes/spaces.$spaceId";
import {
  formatFileSize,
  isImageAttachment,
  openAttachment,
  useAttachmentTransfers,
  useAttachmentUrl,
} from "@/components/Attachments/attachmentFiles";
import { AttachmentPreview } from "@/components/Attachments/AttachmentPreview";
import { cn } from "@/lib/utils";
import { settingsButtonClass } from "./SettingsUI";

const PAGE_SIZE = 50;

const usageLabel = (usage: AttachmentUsage) =>
  usage.title.trim() ||
  (usage.parentType === "note"
    ? "Untitled note"
    : usage.parentType === "template"
      ? "Untitled template"
      : "Untitled task");

function Thumb({
  id,
  name,
  mimeType,
}: {
  id: string;
  name: string;
  mimeType: string;
}) {
  const extension = name.includes(".") ? name.split(".").pop() : undefined;
  const url = useAttachmentUrl(isImageAttachment(mimeType) ? id : undefined);
  return url ? (
    <img src={url} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
  ) : (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-white/5 text-[10px] uppercase text-content-tinted">
      {extension?.slice(0, 4) || "file"}
    </span>
  );
}

export function AttachmentsSection() {
  const { spaceId } = Route.useParams();
  const dispatch = useAsyncDispatch();
  const transfers = useAttachmentTransfers();
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [previewing, setPreviewing] = useState<Attachment | null>(null);
  const open = (file: Attachment) =>
    isImageAttachment(file.mimeType)
      ? setPreviewing(file)
      : void openAttachment(transfers, file);
  const { data: page } = useAsyncSelector({
    selector: attachmentsPage,
    args: { limit },
  });
  const files = page?.attachments ?? [];
  const { data: usages = {} } = useAsyncSelector({
    selector: attachmentUsages,
    args: { attachmentIds: files.map(({ id }) => id) },
    defaultValue: {},
  });
  // The library is local, so the total is a plain sum over the space's files.
  const { data: all = [] } = useAsyncSelector({
    selector: allAttachments,
    args: {},
    defaultValue: [],
  });
  const totalSize = all.reduce((sum, file) => sum + file.size, 0);

  return (
    <section className="flex flex-col gap-3">
      <p className="px-1 text-[13px] leading-relaxed text-content-tinted/60">
        {all.length === 0
          ? "Files you attach to tasks, templates, and notes appear here."
          : `${all.length} ${all.length === 1 ? "file" : "files"} · ${formatFileSize(totalSize)}`}
      </p>

      {files.length > 0 && (
        <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-2xl bg-white/[0.025] ring-1 ring-white/[0.07]">
          {files.map((file) => {
            const fileUsages = usages[file.id] ?? [];
            return (
              <li
                key={file.id}
                data-testid="attachment-row"
                className="flex items-start gap-3 px-5 py-4"
              >
                <button
                  type="button"
                  className="cursor-pointer"
                  onClick={() => open(file)}
                  aria-label={`Open ${file.name}`}
                >
                  <Thumb
                    id={file.id}
                    name={file.name}
                    mimeType={file.mimeType}
                  />
                </button>
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => open(file)}
                    className="block max-w-full cursor-pointer truncate text-left text-[14px] font-medium text-content hover:underline"
                  >
                    {file.name}
                  </button>
                  <p className="text-[12px] text-content-tinted/60">
                    {formatFileSize(file.size)} ·{" "}
                    {format(file.createdAt, "MMM d, yyyy")}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[12px]">
                    {fileUsages.length === 0 && (
                      <span className="text-content-tinted/70">Unused</span>
                    )}
                    {fileUsages.map((usage) =>
                      usage.parentType === "background" ? (
                        <span
                          key={`background:${usage.parentId}`}
                          className="text-content-tinted"
                        >
                          Background
                        </span>
                      ) : usage.trashed ? (
                        <Link
                          key={`trash:${usage.parentId}`}
                          to="/spaces/$spaceId/trash"
                          params={{ spaceId }}
                          className="text-content-tinted hover:underline"
                        >
                          In trash
                        </Link>
                      ) : (
                        <Link
                          key={`${usage.parentType}:${usage.parentId}`}
                          to="/spaces/$spaceId/item-details/$itemId"
                          params={{ spaceId, itemId: usage.parentId }}
                          className="max-w-[200px] truncate text-accent hover:underline"
                        >
                          {usageLabel(usage)}
                        </Link>
                      ),
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  title="Delete file"
                  aria-label={`Delete ${file.name}`}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Delete ${file.name}? It is removed from every item that uses it.`,
                      )
                    ) {
                      void dispatch(deleteAttachments({ ids: [file.id] }));
                    }
                  }}
                  className="cursor-pointer rounded-lg p-1.5 text-content-tinted/60 transition-colors hover:bg-white/8 hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {previewing && (
        <AttachmentPreview
          attachment={previewing}
          onClose={() => setPreviewing(null)}
        />
      )}

      {page?.hasMore && (
        <button
          type="button"
          onClick={() => setLimit((current) => current + PAGE_SIZE)}
          className={cn(settingsButtonClass, "self-center")}
        >
          Show more
        </button>
      )}
    </section>
  );
}
