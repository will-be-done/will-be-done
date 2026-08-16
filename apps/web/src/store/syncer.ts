import { asyncDispatch, type HyperDB } from "@will-be-done/hyperdb";
import {
  CURRENT_SYNC_VERSION,
  observedChangeClocks,
  type ChangesetArrayType,
  type HlcClock,
  type SyncCommitResponse,
  type SyncSessionResponse,
} from "@will-be-done/slices/common";
import {
  BroadcastChannel,
  createLeaderElection,
  type LeaderElector,
} from "broadcast-channel";
import { getDevtoolsEnabled } from "@/lib/devtools";
import { trpcClient } from "@/lib/trpc.ts";
import { authUtils } from "@/lib/auth";
import { State } from "@/utils/State.ts";
import {
  beginSyncV4Download,
  cleanupStaleSyncV4Transfers,
  createApplySyncV4Download,
  discardSyncV4Transfer,
  freezeSyncV4Upload,
  getSyncV4HandshakeState,
  getPendingSyncV4Upload,
  getSyncV4UploadChunk,
  recordSyncV4Handshake,
  stageSyncV4Download,
  stageSyncV4DownloadChunk,
} from "./syncActions";
import { withSyncRequestTimeout } from "./syncRequestTimeout";
import {
  shouldRestartFrozenUpload,
  SyncRequestError,
} from "./syncRequestError";
import type { SyncConfig } from "./syncTypes";
import {
  isUnsupportedSyncVersionError,
  markSyncUpdateRequired,
  syncChannelName,
} from "./syncCompatibility";

const SYNC_POLL_INTERVAL_MS = 5000;
const SYNC_UPLOAD_TIMEOUT_MS = 30 * 60_000;
const SYNC_SESSION_STALE_MS = 24 * 60 * 60 * 1000;

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
  private applySyncV4Download: ReturnType<typeof createApplySyncV4Download>;

  private wsNotification = new State<number>(0);
  private forceSyncNotification = new State<number>(0);
  private wakeSyncLoop = () => {
    this.forceSync();
  };

  constructor(
    private syncDB: HyperDB,
    clientId: string,
    syncConfig: SyncConfig,
    private nextClock: HlcClock,
  ) {
    this.clientId = clientId;
    this.syncConfig = syncConfig;
    this.electionChannel = new BroadcastChannel(
      syncChannelName("election", clientId),
    );
    this.elector = createLeaderElection(this.electionChannel);
    this.applySyncV4Download = createApplySyncV4Download(nextClock);

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
      // Snapshot before the session so a local write or server notification
      // that arrives while syncV4 is running remains a pending wake-up.
      const wsVersion = this.wsNotification.get();
      const forceSyncVersion = this.forceSyncNotification.get();
      if (this.runId !== myRunId) {
        syncerLog("runId !== myRunId, stopping syncer loop");
        this.cleanupWebSocket();
        return;
      }
      try {
        syncerLog("running sync v4 session");
        await this.syncV4();
      } catch (e) {
        if (isUnsupportedSyncVersionError(e)) {
          this.stopForRequiredUpdate();
          return;
        }
        console.error(e);
      }

      await this.waitForNextSyncTrigger(wsVersion, forceSyncVersion);
    }
  }

  private async sha256(value: string) {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(value),
    );
    return [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  private async syncFetch<T>(path: string, init: RequestInit): Promise<T> {
    const token = authUtils.getToken();
    const response = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
    if (!response.ok) {
      throw new SyncRequestError(response.status, await response.text());
    }
    return (await response.json()) as T;
  }

  private syncV4BaseUrl() {
    return `/api/sync/v4/${encodeURIComponent(this.syncConfig.dbType)}/${encodeURIComponent(this.syncConfig.dbId)}`;
  }

  private async syncV4() {
    const baseUrl = this.syncV4BaseUrl();
    await asyncDispatch(
      this.syncDB.withTraits({ type: "skip-sync" }),
      cleanupStaleSyncV4Transfers({
        createdBefore: Date.now() - SYNC_SESSION_STALE_MS,
      }),
    );
    const pending = await asyncDispatch(
      this.syncDB,
      getPendingSyncV4Upload({}),
    );
    const resumingUpload = pending !== undefined;
    let uploadId: string;
    let snapshot: {
      throughCursor: { clock: string; changeId: string } | null;
      changeCount: number;
      chunkCount: number;
    };
    if (pending) {
      uploadId = pending.id;
      snapshot = {
        throughCursor:
          pending.throughClock && pending.throughChangeId
            ? { clock: pending.throughClock, changeId: pending.throughChangeId }
            : null,
        changeCount: pending.changeCount,
        chunkCount: pending.chunkCount,
      };
    } else {
      const state = await asyncDispatch(
        this.syncDB.withTraits({ type: "skip-sync" }),
        getSyncV4HandshakeState({}),
      );
      const session = await withSyncRequestTimeout(
        "sync-v4-session",
        (signal) =>
          this.syncFetch<SyncSessionResponse>(`${baseUrl}/sessions`, {
            method: "POST",
            signal,
            body: JSON.stringify({
              syncVersion: CURRENT_SYNC_VERSION,
              dbId: this.syncConfig.dbId,
              dbType: this.syncConfig.dbType,
              clientId: this.clientId,
              expectedAcceptedClientCursor: state.expectedAcceptedClientCursor,
              coveredClientCursor: state.coveredClientCursor,
              expectedAcknowledgedServerRevision:
                state.expectedAcknowledgedServerRevision,
              appliedServerRevision: state.appliedServerRevision,
            }),
          }),
      );
      this.nextClock.calibrate(session.serverTimeMs);
      uploadId = session.uploadId;
      await asyncDispatch(
        this.syncDB.withTraits({ type: "skip-sync" }),
        recordSyncV4Handshake({
          acceptedClientCursor: session.uploadFromCursor,
          acknowledgedServerRevision: session.serverAcknowledgedRevision,
        }),
      );
      snapshot = await asyncDispatch(
        this.syncDB.withTraits({ type: "skip-sync" }),
        freezeSyncV4Upload({
          uploadId,
          after: session.uploadFromCursor,
          registeredSyncableTableNameMap: this.syncConfig.tableNameMap,
          now: Date.now(),
        }),
      );
    }
    const chunkChecksums: string[] = [];
    for (let sequence = 0; sequence < snapshot.chunkCount; sequence += 1) {
      const localChunk = await asyncDispatch(
        this.syncDB,
        getSyncV4UploadChunk({ uploadId, sequence }),
      );
      if (!localChunk) throw new Error("Local sync upload is incomplete");
      const checksum = await this.sha256(localChunk.payload);
      chunkChecksums.push(checksum);
      try {
        await withSyncRequestTimeout(
          "sync-v4-upload-chunk",
          (signal) =>
            this.syncFetch(
              `${baseUrl}/sessions/${encodeURIComponent(uploadId)}/chunks/${sequence}`,
              {
                method: "PUT",
                signal,
                body: JSON.stringify({ checksum, payload: localChunk.payload }),
              },
            ),
          SYNC_UPLOAD_TIMEOUT_MS,
        );
      } catch (error) {
        if (shouldRestartFrozenUpload(resumingUpload, error)) {
          await asyncDispatch(
            this.syncDB.withTraits({ type: "skip-sync" }),
            discardSyncV4Transfer({ uploadId, downloadId: "" }),
          );
          this.forceSync();
          return;
        }
        throw error;
      }
    }
    const manifestChecksum = await this.sha256(chunkChecksums.join("\n"));
    let commit: SyncCommitResponse;
    try {
      commit = await withSyncRequestTimeout(
        "sync-v4-commit",
        (signal) =>
          this.syncFetch<SyncCommitResponse>(
            `${baseUrl}/sessions/${encodeURIComponent(uploadId)}/commit`,
            {
              method: "POST",
              signal,
              body: JSON.stringify({
                chunkCount: snapshot.chunkCount,
                changeCount: snapshot.changeCount,
                throughCursor: snapshot.throughCursor,
                checksum: manifestChecksum,
              }),
            },
          ),
        SYNC_UPLOAD_TIMEOUT_MS,
      );
    } catch (error) {
      if (shouldRestartFrozenUpload(resumingUpload, error)) {
        await asyncDispatch(
          this.syncDB.withTraits({ type: "skip-sync" }),
          discardSyncV4Transfer({ uploadId, downloadId: "" }),
        );
        this.forceSync();
        return;
      }
      throw error;
    }

    let localDownloadId: string;
    if (commit.download.type === "inline") {
      localDownloadId = `${uploadId}:inline`;
      const payload = JSON.stringify(commit.download.changesets);
      this.nextClock.observe(
        commit.download.changesets.flatMap((changeset) =>
          changeset.data.flatMap(({ change }) => observedChangeClocks(change)),
        ),
      );
      await asyncDispatch(
        this.syncDB.withTraits({ type: "skip-sync" }),
        stageSyncV4Download({
          downloadId: localDownloadId,
          serverRevision: commit.serverRevision,
          acceptedClientCursor: commit.acceptedClientCursor,
          chunks: [payload],
          now: Date.now(),
        }),
      );
    } else {
      const stagedDownload = commit.download;
      localDownloadId = stagedDownload.downloadId;
      const downloadChunkChecksums: string[] = [];
      await asyncDispatch(
        this.syncDB.withTraits({ type: "skip-sync" }),
        beginSyncV4Download({
          downloadId: localDownloadId,
          serverRevision: commit.serverRevision,
          acceptedClientCursor: commit.acceptedClientCursor,
          chunkCount: stagedDownload.chunkCount,
          now: Date.now(),
        }),
      );
      for (
        let sequence = 0;
        sequence < stagedDownload.chunkCount;
        sequence += 1
      ) {
        const chunk = await withSyncRequestTimeout(
          "sync-v4-download-chunk",
          (signal) =>
            this.syncFetch<{
              checksum: string;
              changesets: ChangesetArrayType;
            }>(
              `${baseUrl}/downloads/${encodeURIComponent(stagedDownload.downloadId)}/chunks/${sequence}`,
              { method: "GET", signal },
            ),
        );
        const payload = JSON.stringify(chunk.changesets);
        if ((await this.sha256(payload)) !== chunk.checksum) {
          throw new Error("Sync download chunk checksum mismatch");
        }
        downloadChunkChecksums.push(chunk.checksum);
        this.nextClock.observe(
          chunk.changesets.flatMap((changeset) =>
            changeset.data.flatMap(({ change }) =>
              observedChangeClocks(change),
            ),
          ),
        );
        await asyncDispatch(
          this.syncDB.withTraits({ type: "skip-sync" }),
          stageSyncV4DownloadChunk({
            downloadId: localDownloadId,
            sequence,
            payload,
          }),
        );
      }
      if (
        (await this.sha256(downloadChunkChecksums.join("\n"))) !==
        stagedDownload.checksum
      ) {
        throw new Error("Sync download manifest checksum mismatch");
      }
    }
    const applied = await asyncDispatch(
      this.syncDB.withTraits({ type: "skip-sync" }),
      this.applySyncV4Download({
        downloadId: localDownloadId,
        uploadId,
        registeredSyncableTableNameMap: this.syncConfig.tableNameMap,
        clientId: this.clientId,
      }),
    );
    if (!applied) {
      await asyncDispatch(
        this.syncDB.withTraits({ type: "skip-sync" }),
        discardSyncV4Transfer({
          uploadId,
          downloadId: localDownloadId,
        }),
      );
      return;
    }
    if (commit.download.type === "staged") {
      const downloadId = commit.download.downloadId;
      await withSyncRequestTimeout("sync-v4-download-ack", (signal) =>
        this.syncFetch(
          `${baseUrl}/downloads/${encodeURIComponent(downloadId)}/ack`,
          { method: "POST", body: "{}", signal },
        ),
      );
    }
  }

  private async waitForNextSyncTrigger(
    wsVersion: number,
    forceSyncVersion: number,
  ) {
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

      if (this.wsNotification.get() > wsVersion) {
        finish("ws");
      } else if (this.forceSyncNotification.get() > forceSyncVersion) {
        finish("local");
      }

      if (!settled && process.env.NODE_ENV !== "development") {
        timeoutId = setTimeout(() => finish("timeout"), SYNC_POLL_INTERVAL_MS);
      }
    });
  }
}
