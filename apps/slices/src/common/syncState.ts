import { selectFrom, upsert, v } from "@will-be-done/hyperdb";
import { action, selector } from "../builders";
import {
  changesTable,
  syncStateTable,
  syncStateId,
  type Change,
  type SyncState,
} from "./tables";
import { maxHlc } from "./hlc";

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

export const getLatestPersistedClock = selector({
  name: "getLatestPersistedClock",
  args: {},
  handler: function* () {
    const latestChanges = (yield* selectFrom(changesTable, "byUpdatedAtId")
      .order("desc")
      .limit(1)) as Change[];
    const state = yield* getSyncStateOrDefault({});

    return (
      maxHlc([
        latestChanges[0]?.updatedAt,
        state.lastSentClock,
        state.lastServerAppliedClock,
        state.serverConfirmedClientClock,
        state.localCoveredClientClock,
      ]) ?? null
    );
  },
});

export const updateSyncState = action({
  name: "updateSyncState",
  args: {
    updates: v.object({
      id: v.optional(v.string()),
      lastSentClock: v.optional(v.string()),
      lastSentChangeId: v.optional(v.string()),
      lastServerAppliedClock: v.optional(v.string()),
      serverConfirmedClientClock: v.optional(v.string()),
      serverConfirmedClientChangeId: v.optional(v.string()),
      localCoveredClientClock: v.optional(v.string()),
      localCoveredClientChangeId: v.optional(v.string()),
      lastServerAppliedRevision: v.optional(v.number()),
      serverConfirmedAppliedRevision: v.optional(v.number()),
      syncV4ClocksMigrated: v.optional(v.boolean()),
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
