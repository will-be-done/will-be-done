import type { WorkBreak } from "@will-be-done/slices/space";

export type PendingSpaceWorkday = {
  dayStartMinutes: number;
  dayEndMinutes: number;
  breaks: WorkBreak[];
};

const memory = new Map<string, PendingSpaceWorkday>();

function storageKey(spaceId: string) {
  return `pending-space-workday:${spaceId}`;
}

export function setPendingSpaceWorkday(
  spaceId: string,
  workday: PendingSpaceWorkday,
) {
  memory.set(spaceId, workday);
  try {
    sessionStorage.setItem(storageKey(spaceId), JSON.stringify(workday));
  } catch {
    // Private mode and quota errors should not block space creation.
  }
}

export function takePendingSpaceWorkday(
  spaceId: string,
): PendingSpaceWorkday | undefined {
  const fromMemory = memory.get(spaceId);
  memory.delete(spaceId);

  try {
    const raw = sessionStorage.getItem(storageKey(spaceId));
    sessionStorage.removeItem(storageKey(spaceId));
    if (fromMemory) return fromMemory;
    if (raw) return JSON.parse(raw) as PendingSpaceWorkday;
  } catch {
    return fromMemory;
  }

  return fromMemory;
}
