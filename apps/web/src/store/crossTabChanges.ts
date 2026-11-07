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
import { BroadcastChannel } from "broadcast-channel";
import { Cause, Data, Effect } from "effect";
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

export const createCrossTabChanges = ({
  clientId,
  syncSubDb,
  syncConfig,
  nextClock,
  onApplied,
}: CreateCrossTabChangesArgs) => {
  const bc = new BroadcastChannel(syncChannelName("changes", clientId));

  const mergeIncoming = (data: ChangePersistedEvent) =>
    Effect.gen(function* () {
      nextClock.observe(
        data.changeset.flatMap((changeset) =>
          changeset.data.flatMap(({ change }) => observedChangeClocks(change)),
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

  bc.onmessage = (data) => {
    Effect.runFork(
      mergeIncoming(data as ChangePersistedEvent).pipe(
        Effect.catchCause((cause) =>
          Effect.sync(() =>
            console.error("Cross-tab merge failed:", Cause.squash(cause)),
          ),
        ),
      ),
    );
  };

  return {
    applyChanges: (data: ChangePersistedEvent) =>
      Effect.runPromise(mergeIncoming(data)),
    postChanges: (data: ChangePersistedEvent) => {
      void bc.postMessage(data);
    },
    close: () => {
      void bc.close();
    },
  };
};
