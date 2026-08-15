import { selectFrom, upsert } from "@will-be-done/hyperdb";
import { action } from "../builders";
import { canonicalizeHlc, maxHlc, observedChangeClocks } from "./hlc";
import { changesTable, syncStateId, syncStateTable } from "./tables";

const canonicalizeOptional = (value: string | undefined) =>
  value && value !== "" ? canonicalizeHlc(value) : value;

/** Full-table v4 upgrade; intentionally runs only while opening a database. */
export const migrateSyncV4Clocks = action({
  name: "migrateSyncV4Clocks",
  args: {},
  handler: function* () {
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

    const states = yield* selectFrom(syncStateTable, "byId").where((q) =>
      q.eq("id", syncStateId),
    );
    if (states.length > 0) {
      yield* upsert(
        syncStateTable,
        states.map((state) => ({
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
        })),
      );
    }
    return (
      maxHlc(migrated.flatMap((change) => observedChangeClocks(change))) ?? null
    );
  },
});
