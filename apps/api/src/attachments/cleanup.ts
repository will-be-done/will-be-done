import { selectAsync, type HyperDB } from "@will-be-done/hyperdb";
import { attachmentRowStates } from "@will-be-done/slices/space";
import { Clock, Effect, Schedule } from "effect";
import { spaceDBConfig } from "../db/configs";
import { getHyperDB, getMainHyperDB } from "../db/db";
import { getDbById } from "../slices/dbSlice";
import { AttachmentStorage } from "./storage";

const DAY_MS = 24 * 60 * 60 * 1000;
// A deleted file stays long enough for undo and offline replicas that still
// hold the row to settle.
export const DELETED_ATTACHMENT_GRACE_MS = 7 * DAY_MS;
// Bytes without a row are usually a failed upload, but a server restored from
// a backup also has no rows for files added since. Those rows return as
// clients reconnect, and the bytes are never uploaded again, so they must
// outlast the restore.
export const UNSYNCED_ATTACHMENT_GRACE_MS = 30 * DAY_MS;
const BATCH_SIZE = 200;

export const sweepSpaceAttachments = (
  spaceId: string,
  db: HyperDB,
  now: number,
) =>
  Effect.gen(function* () {
    const storage = yield* AttachmentStorage;
    const files = yield* storage.list(spaceId);
    const removed: string[] = [];
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      const states = yield* Effect.promise(() =>
        selectAsync(db, {
          selector: attachmentRowStates,
          args: { ids: batch.map((file) => file.id) },
        }),
      );
      for (const file of batch) {
        const row = states[file.id];
        const expired =
          row?.state === "deleted"
            ? row.deletedAt < now - DELETED_ATTACHMENT_GRACE_MS
            : row?.state === "unknown" &&
              file.modifiedAt < now - UNSYNCED_ATTACHMENT_GRACE_MS;
        if (!expired) continue;
        yield* storage.delete(spaceId, file.id);
        removed.push(file.id);
      }
    }
    return removed;
  });

// One space failing does not stop the others. Opening a database creates it,
// and against an empty one every file looks unknown, so only spaces this
// server knows are swept.
export const sweepStoredAttachments = (
  mainDB: HyperDB,
  openSpaceDB = async (spaceId: string): Promise<HyperDB> =>
    (await getHyperDB(spaceDBConfig(spaceId))).db,
) =>
  Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis;
    for (const spaceId of yield* (yield* AttachmentStorage).listSpaces) {
      yield* Effect.gen(function* () {
        const known = yield* Effect.promise(() =>
          selectAsync(mainDB, {
            selector: getDbById,
            args: { id: spaceId, type: "space" },
          }),
        );
        if (!known) return;
        const db = yield* Effect.promise(() => openSpaceDB(spaceId));
        const removed = yield* sweepSpaceAttachments(spaceId, db, now);
        if (removed.length > 0) {
          yield* Effect.log(
            `[Attachments] Removed ${removed.length} unused files from space ${spaceId}`,
          );
        }
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.logError(
            `[Attachments] Cleanup failed for space ${spaceId}`,
            cause,
          ),
        ),
      );
    }
  });

// Daily while its scope is open. The first run waits a random part of an
// hour, so restarts of several instances spread out.
export const attachmentCleanup = Effect.promise(() => getMainHyperDB()).pipe(
  Effect.flatMap((mainDB) => sweepStoredAttachments(mainDB)),
  Effect.catchCause((cause) =>
    Effect.logError("[Attachments] Cleanup failed", cause),
  ),
  Effect.repeat(Schedule.spaced(DAY_MS)),
  Effect.delay(Math.random() * 60 * 60 * 1000),
);
