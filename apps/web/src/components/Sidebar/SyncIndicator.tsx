import { useEffect, useState, useSyncExternalStore } from "react";
import { useDB } from "@will-be-done/hyperdb/react";
import { formatDistance } from "date-fns";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  initialSyncStatus,
  syncStatusByDB,
  type SyncPhase,
} from "@/store/syncStatus";
import {
  getSyncUpdateRequired,
  subscribeSyncUpdateRequired,
} from "@/store/syncCompatibility";
import {
  attachmentTransfersByDB,
  idleTransferStatus,
  type TransferProgress,
} from "@/store/attachments/transfers";
import { formatFileSize } from "@/components/Attachments/attachmentFiles";

const phaseLabels: Record<SyncPhase, string> = {
  waiting: "Waiting to sync",
  connecting: "Connecting to server",
  preparing: "Preparing changes",
  uploading: "Sending changes",
  committing: "Saving changes on server",
  downloading: "Receiving changes",
  applying: "Applying changes",
  synced: "All changes synced",
  error: "Sync interrupted",
  "update-required": "Update required",
};

function ProgressBar({
  label,
  detail,
  value,
  max,
}: {
  label: string;
  detail: string;
  value: number;
  max: number;
}) {
  return (
    <div className="mt-3">
      <div className="mb-1.5 flex justify-between gap-2 text-[11px] text-content-tinted tabular-nums">
        <span>{label}</span>
        <span>{detail}</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        className="h-1 overflow-hidden rounded-full bg-content/10"
      >
        <div
          className="h-full rounded-full bg-yellow-400 motion-safe:transition-[width]"
          style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }}
        />
      </div>
    </div>
  );
}

const fileTransferLabel = (verb: string, { files }: TransferProgress) =>
  `${verb} ${files} ${files === 1 ? "file" : "files"}`;

function SyncingDot() {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 3_000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-2 rounded-full",
        slow ? "bg-yellow-400" : "bg-emerald-500",
      )}
    />
  );
}

export function SyncIndicator() {
  const db = useDB();
  const store = syncStatusByDB.get(db);
  const status = useSyncExternalStore(
    (listener) => store?.subscribe(listener) ?? (() => {}),
    () => store?.get() ?? initialSyncStatus,
  );
  const transfers = attachmentTransfersByDB.get(db);
  const transferStatus = useSyncExternalStore(
    (listener) => transfers?.status.subscribe(listener) ?? (() => {}),
    () => transfers?.status.get() ?? idleTransferStatus,
  );
  const updateRequired = useSyncExternalStore(
    subscribeSyncUpdateRequired,
    getSyncUpdateRequired,
  );
  const [online, setOnline] = useState(() => navigator.onLine);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(Date.now);
  const changeOpen = (nextOpen: boolean) => {
    setNow(Date.now());
    setOpen(nextOpen);
  };

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, [open]);

  // The demo has no server sync, so it must not claim to be synced.
  if (!store) return null;

  const phase = updateRequired ? "update-required" : status.phase;
  const disconnected =
    !online || phase === "error" || phase === "update-required";
  const { uploading, downloading } = transferStatus;
  const transferring = uploading.files + downloading.files > 0;
  const syncing = !disconnected && (phase !== "synced" || transferring);
  const label = !online
    ? "Offline"
    : phase === "synced" && transferring
      ? "Transferring files"
      : phaseLabels[phase];
  const progress =
    !disconnected && status.progress?.total ? status.progress : null;

  return (
    <Tooltip open={open} onOpenChange={changeOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`Sync status: ${label}`}
          data-sync-state={
            disconnected ? "disconnected" : syncing ? "syncing" : "synced"
          }
          onClick={(event) => {
            event.preventDefault();
            changeOpen(true);
          }}
          className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {syncing ? (
            <SyncingDot />
          ) : (
            <span
              aria-hidden="true"
              className={cn(
                "size-2 rounded-full",
                disconnected ? "bg-red-500" : "bg-emerald-500",
              )}
            />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={8}
        collisionPadding={12}
        hideArrow
        className="w-64 rounded-lg bg-task-dropdown p-3 text-left text-content shadow-lg ring-1 ring-white/10"
      >
        <p className="text-[12px] font-medium">{label}</p>
        <p className="mt-1 text-[11px] leading-relaxed text-content-tinted">
          {!online
            ? "Changes stay on this device and will sync when you reconnect."
            : phase === "update-required"
              ? "Update the app to resume syncing."
              : phase === "error"
                ? status.error
                : phase === "synced" && !transferring
                  ? "This space is up to date on the server."
                  : "Your changes are saved on this device while sync finishes."}
        </p>
        {progress && (
          <ProgressBar
            label="Transfer progress"
            detail={`${progress.completed} / ${progress.total} batches`}
            value={progress.completed}
            max={progress.total}
          />
        )}
        {uploading.files > 0 && (
          <ProgressBar
            label={fileTransferLabel("Uploading", uploading)}
            detail={`${formatFileSize(uploading.bytesDone)} / ${formatFileSize(uploading.bytesTotal)}`}
            value={uploading.bytesDone}
            max={uploading.bytesTotal}
          />
        )}
        {downloading.files > 0 && (
          <ProgressBar
            label={fileTransferLabel("Downloading", downloading)}
            detail={`${formatFileSize(downloading.bytesDone)} / ${formatFileSize(downloading.bytesTotal)}`}
            value={downloading.bytesDone}
            max={downloading.bytesTotal}
          />
        )}
        {transferStatus.error && (
          <p className="mt-2 text-[11px] leading-relaxed text-amber-400/90">
            {transferStatus.error}
          </p>
        )}
        <div className="mt-3 border-t border-white/10 pt-2 text-[11px]">
          <span className="text-content-tinted">Last successful sync</span>
          {status.lastSyncedAt ? (
            <time
              dateTime={new Date(status.lastSyncedAt).toISOString()}
              className="mt-0.5 block"
            >
              {formatDistance(
                status.lastSyncedAt,
                Math.max(now, status.lastSyncedAt),
                { addSuffix: true },
              )}
              <span className="mt-0.5 block text-content-tinted">
                {new Date(status.lastSyncedAt).toLocaleString()}
              </span>
            </time>
          ) : (
            <span className="mt-0.5 block">Not yet in this session</span>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
