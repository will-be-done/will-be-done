import { selectAsync, type HyperDB } from "@will-be-done/hyperdb";
import { attachmentRowStates } from "@will-be-done/slices/space";
import { Clock, Effect, Schedule } from "effect";
import { spaceDBConfig } from "../db/configs";
import { getHyperDB } from "../db/db";
import { AttachmentStorage } from "./storage";

const DAY_MS = 24 * 60 * 60 * 1000;
// A deleted file stays long enough for undo and offline replicas that still
// hold the row to settle; bytes whose row never synced get a day to arrive.
export const DELETED_ATTACHMENT_GRACE_MS = 7 * DAY_MS;
export const UNSYNCED_ATTACHMENT_GRACE_MS = DAY_MS;
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

// One space failing does not stop the others.
const sweepAttachments = Effect.gen(function* () {
  const now = yield* Clock.currentTimeMillis;
  for (const spaceId of yield* (yield* AttachmentStorage).listSpaces) {
    yield* Effect.gen(function* () {
      const { db } = yield* Effect.promise(() =>
        getHyperDB(spaceDBConfig(spaceId)),
      );
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
export const attachmentCleanup = sweepAttachments.pipe(
  Effect.catchCause((cause) =>
    Effect.logError("[Attachments] Cleanup failed", cause),
  ),
  Effect.repeat(Schedule.spaced(DAY_MS)),
  Effect.delay(Math.random() * 60 * 60 * 1000),
);
