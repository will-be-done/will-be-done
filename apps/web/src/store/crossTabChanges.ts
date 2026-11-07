import {
  mergeChanges,
  observedChangeClocks,
  type HlcClock,
} from "@will-be-done/slices/common";
import { mergeSpaceChanges } from "@will-be-done/slices/space";
import { Effect, type Scope } from "effect";
import { TabChannels } from "@/services/browser";
import { Database, type DatabaseError } from "./database";
import type { ChangePersistedEvent, SyncConfig } from "./syncTypes";
import { syncChannelName } from "./syncCompatibility";

type CreateCrossTabChangesArgs = {
  clientId: string;
  syncConfig: SyncConfig;
  nextClock: HlcClock;
  onApplied: () => void;
};

export type CrossTabChanges = {
  readonly applyChanges: (
    data: ChangePersistedEvent,
  ) => Effect.Effect<void, DatabaseError>;
  readonly postChanges: (data: ChangePersistedEvent) => void;
};

// Closing the scope stops listening for other tabs' changes.
export const makeCrossTabChanges = ({
  clientId,
  syncConfig,
  nextClock,
  onApplied,
}: CreateCrossTabChangesArgs): Effect.Effect<
  CrossTabChanges,
  never,
  TabChannels | Database | Scope.Scope
> =>
  Effect.gen(function* () {
    const database = yield* Database;
    const channel = yield* (yield* TabChannels).channel<ChangePersistedEvent>(
      syncChannelName("changes", clientId),
    );
    const mergeIncoming = (data: ChangePersistedEvent) =>
      Effect.gen(function* () {
        nextClock.observe(
          data.changeset.flatMap((changeset) =>
            changeset.data.flatMap(({ change }) =>
              observedChangeClocks(change),
            ),
          ),
        );
        const mergeArgs = {
          input: data.changeset,
          nextClock: nextClock(),
          clientId,
          registeredSyncableTableNameMap: syncConfig.tableNameMap,
        };
        const merge =
          syncConfig.dbType === "space" ? mergeSpaceChanges : mergeChanges;
        yield* database.dispatch<unknown>(merge(mergeArgs), { skipSync: true });
        yield* database.waitForPersistence;
        // A status-channel wake-up can finish before this asynchronous merge.
        // Wake again only once the incoming changes are visible to sync reads.
        onApplied();
      });

    const runFork = Effect.runForkWith(yield* Effect.context<never>());
    yield* channel.listen((data) => {
      runFork(
        mergeIncoming(data).pipe(
          Effect.catchCause((cause) =>
            Effect.logError("Cross-tab merge failed", cause),
          ),
        ),
      );
    });

    return {
      applyChanges: mergeIncoming,
      postChanges: (data) => channel.post(data),
    };
  });
