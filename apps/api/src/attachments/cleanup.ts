import { selectAsync, type HyperDB } from "@will-be-done/hyperdb";
import { attachmentRowStates } from "@will-be-done/slices/space";
import { spaceDBConfig } from "../db/configs";
import { getHyperDB } from "../db/db";
import type { AttachmentStorage } from "./storage";

const DAY_MS = 24 * 60 * 60 * 1000;
// A deleted file stays long enough for undo and offline replicas that still
// hold the row to settle; bytes whose row never synced get a day to arrive.
export const DELETED_ATTACHMENT_GRACE_MS = 7 * DAY_MS;
export const UNSYNCED_ATTACHMENT_GRACE_MS = DAY_MS;
const BATCH_SIZE = 200;

export async function sweepSpaceAttachments({
  storage,
  spaceId,
  db,
  now,
}: {
  storage: AttachmentStorage;
  spaceId: string;
  db: HyperDB;
  now: number;
}): Promise<string[]> {
  const files = await storage.list(spaceId);
  const removed: string[] = [];
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    const states = await selectAsync(db, {
      selector: attachmentRowStates,
      args: { ids: batch.map((file) => file.id) },
    });
    for (const file of batch) {
      const row = states[file.id];
      const expired =
        row?.state === "deleted"
          ? row.deletedAt < now - DELETED_ATTACHMENT_GRACE_MS
          : row?.state === "unknown" &&
            file.modifiedAt < now - UNSYNCED_ATTACHMENT_GRACE_MS;
      if (!expired) continue;
      await storage.delete(spaceId, file.id);
      removed.push(file.id);
    }
  }
  return removed;
}

export async function sweepAttachments(
  storage: AttachmentStorage,
  now: number,
) {
  for (const spaceId of await storage.listSpaces()) {
    try {
      const { db } = await getHyperDB(spaceDBConfig(spaceId));
      const removed = await sweepSpaceAttachments({
        storage,
        spaceId,
        db,
        now,
      });
      if (removed.length > 0) {
        console.log(
          `[Attachments] Removed ${removed.length} unused files from space ${spaceId}`,
        );
      }
    } catch (error) {
      console.error(`[Attachments] Cleanup failed for space ${spaceId}`, error);
    }
  }
}

export function startAttachmentCleanup(storage: AttachmentStorage) {
  const run = () => void sweepAttachments(storage, Date.now());
  const timer = setInterval(run, DAY_MS);
  // Spread restarts of several instances across the first hour.
  const first = setTimeout(run, Math.random() * 60 * 60 * 1000);
  return () => {
    clearInterval(timer);
    clearTimeout(first);
  };
}
