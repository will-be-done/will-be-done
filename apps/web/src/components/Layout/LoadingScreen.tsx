import { useSyncExternalStore, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { useDB } from "@will-be-done/hyperdb/react";
import { initialSyncStatus, phaseLabels, syncByDB } from "@/store/syncStatus";
import { ProgressBar } from "@/components/Sidebar/SyncIndicator";

export function LoadingScreen({
  label,
  children,
}: {
  label: string;
  children?: ReactNode;
}) {
  return (
    <div className="relative flex h-screen w-full items-center justify-center bg-surface px-4 text-content antialiased">
      <div className="absolute inset-x-0 top-0 h-10 [app-region:drag]" />
      <div
        role="status"
        aria-live="polite"
        className="flex w-full max-w-64 flex-col items-center text-center"
      >
        {/* A transform animation keeps spinning while a long transaction blocks the main thread. */}
        <LoaderCircle
          aria-hidden="true"
          className="size-6 animate-spin text-content-tinted"
        />
        <p className="mt-4 text-[13px] font-medium">{label}</p>
        {children}
      </div>
    </div>
  );
}

const noop = () => {};

// Holds the page back until a database that never synced on this device has
// finished, or failed, its first sync.
export function InitialSyncGate({
  children,
  showProgress,
}: {
  children: ReactNode;
  showProgress?: boolean;
}) {
  const sync = syncByDB.get(useDB());
  const pending = useSyncExternalStore(
    (listener) => sync?.initialSync.subscribe(listener) ?? noop,
    () => sync?.initialSync.get() ?? false,
  );
  const status = useSyncExternalStore(
    (listener) => sync?.status.subscribe(listener) ?? noop,
    () => sync?.status.get() ?? initialSyncStatus,
  );

  if (!pending) return children;
  if (!showProgress) return <LoadingScreen label="Loading" />;

  const applying = status.phase === "applying";
  const progress = status.progress?.total ? status.progress : null;

  return (
    <LoadingScreen
      label={applying ? "Saving and indexing data" : phaseLabels[status.phase]}
    >
      <p className="mt-1 text-[11px] leading-relaxed text-content-tinted">
        {applying
          ? "The page may stop responding for a moment while this finishes."
          : "Syncing this space to this device for the first time."}
      </p>
      {progress && (
        <div className="w-full">
          <ProgressBar
            label="Transfer progress"
            detail={`${progress.completed} / ${progress.total} batches`}
            value={progress.completed}
            max={progress.total}
          />
        </div>
      )}
    </LoadingScreen>
  );
}
