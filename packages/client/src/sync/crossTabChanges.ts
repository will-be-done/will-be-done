import {
  asyncDispatch,
  externalStorageMergeTrait,
  type SubscribableDB,
} from "@will-be-done/hyperdb";
import {
  mergeChanges,
  observedChangeClocks,
  type HlcClock,
} from "@will-be-done/slices/common";
import { mergeSpaceChanges } from "@will-be-done/slices/space";
import type { ChangePersistedEvent, SyncConfig } from "./syncTypes";
import { syncChannelName } from "./syncCompatibility";
import type { SyncCoordination } from "./platform";

type CreateCrossTabChangesArgs = {
  clientId: string;
  syncSubDb: SubscribableDB;
  syncConfig: SyncConfig;
  nextClock: HlcClock;
  onApplied: () => void;
  coordination: SyncCoordination;
};

export const createCrossTabChanges = ({
  clientId,
  syncSubDb,
  syncConfig,
  nextClock,
  onApplied,
  coordination,
}: CreateCrossTabChangesArgs) => {
  const bc = coordination.createChannel<ChangePersistedEvent>(
    syncChannelName("changes", clientId),
  );

  const applyChanges = async (data: ChangePersistedEvent) => {
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
    await asyncDispatch<unknown>(
      syncSubDb.withTraits({ type: "skip-sync" }, externalStorageMergeTrait),
      merge(mergeArgs),
    );
    // A status-channel wake-up can finish before this asynchronous merge.
    // Wake again only once the incoming changes are visible to sync reads.
    onApplied();
  };

  bc.onmessage = (data) => {
    void applyChanges(data);
  };

  return {
    applyChanges,
    postChanges: (data: ChangePersistedEvent) => {
      void bc.postMessage(data);
    },
  };
};
