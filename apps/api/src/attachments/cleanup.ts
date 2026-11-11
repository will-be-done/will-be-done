import {
  asyncDispatch,
  deleteRows,
  selectAsync,
  selectFrom,
  upsert,
  v,
  type HyperDB,
} from "@will-be-done/hyperdb";
import {
  allAttachments,
  attachmentRowStates,
  deleteAttachments,
  unlinkedAttachmentIds,
} from "@will-be-done/slices/space";
import { Clock, Effect, Schedule } from "effect";
import { action, selector } from "../builders";
import { getLoadedHyperDBs } from "../db/db";
import { AttachmentStorage } from "./storage";
import { type AttachmentSweepMark, attachmentSweepMarksTable } from "./tables";

const DAY_MS = 24 * 60 * 60 * 1000;
// Every grace period counts from when this server first saw the file unused,
// so a replica's clock or a delete synced late never shortens it.
//
// A file no item lists stays long enough for offline replicas that listed it
// meanwhile to sync. Deciding here, on the merged state, means a replica never
// deletes a file another one has just listed.
export const UNLINKED_ATTACHMENT_GRACE_MS = 30 * DAY_MS;
// Bytes of a deleted file stay long enough for undo and offline replicas that
// still hold the row to settle.
export const DELETED_ATTACHMENT_GRACE_MS = 7 * DAY_MS;
// Bytes without a row are usually a failed upload, but a server restored from
// a backup also has no rows for files added since. Those rows return as
// clients reconnect, and the bytes are never uploaded again, so they must
// outlast the restore.
export const UNSYNCED_ATTACHMENT_GRACE_MS = 30 * DAY_MS;
const BATCH_SIZE = 200;

const sweepMarks = selector({
  name: "attachmentSweepMarks",
  args: {},
  handler: function* attachmentSweepMarks() {
    return yield* selectFrom(attachmentSweepMarksTable, "byIds");
  },
});

const saveSweepMarks = action({
  name: "saveAttachmentSweepMarks",
  args: {
    marks: v.array(attachmentSweepMarksTable.v()),
    cleared: v.array(v.string()),
  },
  handler: function* saveAttachmentSweepMarks({ marks, cleared }) {
    if (marks.length > 0) yield* upsert(attachmentSweepMarksTable, marks);
    if (cleared.length > 0)
      yield* deleteRows(attachmentSweepMarksTable, cleared);
  },
});

// A full pass over the space's files, as maintenance; not for request paths.
export const sweepSpaceAttachments = (
  spaceId: string,
  db: HyperDB,
  now: number,
) =>
  Effect.gen(function* () {
    const storage = yield* AttachmentStorage;
    const unseen = new Map(
      (yield* Effect.promise(() =>
        selectAsync(db, { selector: sweepMarks, args: {} }),
      )).map((mark) => [mark.id, mark]),
    );
    const marks: AttachmentSweepMark[] = [];
    // When the file was first seen unused for this reason.
    const unusedSince = (id: string, reason: AttachmentSweepMark["reason"]) => {
      const mark = unseen.get(id);
      unseen.delete(id);
      if (mark?.reason === reason) return mark.since;
      marks.push({ id, reason, since: now });
      return now;
    };

    const rows = yield* Effect.promise(() =>
      selectAsync(db, { selector: allAttachments, args: {} }),
    );
    const expiredRows: string[] = [];
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const unlinked = yield* Effect.promise(() =>
        selectAsync(db, {
          selector: unlinkedAttachmentIds,
          args: { ids: rows.slice(i, i + BATCH_SIZE).map(({ id }) => id) },
        }),
      );
      for (const id of unlinked) {
        if (unusedSince(id, "unlinked") <= now - UNLINKED_ATTACHMENT_GRACE_MS) {
          expiredRows.push(id);
        }
      }
    }
    if (expiredRows.length > 0) {
      yield* Effect.promise(() =>
        asyncDispatch(db, deleteAttachments({ ids: expiredRows })),
      );
    }

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
      for (const { id } of batch) {
        const state = states[id]?.state;
        const expired =
          state === "deleted"
            ? unusedSince(id, "deleted") <= now - DELETED_ATTACHMENT_GRACE_MS
            : state === "unknown" &&
              unusedSince(id, "unknown") <= now - UNSYNCED_ATTACHMENT_GRACE_MS;
        if (!expired) continue;
        yield* storage.delete(spaceId, id);
        removed.push(id);
      }
    }

    // Files listed again, or gone for good, start over if they come back.
    yield* Effect.promise(() =>
      asyncDispatch(
        db,
        saveSweepMarks({
          marks,
          cleared: [...unseen.keys(), ...removed],
        }),
      ),
    );
    return { deletedRows: expiredRows, removed };
  });

// Sweeps spaces this server has loaded. Spaces load when a client syncs, so
// active spaces stay clean without opening, and keeping open, every database.
// One space failing does not stop the others.
export const sweepStoredAttachments = (databases = getLoadedHyperDBs()) =>
  Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis;
    for (const { database, dbType, db } of databases) {
      if (dbType !== "space") continue;
      const spaceId = database.slice("space-".length);
      yield* sweepSpaceAttachments(spaceId, db, now).pipe(
        Effect.tap(({ deletedRows, removed }) =>
          deletedRows.length + removed.length > 0
            ? Effect.log(
                `[Attachments] Deleted ${deletedRows.length} unlisted files and ${removed.length} stored files from space ${spaceId}`,
              )
            : Effect.void,
        ),
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
export const attachmentCleanup = Effect.suspend(() =>
  sweepStoredAttachments(),
).pipe(
  Effect.catchCause((cause) =>
    Effect.logError("[Attachments] Cleanup failed", cause),
  ),
  Effect.repeat(Schedule.spaced(DAY_MS)),
  Effect.delay(Math.random() * 60 * 60 * 1000),
);
