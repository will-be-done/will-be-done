import { useEffect, useState, useSyncExternalStore } from "react";
import { Alert, Pressable, View } from "react-native";
import { useDB } from "@will-be-done/hyperdb/react";
import {
  getSyncUpdateRequired,
  initialSyncStatus,
  subscribeSyncUpdateRequired,
  syncStatusByDB,
  type SyncPhase,
} from "@will-be-done/client/sync";
import { formatDistance } from "date-fns";
import { cx } from "@/lib/cx";

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

// Same states as the web sidebar dot: green synced, green→yellow while
// syncing, red when sync stopped.
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

  const phase = updateRequired ? "update-required" : status.phase;
  const disconnected = phase === "error" || phase === "update-required";
  const syncing = !disconnected && phase !== "synced";

  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    if (!syncing) return;
    const timer = setTimeout(() => setSlow(true), 3_000);
    return () => clearTimeout(timer);
  }, [syncing]);

  if (!store) return null;

  const showDetails = () => {
    const description =
      phase === "update-required"
        ? "Update the app to resume syncing."
        : phase === "error"
          ? (status.error ?? "")
          : phase === "synced"
            ? "This space is up to date on the server."
            : "Your changes are saved on this device while sync finishes.";
    const lastSynced = status.lastSyncedAt
      ? formatDistance(status.lastSyncedAt, Date.now(), { addSuffix: true })
      : "Not yet";
    Alert.alert(
      phaseLabels[phase],
      `${description}\n\nLast successful sync: ${lastSynced}`,
    );
  };

  return (
    <Pressable
      accessibilityLabel={`Sync status: ${phaseLabels[phase]}`}
      onPress={showDetails}
      hitSlop={10}
      className="size-6 items-center justify-center"
    >
      <View
        className={cx(
          "size-2 rounded-full",
          disconnected
            ? "bg-red-500"
            : syncing && slow
              ? "bg-yellow-400"
              : "bg-emerald-500",
        )}
      />
    </Pressable>
  );
}
