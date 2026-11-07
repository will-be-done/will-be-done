import {
  asyncDispatch,
  execAsync,
  type SubscribableDB,
} from "@will-be-done/hyperdb";
import {
  mergeChanges,
  observedChangeClocks,
  type HlcClock,
} from "@will-be-done/slices/common";
import { mergeSpaceChanges } from "@will-be-done/slices/space";
import { Data, Effect, type Scope } from "effect";
import { TabChannels } from "@/services/browser";
import type { ChangePersistedEvent, SyncConfig } from "./syncTypes";
import { syncChannelName } from "./syncCompatibility";

class CrossTabMergeError extends Data.TaggedError("CrossTabMergeError")<{
  readonly cause: unknown;
}> {}

type CreateCrossTabChangesArgs = {
  clientId: string;
  syncSubDb: SubscribableDB;
  syncConfig: SyncConfig;
  nextClock: HlcClock;
  onApplied: () => void;
};

export type CrossTabChanges = {
  readonly applyChanges: (data: ChangePersistedEvent) => Promise<void>;
  readonly postChanges: (data: ChangePersistedEvent) => void;
};

// Closing the scope stops listening for other tabs' changes.
export const makeCrossTabChanges = ({
  clientId,
  syncSubDb,
  syncConfig,
  nextClock,
  onApplied,
}: CreateCrossTabChangesArgs): Effect.Effect<
  CrossTabChanges,
  never,
  TabChannels | Scope.Scope
> =>
  Effect.gen(function* () {
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
        yield* Effect.tryPromise({
          try: async () => {
            await asyncDispatch<unknown>(
              syncSubDb.withTraits({ type: "skip-sync" }),
              merge(mergeArgs),
            );
            await execAsync(syncSubDb.waitForPersistence());
          },
          catch: (cause) => new CrossTabMergeError({ cause }),
        });
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
      applyChanges: (data) => Effect.runPromise(mergeIncoming(data)),
      postChanges: (data) => channel.post(data),
    };
  });
