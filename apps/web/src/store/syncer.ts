import { asyncDispatch, execAsync, type HyperDB } from "@will-be-done/hyperdb";
import { Cause, Effect, Exit, Fiber } from "effect";
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
import {
  shouldRestartFrozenUpload,
  syncFailureMessage,
  SyncHttpError,
  SyncNetworkError,
  SyncProtocolError,
  SyncStorageError,
  SyncTimeoutError,
  type SyncError,
} from "./syncErrors";
import type { SyncConfig } from "./syncTypes";
import { initialSyncStatus, type SyncStatus } from "./syncStatus";
import {
  isUnsupportedSyncVersionError,
  markSyncUpdateRequired,
  syncChannelName,
} from "./syncCompatibility";

const SYNC_POLL_INTERVAL_MS = 60000;
const SYNC_START_DELAY_MS = 2000;
const SYNC_REQUEST_TIMEOUT_MS = 5 * 60_000;
const SYNC_UPLOAD_TIMEOUT_MS = 30 * 60_000;
const SYNC_SESSION_STALE_MS = 24 * 60 * 60 * 1000;

// A space created moments ago reaches the server with the next user sync.
const completedUserSyncs = new State(0);

type SyncStatusMessage =
  | { type: "request-status" }
  | { type: "request-sync" }
  | { type: "status"; status: SyncStatus };

const syncerLogsEnabled = () =>
  getDevtoolsEnabled() || process.env.NODE_ENV === "development";

const syncerLog = (...args: Parameters<typeof console.log>) => {
  if (syncerLogsEnabled()) {
    console.log(...args);
  }
};

const waitForVersionAfter = (state: State<number>, version: number) =>
  Effect.callback<void>((resume) => {
    const unsubscribe = state.subscribe((current, unsubscribeNow) => {
      if (current > version) {
        unsubscribeNow();
        // Resuming synchronously would run the loop inside the waker's stack.
        queueMicrotask(() => resume(Effect.void));
      }
    }, true);
    return Effect.sync(unsubscribe);
  });

const sha256 = (value: string) =>
  Effect.promise(async () => {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(value),
    );
    return [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  });

export class Syncer {
  readonly status = new State<SyncStatus>({ ...initialSyncStatus });
  private electionChannel: BroadcastChannel;
  private statusChannel: BroadcastChannel<SyncStatusMessage>;
  private elector: LeaderElector;
  private loop: Fiber.Fiber<unknown, unknown> | undefined;
  private terminal = false;
  private clientId: string;
  private syncConfig: SyncConfig;
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
    this.statusChannel = new BroadcastChannel(
      syncChannelName("status", clientId),
    );
    this.statusChannel.onmessage = (message) => {
      if (message.type === "status") {
        if (!this.elector.isLeader && !this.terminal) {
          this.status.set(message.status);
        }
      } else if (this.elector.isLeader) {
        if (message.type === "request-sync") this.forceSync();
        this.broadcastStatus();
      }
    };
    void this.statusChannel.postMessage({ type: "request-status" });
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
      void this.run();
    };

    void this.run();
  }

  // Starts a loop only after the previous one has fully stopped, so two
  // sessions never overlap. Resolves when the new loop stops.
  run(): Promise<void> {
    if (this.terminal) return Promise.resolve();
    const previous = this.loop;
    const loop = Effect.runFork(
      Effect.andThen(
        previous ? Fiber.interrupt(previous) : Effect.void,
        this.syncLoop(),
      ),
    );
    this.loop = loop;
    return Effect.runPromise(Fiber.await(loop)).then((exit) => {
      if (Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause)) {
        console.error(Cause.squash(exit.cause));
      }
    });
  }

  // Aborts in-flight requests; a local transaction already started finishes first.
  stop(): Promise<void> {
    const loop = this.loop;
    this.loop = undefined;
    return loop ? Effect.runPromise(Fiber.interrupt(loop)) : Promise.resolve();
  }

  forceSync() {
    if (this.terminal) return;
    if (this.status.get().phase === "synced") {
      this.setStatus({ phase: "waiting", progress: null });
    }
    this.forceSyncNotification.modify((version) => version + 1);
    if (!this.elector.isLeader) {
      void this.statusChannel.postMessage({ type: "request-sync" });
    }
  }

  private broadcastStatus() {
    void this.statusChannel.postMessage({
      type: "status",
      status: this.status.get(),
    });
  }

  private setStatus(update: Partial<SyncStatus>) {
    if (this.terminal && update.phase !== "update-required") return;
    this.status.modify((status) => ({ ...status, ...update }));
    if (this.elector.isLeader) this.broadcastStatus();
  }

  private stopForRequiredUpdate() {
    if (this.terminal) return;
    this.terminal = true;
    this.setStatus({ phase: "update-required", progress: null, error: null });
    void this.stop();
    markSyncUpdateRequired();
  }

  private serverChangeSubscription() {
    return Effect.acquireRelease(
      Effect.sync(() =>
        trpcClient.onChangesAvailable.subscribe(
          {
            dbId: this.syncConfig.dbId,
            dbType: this.syncConfig.dbType,
            syncVersion: CURRENT_SYNC_VERSION,
          },
          {
            onData: () => {
              syncerLog("WebSocket notification received");
              if (this.status.get().phase === "synced") {
                this.setStatus({ phase: "waiting", progress: null });
              }
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
        ),
      ),
      (subscription) => Effect.sync(() => subscription.unsubscribe()),
    );
  }

  private syncLoop() {
    return Effect.gen({ self: this }, function* () {
      yield* Effect.promise(() => this.elector.awaitLeadership());
      yield* this.serverChangeSubscription();

      // let's delay so faster startup
      yield* Effect.sleep(SYNC_START_DELAY_MS);

      while (true) {
        // Snapshot before the session so a local write or server notification
        // that arrives while syncV4 is running remains a pending wake-up.
        const wsVersion = this.wsNotification.get();
        const forceSyncVersion = this.forceSyncNotification.get();
        const userSyncVersion = completedUserSyncs.get();
        let spaceMissingOnServer = false;

        syncerLog("running sync v4 session");
        this.setStatus({ phase: "connecting", progress: null, error: null });
        const session = yield* Effect.exit(this.syncV4());
        if (Exit.isSuccess(session)) {
          const completed = session.value;
          const hasPendingWake =
            this.wsNotification.get() > wsVersion ||
            this.forceSyncNotification.get() > forceSyncVersion;
          this.setStatus({
            phase: !completed || hasPendingWake ? "waiting" : "synced",
            progress: null,
            ...(completed ? { lastSyncedAt: Date.now() } : {}),
          });
          if (completed && this.syncConfig.dbType === "user") {
            completedUserSyncs.modify((version) => version + 1);
          }
        } else {
          this.setStatus({
            phase: "error",
            progress: null,
            error: syncFailureMessage(session.cause),
          });
          console.error(Cause.squash(session.cause));
          const error = Cause.findErrorOption(session.cause);
          spaceMissingOnServer =
            this.syncConfig.dbType === "space" &&
            error._tag === "Some" &&
            error.value._tag === "SyncHttpError" &&
            error.value.status === 404;
        }

        yield* this.waitForNextSyncTrigger(
          wsVersion,
          forceSyncVersion,
          spaceMissingOnServer ? userSyncVersion : undefined,
        );
      }
    }).pipe(Effect.scoped);
  }

  // A started local transaction runs to completion even if the loop stops.
  private dispatch<T>(db: HyperDB, action: Generator<unknown, T, unknown>) {
    return Effect.tryPromise({
      try: async () => {
        const result = await asyncDispatch(db, action);
        if (this.syncDB.waitForPersistence)
          await execAsync(this.syncDB.waitForPersistence());
        return result;
      },
      catch: (cause) => new SyncStorageError({ cause }),
    }).pipe(Effect.uninterruptible);
  }

  private syncFetch<T>(
    request: string,
    path: string,
    init: RequestInit,
    timeoutMs = SYNC_REQUEST_TIMEOUT_MS,
  ) {
    return Effect.gen(function* () {
      const token = authUtils.getToken();
      const response = yield* Effect.tryPromise({
        try: (signal) =>
          fetch(path, {
            ...init,
            signal,
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
              ...init.headers,
            },
          }),
        catch: (cause) => new SyncNetworkError({ cause }),
      });
      if (!response.ok) {
        const body = yield* Effect.tryPromise({
          try: () => response.text(),
          catch: (cause) => new SyncNetworkError({ cause }),
        });
        return yield* new SyncHttpError({ status: response.status, body });
      }
      return yield* Effect.tryPromise({
        try: () => response.json() as Promise<T>,
        catch: () =>
          new SyncProtocolError({ reason: `${request} returned invalid JSON` }),
      });
    }).pipe(
      Effect.timeoutOrElse({
        duration: timeoutMs,
        orElse: () => Effect.fail(new SyncTimeoutError({ request, timeoutMs })),
      }),
    );
  }

  private syncV4BaseUrl() {
    return `/api/sync/v4/${encodeURIComponent(this.syncConfig.dbType)}/${encodeURIComponent(this.syncConfig.dbId)}`;
  }

  private syncV4() {
    return Effect.gen({ self: this }, function* () {
      const baseUrl = this.syncV4BaseUrl();
      yield* this.dispatch(
        this.syncDB.withTraits({ type: "skip-sync" }),
        cleanupStaleSyncV4Transfers({
          createdBefore: Date.now() - SYNC_SESSION_STALE_MS,
        }),
      );
      const pending = yield* this.dispatch(
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
              ? {
                  clock: pending.throughClock,
                  changeId: pending.throughChangeId,
                }
              : null,
          changeCount: pending.changeCount,
          chunkCount: pending.chunkCount,
        };
      } else {
        const state = yield* this.dispatch(
          this.syncDB.withTraits({ type: "skip-sync" }),
          getSyncV4HandshakeState({}),
        );
        const session = yield* this.syncFetch<SyncSessionResponse>(
          "sync-v4-session",
          `${baseUrl}/sessions`,
          {
            method: "POST",
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
          },
        );
        this.nextClock.calibrate(session.serverTimeMs);
        uploadId = session.uploadId;
        yield* this.dispatch(
          this.syncDB.withTraits({ type: "skip-sync" }),
          recordSyncV4Handshake({
            acceptedClientCursor: session.uploadFromCursor,
            acknowledgedServerRevision: session.serverAcknowledgedRevision,
          }),
        );
        this.setStatus({ phase: "preparing" });
        snapshot = yield* this.dispatch(
          this.syncDB.withTraits({ type: "skip-sync" }),
          freezeSyncV4Upload({
            uploadId,
            after: session.uploadFromCursor,
            registeredSyncableTableNameMap: this.syncConfig.tableNameMap,
            now: Date.now(),
          }),
        );
      }
      // Yields undefined after discarding an upload the server can no longer
      // accept; a fresh session then freezes the current local changes.
      const restartIfFrozenUploadIsStale = <A>(
        request: Effect.Effect<A, SyncError>,
      ) =>
        request.pipe(
          Effect.catchIf(
            (error) => shouldRestartFrozenUpload(resumingUpload, error),
            () =>
              this.dispatch(
                this.syncDB.withTraits({ type: "skip-sync" }),
                discardSyncV4Transfer({ uploadId, downloadId: "" }),
              ).pipe(
                Effect.tap(Effect.sync(() => this.forceSync())),
                Effect.as(undefined),
              ),
          ),
        );

      this.setStatus({
        phase: "uploading",
        progress: { completed: 0, total: snapshot.chunkCount },
      });
      const chunkChecksums: string[] = [];
      for (let sequence = 0; sequence < snapshot.chunkCount; sequence += 1) {
        const localChunk = yield* this.dispatch(
          this.syncDB,
          getSyncV4UploadChunk({ uploadId, sequence }),
        );
        if (!localChunk) {
          return yield* new SyncStorageError({
            cause: "Local sync upload is incomplete",
          });
        }
        const checksum = yield* sha256(localChunk.payload);
        chunkChecksums.push(checksum);
        const uploaded = yield* restartIfFrozenUploadIsStale(
          this.syncFetch(
            "sync-v4-upload-chunk",
            `${baseUrl}/sessions/${encodeURIComponent(uploadId)}/chunks/${sequence}`,
            {
              method: "PUT",
              body: JSON.stringify({ checksum, payload: localChunk.payload }),
            },
            SYNC_UPLOAD_TIMEOUT_MS,
          ).pipe(Effect.as(true)),
        );
        if (!uploaded) return false;
        this.setStatus({
          progress: { completed: sequence + 1, total: snapshot.chunkCount },
        });
      }
      this.setStatus({ phase: "committing", progress: null });
      const manifestChecksum = yield* sha256(chunkChecksums.join("\n"));
      const commit = yield* restartIfFrozenUploadIsStale(
        this.syncFetch<SyncCommitResponse>(
          "sync-v4-commit",
          `${baseUrl}/sessions/${encodeURIComponent(uploadId)}/commit`,
          {
            method: "POST",
            body: JSON.stringify({
              chunkCount: snapshot.chunkCount,
              changeCount: snapshot.changeCount,
              throughCursor: snapshot.throughCursor,
              checksum: manifestChecksum,
            }),
          },
          SYNC_UPLOAD_TIMEOUT_MS,
        ),
      );
      if (!commit) return false;

      let localDownloadId: string;
      this.setStatus({ phase: "downloading", progress: null });
      if (commit.download.type === "inline") {
        localDownloadId = `${uploadId}:inline`;
        const payload = JSON.stringify(commit.download.changesets);
        this.nextClock.observe(
          commit.download.changesets.flatMap((changeset) =>
            changeset.data.flatMap(({ change }) =>
              observedChangeClocks(change),
            ),
          ),
        );
        yield* this.dispatch(
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
        this.setStatus({
          progress: { completed: 0, total: stagedDownload.chunkCount },
        });
        yield* this.dispatch(
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
          const chunk = yield* this.syncFetch<{
            checksum: string;
            changesets: ChangesetArrayType;
          }>(
            "sync-v4-download-chunk",
            `${baseUrl}/downloads/${encodeURIComponent(stagedDownload.downloadId)}/chunks/${sequence}`,
            { method: "GET" },
          );
          const payload = JSON.stringify(chunk.changesets);
          if ((yield* sha256(payload)) !== chunk.checksum) {
            return yield* new SyncProtocolError({
              reason: "Sync download chunk checksum mismatch",
            });
          }
          downloadChunkChecksums.push(chunk.checksum);
          this.nextClock.observe(
            chunk.changesets.flatMap((changeset) =>
              changeset.data.flatMap(({ change }) =>
                observedChangeClocks(change),
              ),
            ),
          );
          yield* this.dispatch(
            this.syncDB.withTraits({ type: "skip-sync" }),
            stageSyncV4DownloadChunk({
              downloadId: localDownloadId,
              sequence,
              payload,
            }),
          );
          this.setStatus({
            progress: {
              completed: sequence + 1,
              total: stagedDownload.chunkCount,
            },
          });
        }
        if (
          (yield* sha256(downloadChunkChecksums.join("\n"))) !==
          stagedDownload.checksum
        ) {
          return yield* new SyncProtocolError({
            reason: "Sync download manifest checksum mismatch",
          });
        }
      }
      this.setStatus({ phase: "applying", progress: null });
      const applied = yield* this.dispatch(
        this.syncDB.withTraits({ type: "skip-sync" }),
        this.applySyncV4Download({
          downloadId: localDownloadId,
          uploadId,
          registeredSyncableTableNameMap: this.syncConfig.tableNameMap,
          clientId: this.clientId,
        }),
      );
      if (!applied) {
        yield* this.dispatch(
          this.syncDB.withTraits({ type: "skip-sync" }),
          discardSyncV4Transfer({
            uploadId,
            downloadId: localDownloadId,
          }),
        );
        this.forceSync();
        return false;
      }
      if (commit.download.type === "staged") {
        const downloadId = commit.download.downloadId;
        yield* this.syncFetch(
          "sync-v4-download-ack",
          `${baseUrl}/downloads/${encodeURIComponent(downloadId)}/ack`,
          { method: "POST", body: "{}" },
        );
      }
      return true;
    });
  }

  private waitForNextSyncTrigger(
    wsVersion: number,
    forceSyncVersion: number,
    userSyncVersion?: number,
  ) {
    const triggers = [
      waitForVersionAfter(this.wsNotification, wsVersion),
      waitForVersionAfter(this.forceSyncNotification, forceSyncVersion),
    ];
    if (userSyncVersion !== undefined) {
      triggers.push(waitForVersionAfter(completedUserSyncs, userSyncVersion));
    }
    if (process.env.NODE_ENV !== "development") {
      triggers.push(Effect.sleep(SYNC_POLL_INTERVAL_MS));
    }
    return Effect.raceAll(triggers);
  }
}
