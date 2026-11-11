import {
  defineTable,
  deleteRows,
  type ExtractSchema,
  type SubscribableDB,
  v,
} from "@will-be-done/hyperdb";
import {
  type Attachment,
  attachmentsTable,
  type ItemAttachment,
  itemAttachmentsTable,
} from "@will-be-done/slices/space";

// When the cleanup sweep first saw an attachment unused, by the server's
// clock. Server-only: replicas' clocks and offline delays never shorten a
// grace period.
export const attachmentSweepMarksTable = defineTable("attachment_sweep_marks", {
  id: v.string(),
  // unlinked: a live row no item lists; deleted: bytes of a tombstoned
  // row; unknown: bytes without any row.
  reason: v.union(
    v.literal("unlinked"),
    v.literal("deleted"),
    v.literal("unknown"),
  ),
  since: v.number(),
}).index("byIds", ["id"]);
export type AttachmentSweepMark = ExtractSchema<
  typeof attachmentSweepMarksTable
>;

// A file listed or written again restarts its grace period, even when no
// sweep saw it in use before it was unused again.
export function installAttachmentSweepHooks(db: SubscribableDB) {
  db.afterChange(function* resetAttachmentSweepMarks(_db, table, _traits, ops) {
    const ids = new Set<string>();
    for (const op of ops) {
      if (op.type === "delete") continue;
      if (table === attachmentsTable) ids.add((op.newValue as Attachment).id);
      if (table === itemAttachmentsTable) {
        ids.add((op.newValue as ItemAttachment).attachmentId);
      }
    }
    if (ids.size > 0) yield* deleteRows(attachmentSweepMarksTable, [...ids]);
  });
}
