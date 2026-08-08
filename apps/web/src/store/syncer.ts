import { asyncDispatch, type HyperDB } from "@will-be-done/hyperdb";
import {
  CURRENT_SYNC_VERSION,
  getSyncStateOrDefault,
  updateSyncState,
} from "@will-be-done/slices/common";
import {
  BroadcastChannel,
  createLeaderElection,
  type LeaderElector,
} from "broadcast-channel";
import { getDevtoolsEnabled } from "@/lib/devtools";
import { trpcClient } from "@/lib/trpc.ts";
import { State } from "@/utils/State.ts";
import {
  createApplyServerChangesIfNoClientChanges,
  getChangesToSendToServer,
} from "./syncActions";
import { withSyncRequestTimeout } from "./syncRequestTimeout";
import type { SyncConfig } from "./syncTypes";
import {
  isUnsupportedSyncVersionError,
  markSyncUpdateRequired,
  syncChannelName,
} from "./syncCompatibility";

const SYNC_POLL_INTERVAL_MS = 5000;
const SYNC_UPLOAD_TIMEOUT_MS = 30 * 60_000;

const syncerLogsEnabled = () =>
  getDevtoolsEnabled() || process.env.NODE_ENV === "development";

const syncerLog = (...args: Parameters<typeof console.log>) => {
  if (syncerLogsEnabled()) {
    console.log(...args);
  }
};

export class Syncer {
  private electionChannel: BroadcastChannel;
  private elector: LeaderElector;
  private runId = 0;
  private terminal = false;
  private clientId: string;
  private syncConfig: SyncConfig;
  private wsUnsubscribe: (() => void) | null = null;
  private applyServerChangesIfNoClientChanges: ReturnType<
    typeof createApplyServerChangesIfNoClientChanges
  >;

  private wsNotification = new State<number>(0);
  private forceSyncNotification = new State<number>(0);
  private wakeSyncLoop = () => {
    this.forceSync();
  };

  constructor(
    private syncDB: HyperDB,
    clientId: string,
    syncConfig: SyncConfig,
    private nextClock: () => string,
  ) {
    this.clientId = clientId;
    this.syncConfig = syncConfig;
    this.electionChannel = new BroadcastChannel(
      syncChannelName("election", clientId),
    );
    this.elector = createLeaderElection(this.electionChannel);
    this.applyServerChangesIfNoClientChanges =
      createApplyServerChangesIfNoClientChanges(nextClock);

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        this.wakeSyncLoop();
      }
    });
    window.addEventListener("online", this.wakeSyncLoop);
    window.addEventListener("focus", this.wakeSyncLoop);
  }

  startLoop() {
    this.elector.onduplicate = () => {
      if (this.terminal) return;
      syncerLog("onduplicate");

      this.runId++;
      this.cleanupWebSocket();
      void this.run();
    };

    void this.run();
  }

  forceSync() {
    if (this.terminal) return;
    this.forceSyncNotification.modify((version) => version + 1);
  }

  private stopForRequiredUpdate() {
    if (this.terminal) return;
    this.terminal = true;
    this.runId++;
    this.cleanupWebSocket();
    this.forceSyncNotification.modify((version) => version + 1);
    markSyncUpdateRequired();
  }

  private cleanupWebSocket() {
    if (this.wsUnsubscribe) {
      this.wsUnsubscribe();
      this.wsUnsubscribe = null;
    }
  }

  private setupWebSocketSubscription() {
    const subscription = trpcClient.onChangesAvailable.subscribe(
      {
        dbId: this.syncConfig.dbId,
        dbType: this.syncConfig.dbType,
        syncVersion: CURRENT_SYNC_VERSION,
      },
      {
        onData: () => {
          syncerLog("WebSocket notification received");
          this.wsNotification.modify((version) => version + 1);
        },
        onError: (err) => {
          if (isUnsupportedSyncVersionError(err)) {
            this.stopForRequiredUpdate();
            return;
          }
          console.error("WebSocket subscription error:", err);
          this.wsNotification.modify((version) => version + 1);
        },
      },
    );

    this.wsUnsubscribe = () => subscription.unsubscribe();
  }

  async run() {
    const myRunId = ++this.runId;

    await this.elector.awaitLeadership();

    if (this.terminal || this.runId !== myRunId) return;

    this.setupWebSocketSubscription();

    // let's delay so faster startup
    await new Promise((resolve) => setTimeout(resolve, 2000));

    while (true) {
      if (this.runId !== myRunId) {
        syncerLog("runId !== myRunId, stopping syncer loop");
        this.cleanupWebSocket();
        return;
      }
      try {
        syncerLog("sending changes to server");
        await this.sendChangesToServer();
        syncerLog("applying changes from server");
        await this.getAndApplyChanges();
      } catch (e) {
        if (isUnsupportedSyncVersionError(e)) {
          this.stopForRequiredUpdate();
          return;
        }
        console.error(e);
      }

      await this.waitForNextSyncTrigger();
    }
  }

  private async waitForNextSyncTrigger() {
    const wsVersion = this.wsNotification.get();
    const forceSyncVersion = this.forceSyncNotification.get();

    return new Promise<"timeout" | "ws" | "local">((resolve) => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let unsubscribeWs = () => {};
      let unsubscribeForceSync = () => {};
      let settled = false;

      const finish = (reason: "timeout" | "ws" | "local") => {
        if (settled) {
          return;
        }
        settled = true;
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
        }
        unsubscribeWs();
        unsubscribeForceSync();
        resolve(reason);
      };

      unsubscribeWs = this.wsNotification.subscribe((version) => {
        if (version > wsVersion) {
          finish("ws");
        }
      });
      unsubscribeForceSync = this.forceSyncNotification.subscribe((version) => {
        if (version > forceSyncVersion) {
          finish("local");
        }
      });

      if (process.env.NODE_ENV !== "development") {
        timeoutId = setTimeout(() => finish("timeout"), SYNC_POLL_INTERVAL_MS);
      }
    });
  }

  private async getAndApplyChanges() {
    const syncState = await asyncDispatch(
      this.syncDB.withTraits({ type: "skip-sync" }),
      getSyncStateOrDefault({}),
    );
    const serverChanges = await withSyncRequestTimeout(
      "getChangesAfter",
      (signal) =>
        trpcClient.getChangesAfter.query(
          {
            lastServerUpdatedAt: syncState.lastServerAppliedClock,
            dbId: this.syncConfig.dbId,
            dbType: this.syncConfig.dbType,
            clientId: this.clientId,
            syncVersion: CURRENT_SYNC_VERSION,
          },
          { signal },
        ),
    );

    if (serverChanges.changesets.length === 0) {
      syncerLog("no changes from server");
      if (serverChanges.maxClock !== "") {
        await asyncDispatch(
          this.syncDB.withTraits({ type: "skip-sync" }),
          updateSyncState({
            updates: { lastServerAppliedClock: serverChanges.maxClock },
          }),
        );
      }

      return;
    }

    await asyncDispatch(
      this.syncDB.withTraits({ type: "skip-sync" }),
      this.applyServerChangesIfNoClientChanges({
        registeredSyncableTableNameMap: this.syncConfig.tableNameMap,
        syncState,
        serverChanges,
        clientId: this.clientId,
      }),
    );
  }

  private async sendChangesToServer() {
    const { changesets, maxClock } = await asyncDispatch(
      this.syncDB,
      getChangesToSendToServer({
        registeredSyncableTableNameMap: this.syncConfig.tableNameMap,
      }),
    );

    if (changesets.length === 0) {
      return;
    }

    await withSyncRequestTimeout(
      "handleChanges",
      (signal) =>
        trpcClient.handleChanges.mutate(
          {
            dbId: this.syncConfig.dbId,
            dbType: this.syncConfig.dbType,
            changeset: changesets,
            syncVersion: CURRENT_SYNC_VERSION,
          },
          { signal },
        ),
      SYNC_UPLOAD_TIMEOUT_MS,
    );
    await asyncDispatch(
      this.syncDB.withTraits({ type: "skip-sync" }),
      updateSyncState({ updates: { lastSentClock: maxClock } }),
    );
  }
}
