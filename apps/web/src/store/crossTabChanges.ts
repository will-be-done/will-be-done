import { asyncDispatch, type SubscribableDB } from "@will-be-done/hyperdb";
import { mergeChanges } from "@will-be-done/slices/common";
import { mergeSpaceChanges } from "@will-be-done/slices/space";
import { BroadcastChannel } from "broadcast-channel";
import type { ChangePersistedEvent, SyncConfig } from "./syncTypes";
import { syncChannelName } from "./syncCompatibility";

type CreateCrossTabChangesArgs = {
  clientId: string;
  syncSubDb: SubscribableDB;
  syncConfig: SyncConfig;
  nextClock: () => string;
};

export const createCrossTabChanges = ({
  clientId,
  syncSubDb,
  syncConfig,
  nextClock,
}: CreateCrossTabChangesArgs) => {
  const bc = new BroadcastChannel(syncChannelName("changes", clientId));

  const applyChanges = async (data: ChangePersistedEvent) => {
    const mergeArgs = {
      input: data.changeset,
      nextClock: nextClock(),
      clientId,
      registeredSyncableTableNameMap: syncConfig.tableNameMap,
    };
    const merge =
      syncConfig.dbType === "space" ? mergeSpaceChanges : mergeChanges;
    await asyncDispatch<unknown>(
      syncSubDb.withTraits({ type: "skip-sync" }),
      merge(mergeArgs),
    );
  };

  bc.onmessage = (data) => {
    void applyChanges(data as ChangePersistedEvent);
  };

  return {
    applyChanges,
    postChanges: (data: ChangePersistedEvent) => {
      void bc.postMessage(data);
    },
  };
};
