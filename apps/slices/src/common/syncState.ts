import {
  selector,
  selectFrom,
  action,
  upsert,
  defineTable,
  type ExtractSchema,
  v,
} from "@will-be-done/hyperdb-lib";

const syncStateId = "deae72d6-ffca-4d20-9b3f-87e71acce8b6";
export const syncStateTable = defineTable("syncState", {
  id: v.string(),
  lastSentClock: v.string(),
  lastServerAppliedClock: v.string(),
});
export type SyncState = ExtractSchema<typeof syncStateTable>;

const getOrDefault = selector(function* getOrDefault() {
  const currentSyncState = (yield* selectFrom(syncStateTable, "byId").where((q) => q.eq("id", syncStateId)))[0];

  return (currentSyncState ?? {
    id: syncStateId,
    lastSentClock: "",
    lastServerAppliedClock: "",
  }) as SyncState;
});

const updateSyncState = action(function* updateSyncState(updates: Partial<SyncState>) {
  const currentSyncState = yield* getOrDefault();
  return yield* upsert(syncStateTable, [
    {
      ...currentSyncState,
      ...updates,
    },
  ]);
});

export const syncSlice = {
  getOrDefault,
  update: updateSyncState,
};
