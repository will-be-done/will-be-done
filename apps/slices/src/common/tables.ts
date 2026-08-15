import { defineTable, type ExtractSchema, v } from "@will-be-done/hyperdb";

export const changesTable = defineTable("changes", {
  id: v.string(),
  entityId: v.string(),
  tableName: v.string(),
  createdAt: v.string(),
  updatedAt: v.string(),
  deletedAt: v.union(v.string(), v.null()),
  clientId: v.string(),
  changes: v.record(v.string(), v.string()),
}).index("byUpdatedAtId", ["updatedAt", "id"]);
export type Change = ExtractSchema<typeof changesTable>;

const syncStateId = "deae72d6-ffca-4d20-9b3f-87e71acce8b6";
export { syncStateId };

export const syncStateTable = defineTable("syncState", {
  id: v.string(),
  lastSentClock: v.string(),
  lastSentChangeId: v.optional(v.string()),
  lastServerAppliedClock: v.string(),
  serverConfirmedClientClock: v.optional(v.string()),
  serverConfirmedClientChangeId: v.optional(v.string()),
  localCoveredClientClock: v.optional(v.string()),
  localCoveredClientChangeId: v.optional(v.string()),
  lastServerAppliedRevision: v.optional(v.number()),
  serverConfirmedAppliedRevision: v.optional(v.number()),
  syncV4ClocksMigrated: v.optional(v.boolean()),
});
export type SyncState = ExtractSchema<typeof syncStateTable>;
