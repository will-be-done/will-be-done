import { selectFrom, upsert, v } from "@will-be-done/hyperdb";
import { action, selector } from "../builders";
import { syncStateTable, syncStateId, type SyncState } from "./tables";

export { syncStateTable, type SyncState } from "./tables";

export const getSyncStateOrDefault = selector({
  name: "getSyncStateOrDefault",
  args: {},
  handler: function* getSyncStateOrDefault() {
    const currentSyncState = (yield* selectFrom(syncStateTable, "byId").where(
      (q) => q.eq("id", syncStateId),
    ))[0];

    return (currentSyncState ?? {
      id: syncStateId,
      lastSentClock: "",
      lastServerAppliedClock: "",
    }) as SyncState;
  },
});

export const updateSyncState = action({
  name: "updateSyncState",
  args: {
    updates: v.object({
      id: v.optional(v.string()),
      lastSentClock: v.optional(v.string()),
      lastServerAppliedClock: v.optional(v.string()),
      serverConfirmedClientClock: v.optional(v.string()),
      serverConfirmedClientChangeId: v.optional(v.string()),
      localCoveredClientClock: v.optional(v.string()),
      localCoveredClientChangeId: v.optional(v.string()),
      lastServerAppliedRevision: v.optional(v.number()),
      serverConfirmedAppliedRevision: v.optional(v.number()),
    }),
  },
  handler: function* updateSyncState({ updates }) {
    const currentSyncState = yield* getSyncStateOrDefault({});
    return yield* upsert(syncStateTable, [
      {
        ...currentSyncState,
        ...updates,
      },
    ]);
  },
});
