import { defineTable, type ExtractSchema, v } from "@will-be-done/hyperdb";

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
