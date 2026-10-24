import type { HyperDB } from "@will-be-done/hyperdb";
import { State } from "../utils/State";

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
export const syncStatusByDB = new WeakMap<HyperDB, State<SyncStatus>>();
