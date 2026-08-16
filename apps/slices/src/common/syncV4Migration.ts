import { selectFrom, upsert } from "@will-be-done/hyperdb";
import { action } from "../builders";
import { canonicalizeHlc, maxHlc, observedChangeClocks } from "./hlc";
import { changesTable, syncStateId, syncStateTable } from "./tables";

const canonicalizeOptional = (value: string | undefined) =>
  value && value !== "" ? canonicalizeHlc(value) : value;

const observedSyncStateClocks = (state: {
  lastSentClock: string;
  lastServerAppliedClock: string;
  serverConfirmedClientClock?: string;
  localCoveredClientClock?: string;
}) => [
  state.lastSentClock,
  state.lastServerAppliedClock,
  state.serverConfirmedClientClock,
  state.localCoveredClientClock,
];

/** Full-table v4 upgrade; intentionally runs only while opening a database. */
export const migrateSyncV4Clocks = action({
  name: "migrateSyncV4Clocks",
  args: {},
  handler: function* () {
    const states = yield* selectFrom(syncStateTable, "byId").where((q) =>
      q.eq("id", syncStateId),
    );
    if (states[0]?.syncV4ClocksMigrated) {
      const persistedClock = maxHlc(states.flatMap(observedSyncStateClocks));
      return persistedClock ? canonicalizeHlc(persistedClock) : null;
    }

    const changes = yield* selectFrom(changesTable, "byUpdatedAtId");
    const migrated = changes.map((change) => ({
      ...change,
      createdAt: canonicalizeHlc(change.createdAt),
      updatedAt: canonicalizeHlc(change.updatedAt),
      deletedAt:
        change.deletedAt === null ? null : canonicalizeHlc(change.deletedAt),
      changes: Object.fromEntries(
        Object.entries(change.changes).map(([key, clock]) => [
          key,
          canonicalizeHlc(clock),
        ]),
      ),
    }));
    const changed = migrated.filter(
      (change, index) =>
        JSON.stringify(change) !== JSON.stringify(changes[index]),
    );
    if (changed.length > 0) yield* upsert(changesTable, changed);

    const migratedStates = states.map((state) => ({
      ...state,
      lastSentClock: canonicalizeOptional(state.lastSentClock) ?? "",
      lastServerAppliedClock:
        canonicalizeOptional(state.lastServerAppliedClock) ?? "",
      serverConfirmedClientClock: canonicalizeOptional(
        state.serverConfirmedClientClock,
      ),
      localCoveredClientClock: canonicalizeOptional(
        state.localCoveredClientClock,
      ),
      syncV4ClocksMigrated: true,
    }));
    if (states.length > 0) {
      yield* upsert(syncStateTable, migratedStates);
    } else {
      yield* upsert(syncStateTable, [
        {
          id: syncStateId,
          lastSentClock: "",
          lastServerAppliedClock: "",
          syncV4ClocksMigrated: true,
        },
      ]);
    }
    return (
      maxHlc([
        ...migrated.flatMap((change) => observedChangeClocks(change)),
        ...migratedStates.flatMap(observedSyncStateClocks),
      ]) ?? null
    );
  },
});
