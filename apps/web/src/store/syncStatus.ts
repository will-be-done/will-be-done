import type { HyperDB } from "@will-be-done/hyperdb";
import { State } from "@/utils/State";

export type SyncPhase =
  | "waiting"
  | "connecting"
  | "preparing"
  | "uploading"
  | "committing"
  | "downloading"
  | "applying"
  | "synced"
  | "error"
  | "update-required";

export const phaseLabels: Record<SyncPhase, string> = {
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

export type SyncStatus = {
  phase: SyncPhase;
  lastSyncedAt: number | null;
  progress: { completed: number; total: number } | null;
  error: string | null;
};

export const initialSyncStatus: SyncStatus = {
  phase: "waiting",
  lastSyncedAt: null,
  progress: null,
  error: null,
};

// Status is session-only UI information, never a sync cursor or acknowledgement.
export const syncByDB = new WeakMap<
  HyperDB,
  {
    status: State<SyncStatus>;
    leader: State<boolean>;
    initialSync: State<boolean>;
    syncNow: () => Promise<void>;
  }
>();
