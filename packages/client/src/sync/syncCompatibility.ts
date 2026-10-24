import {
  CURRENT_SYNC_VERSION,
  SYNC_VERSION_UNSUPPORTED,
} from "@will-be-done/slices/common";

let updateRequired = false;
const listeners = new Set<() => void>();

export const syncChannelName = (
  channel: "changes" | "election" | "status",
  clientId: string,
) => `${channel}-v${CURRENT_SYNC_VERSION}-${clientId}`;

export const getSyncUpdateRequired = () => updateRequired;

export const subscribeSyncUpdateRequired = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const markSyncUpdateRequired = () => {
  if (updateRequired) return;
  updateRequired = true;
  for (const listener of listeners) listener();
};

export function isUnsupportedSyncVersionError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;

  const errorRecord = error as Record<string, unknown>;
  const directData = errorRecord.data;
  const shape = errorRecord.shape;
  const shapeData =
    typeof shape === "object" && shape !== null
      ? (shape as Record<string, unknown>).data
      : undefined;

  for (const data of [directData, shapeData]) {
    if (typeof data !== "object" || data === null) continue;
    const syncVersion = (data as Record<string, unknown>).syncVersion;
    if (
      typeof syncVersion === "object" &&
      syncVersion !== null &&
      (syncVersion as Record<string, unknown>).code === SYNC_VERSION_UNSUPPORTED
    ) {
      return true;
    }
  }

  return false;
}
