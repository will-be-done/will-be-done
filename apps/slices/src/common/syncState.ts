import {
  runQuery,
  selector,
  table,
  selectFrom,
  action,
  update,
} from "@will-be-done/hyperdb";

export type SyncState = {
  id: string;
  lastSentClock: string;
  lastServerAppliedClock: string;
};
const syncStateId = "deae72d6-ffca-4d20-9b3f-87e71acce8b6";
export const syncStateTable = table<SyncState>("syncState").withIndexes({
  byId: { cols: ["id"], type: "hash" },
});

type GenReturn<T> = Generator<unknown, T, unknown>;
export const syncSlice = {
  getOrDefault: selector(function* (): GenReturn<SyncState> {
    const currentSyncState = (yield* runQuery(
      selectFrom(syncStateTable, "byId").where((q) => q.eq("id", syncStateId)),
    ))[0];

    return (
      currentSyncState ?? {
        id: syncStateId,
        lastSentClock: "",
        lastServerAppliedClock: "",
      }
    );
  }),

  update: action(function* (updates: Partial<SyncState>): GenReturn<SyncState> {
    const currentSyncState = yield* syncSlice.getOrDefault();
    return yield* update(syncStateTable, [
      {
        ...currentSyncState,
        ...updates,
      },
    ]);
  }),
};
