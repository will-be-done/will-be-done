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

export function SyncIndicator() {
  const db = useDB();
  const store = syncStatusByDB.get(db);
  const status = useSyncExternalStore(
    (listener) => store?.subscribe(listener) ?? (() => {}),
    () => store?.get() ?? initialSyncStatus,
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
  const syncing = !disconnected && phase !== "synced";
  const label = !online ? "Offline" : phaseLabels[phase];
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
          className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md hover:bg-content/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span
            aria-hidden="true"
            className={cn(
              "size-2 rounded-full",
              disconnected
                ? "bg-red-500"
                : syncing
                  ? "bg-yellow-400 motion-safe:animate-pulse"
                  : "bg-emerald-500",
            )}
          />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={8}
        className="w-64 rounded-lg bg-task-dropdown p-3 text-left text-content shadow-lg ring-1 ring-white/10 [&>svg]:hidden"
      >
        <p className="text-[12px] font-medium">{label}</p>
        <p className="mt-1 text-[11px] leading-relaxed text-content-tinted">
          {!online
            ? "Changes stay on this device and will sync when you reconnect."
            : phase === "update-required"
              ? "Update the app to resume syncing."
              : phase === "error"
                ? status.error
                : phase === "synced"
                  ? "This space is up to date on the server."
                  : "Your changes are saved on this device while sync finishes."}
        </p>
        {progress && (
          <div className="mt-3">
            <div className="mb-1.5 flex justify-between text-[11px] text-content-tinted tabular-nums">
              <span>Transfer progress</span>
              <span>
                {progress.completed} / {progress.total} batches
              </span>
            </div>
            <div
              role="progressbar"
              aria-label={phaseLabels[phase]}
              aria-valuemin={0}
              aria-valuemax={progress.total}
              aria-valuenow={progress.completed}
              className="h-1 overflow-hidden rounded-full bg-content/10"
            >
              <div
                className="h-full rounded-full bg-yellow-400 motion-safe:transition-[width]"
                style={{
                  width: `${(progress.completed / progress.total) * 100}%`,
                }}
              />
            </div>
          </div>
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
