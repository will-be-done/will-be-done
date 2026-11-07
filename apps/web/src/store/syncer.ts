import {
  Cause,
  Clock,
  type Context,
  Effect,
  Exit,
  Fiber,
  Match,
  Queue,
  type Scope,
  Stream,
} from "effect";
import { Digest } from "effect/crypto";
import { HttpClient, HttpClientRequest } from "effect/http";
import {
  CURRENT_SYNC_VERSION,
  observedChangeClocks,
  type ChangesetArrayType,
  type HlcClock,
  type SyncCommitResponse,
  type SyncSessionResponse,
} from "@will-be-done/slices/common";
import {
  AuthSession,
  PageEvents,
  ServerChanges,
  TabChannels,
  type ServerChangeEvent,
  type TabChannel,
  type TabLeadership,
} from "@/services/browser";
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
  syncFailureDetail,
  syncFailureMessage,
  SyncHttpError,
  SyncNetworkError,
  SyncProtocolError,
  SyncStorageError,
  SyncTimeoutError,
  type SyncError,
} from "./syncErrors";
import { Database } from "./database";
import type { SyncConfig } from "./syncTypes";
import { initialSyncStatus, type SyncStatus } from "./syncStatus";
import { markSyncUpdateRequired, syncChannelName } from "./syncCompatibility";

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

export type SyncerServices =
  | Database
  | Digest.Digest
  | HttpClient.HttpClient
  | AuthSession
  | ServerChanges
  | TabChannels
  | PageEvents;

const sha256 = (value: string) =>
  Effect.gen(function* () {
    const digest = yield* Digest.Digest;
    return yield* digest.digestHex(
      Digest.sha256,
      new TextEncoder().encode(value),
    );
  });

export class Syncer {
  readonly status = new State<SyncStatus>({ ...initialSyncStatus });
  private loop: Fiber.Fiber<unknown, unknown> | undefined;
  private terminal = false;
  private applySyncV4Download: ReturnType<typeof createApplySyncV4Download>;

  // A wake-up that arrives during a session stays queued, so the next session
  // starts as soon as this one ends.
  private wakes = Effect.runSync(Queue.sliding<void>(1));

  private constructor(
    private clientId: string,
    private syncConfig: SyncConfig,
    private nextClock: HlcClock,
    private services: Context.Context<SyncerServices>,
    private leadership: TabLeadership,
    private statusChannel: TabChannel<SyncStatusMessage>,
  ) {
    this.applySyncV4Download = createApplySyncV4Download(nextClock);
  }

  // Closing the scope stops the loop and releases the tab channels and page
  // listeners.
  static make(
    clientId: string,
    syncConfig: SyncConfig,
    nextClock: HlcClock,
  ): Effect.Effect<Syncer, never, SyncerServices | Scope.Scope> {
    return Effect.gen(function* () {
      const services = yield* Effect.context<SyncerServices>();
      const tabs = yield* TabChannels;
      const page = yield* PageEvents;
      const leadership = yield* tabs.leadership(
        syncChannelName("election", clientId),
      );
      const statusChannel = yield* tabs.channel<SyncStatusMessage>(
        syncChannelName("status", clientId),
      );
      const syncer = new Syncer(
        clientId,
        syncConfig,
        nextClock,
        services,
        leadership,
        statusChannel,
      );

      yield* statusChannel.listen((message) => syncer.receiveStatus(message));
      statusChannel.post({ type: "request-status" });
      yield* leadership.onDuplicate(() => syncer.restartAsDuplicate());
      yield* page.listen("document", "visibilitychange", () => {
        if (page.visibility() === "visible") syncer.forceSync();
      });
      yield* page.listen("window", "online", () => syncer.forceSync());
      yield* page.listen("window", "focus", () => syncer.forceSync());
      yield* Effect.addFinalizer(() =>
        Effect.suspend(() => {
          syncer.terminal = true;
          return syncer.loop ? Fiber.interrupt(syncer.loop) : Effect.void;
        }),
      );
      return syncer;
    });
  }

  startLoop() {
    void this.run();
  }

  // Starts a loop only after the previous one has fully stopped, so two
  // sessions never overlap. Resolves when the new loop stops.
  run(): Promise<void> {
    if (this.terminal) return Promise.resolve();
    const previous = this.loop;
    const loop = Effect.runFork(
      Effect.andThen(
        // Uninterruptible, so a later handoff cannot skip waiting for it.
        previous
          ? Effect.uninterruptible(Fiber.interrupt(previous))
          : Effect.void,
        this.syncLoop(),
      ).pipe(
        Effect.tapCause((cause) =>
          Cause.hasInterruptsOnly(cause)
            ? Effect.void
            : Effect.logError("Sync loop stopped", cause),
        ),
        Effect.annotateLogs(this.logAnnotations()),
        Effect.provide(this.services),
      ),
    );
    this.loop = loop;
    return Effect.runPromise(Fiber.await(loop)).then(() => undefined);
  }

  // Aborts in-flight requests; a local transaction already started finishes
  // first. The loop stays tracked so a later run() waits for it too.
  stop(): Promise<void> {
    return this.loop
      ? Effect.runPromise(Fiber.interrupt(this.loop))
      : Promise.resolve();
  }

  forceSync() {
    if (this.terminal) return;
    if (this.status.get().phase === "synced") {
      this.setStatus({ phase: "waiting", progress: null });
    }
    Queue.offerUnsafe(this.wakes, undefined);
    if (!this.leadership.isLeader()) {
      this.statusChannel.post({ type: "request-sync" });
    }
  }

  private receiveStatus(message: SyncStatusMessage) {
    if (message.type === "status") {
      if (!this.leadership.isLeader() && !this.terminal) {
        this.status.set(message.status);
      }
    } else if (this.leadership.isLeader()) {
      if (message.type === "request-sync") this.forceSync();
      this.broadcastStatus();
    }
  }

  private restartAsDuplicate() {
    if (this.terminal || !this.loop) return;
    Effect.runSync(
      Effect.logDebug("another tab also leads; restarting the sync loop").pipe(
        Effect.annotateLogs(this.logAnnotations()),
        Effect.provide(this.services),
      ),
    );
    void this.run();
  }

  private logAnnotations() {
    return { sync: `${this.syncConfig.dbType}:${this.syncConfig.dbId}` };
  }

  private broadcastStatus() {
    this.statusChannel.post({ type: "status", status: this.status.get() });
  }

  private setStatus(update: Partial<SyncStatus>) {
    if (this.terminal && update.phase !== "update-required") return;
    this.status.modify((status) => ({ ...status, ...update }));
    if (this.leadership.isLeader()) this.broadcastStatus();
  }

  private stopForRequiredUpdate() {
    if (this.terminal) return;
    this.terminal = true;
    this.setStatus({ phase: "update-required", progress: null, error: null });
    void this.stop();
    markSyncUpdateRequired();
  }

  private onServerChange = Match.type<ServerChangeEvent>().pipe(
    Match.tagsExhaustive({
      ChangesAvailable: () =>
        Effect.logDebug("server reported new changes").pipe(
          Effect.tap(
            Effect.sync(() => {
              if (this.status.get().phase === "synced") {
                this.setStatus({ phase: "waiting", progress: null });
              }
              Queue.offerUnsafe(this.wakes, undefined);
            }),
          ),
        ),
      UpdateRequired: () => Effect.sync(() => this.stopForRequiredUpdate()),
      Failed: ({ cause }) =>
        Effect.logError("Server change subscription failed", cause).pipe(
          Effect.tap(
            Effect.sync(() => Queue.offerUnsafe(this.wakes, undefined)),
          ),
        ),
    }),
  );

  private syncLoop() {
    return Effect.gen({ self: this }, function* () {
      if (!this.leadership.isLeader()) {
        yield* Effect.logInfo(
          "Waiting to lead sync; until then this tab shows the leading tab's status and errors are logged there",
        );
        yield* this.leadership.awaitLeadership;
      }
      yield* Effect.logInfo("This tab leads sync");
      const serverChanges = yield* ServerChanges;
      yield* serverChanges
        .watch({ dbId: this.syncConfig.dbId, dbType: this.syncConfig.dbType })
        .pipe(Stream.runForEach(this.onServerChange), Effect.forkScoped);

      // let's delay so faster startup
      yield* Effect.sleep(SYNC_START_DELAY_MS);

      while (true) {
        const userSyncVersion = completedUserSyncs.get();
        let spaceMissingOnServer = false;

        yield* Effect.logDebug("running sync v4 session");
        this.setStatus({ phase: "connecting", progress: null, error: null });
        const session = yield* Effect.exit(this.syncV4());
        if (Exit.isSuccess(session)) {
          const completed = session.value;
          const hasPendingWake = Queue.sizeUnsafe(this.wakes) > 0;
          this.setStatus({
            phase: !completed || hasPendingWake ? "waiting" : "synced",
            progress: null,
            ...(completed
              ? { lastSyncedAt: yield* Clock.currentTimeMillis }
              : {}),
          });
          yield* Effect.logDebug(
            completed ? "sync session finished" : "sync session paused",
          );
          if (completed && this.syncConfig.dbType === "user") {
            completedUserSyncs.modify((version) => version + 1);
          }
        } else {
          this.setStatus({
            phase: "error",
            progress: null,
            error: syncFailureMessage(session.cause),
          });
          yield* Effect.logError(
            `Sync session failed: ${syncFailureDetail(session.cause)}`,
            session.cause,
          );
          const error = Cause.findErrorOption(session.cause);
          spaceMissingOnServer =
            this.syncConfig.dbType === "space" &&
            error._tag === "Some" &&
            error.value._tag === "SyncHttpError" &&
            error.value.status === 404;
        }

        yield* this.waitForNextSyncTrigger(
          spaceMissingOnServer ? userSyncVersion : undefined,
        );
      }
    }).pipe(Effect.scoped);
  }

  // A started local transaction runs to completion even if the loop stops.
  // Durable before it returns; a started write is never cut short.
  private dispatch<T>(
    action: Generator<unknown, T, unknown>,
    options?: { readonly skipSync?: boolean },
  ) {
    return Effect.gen(function* () {
      const database = yield* Database;
      const result = yield* database.dispatch(action, options);
      yield* database.waitForPersistence;
      return result;
    }).pipe(
      Effect.uninterruptible,
      Effect.mapError((error) => new SyncStorageError({ cause: error.cause })),
    );
  }

  private dispatchSkipSync<T>(action: Generator<unknown, T, unknown>) {
    return this.dispatch(action, { skipSync: true });
  }

  private syncRequest<T>(
    name: string,
    request: HttpClientRequest.HttpClientRequest,
    timeoutMs = SYNC_REQUEST_TIMEOUT_MS,
  ) {
    return Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient;
      const token = yield* (yield* AuthSession).token;
      const startedAt = yield* Clock.currentTimeMillis;
      const response = yield* client.execute(
        token ? HttpClientRequest.bearerToken(request, token) : request,
      );
      yield* Effect.logDebug(
        `${name} ${request.method} ${request.url} -> ${response.status} in ${(yield* Clock.currentTimeMillis) - startedAt}ms`,
      );
      if (response.status < 200 || response.status >= 300) {
        return yield* new SyncHttpError({
          status: response.status,
          body: yield* response.text,
        });
      }
      return (yield* response.json) as T;
    }).pipe(
      Effect.catchTag("HttpClientError", (error) =>
        Effect.fail(
          error.reason._tag === "TransportError"
            ? new SyncNetworkError({ cause: error })
            : new SyncProtocolError({ reason: `${name}: ${error.message}` }),
        ),
      ),
      Effect.timeoutOrElse({
        duration: timeoutMs,
        orElse: () =>
          Effect.fail(new SyncTimeoutError({ request: name, timeoutMs })),
      }),
    );
  }

  private syncV4BaseUrl() {
    return `/api/sync/v4/${encodeURIComponent(this.syncConfig.dbType)}/${encodeURIComponent(this.syncConfig.dbId)}`;
  }

  private syncV4() {
    return Effect.gen({ self: this }, function* () {
      const baseUrl = this.syncV4BaseUrl();
      yield* this.dispatchSkipSync(
        cleanupStaleSyncV4Transfers({
          createdBefore:
            (yield* Clock.currentTimeMillis) - SYNC_SESSION_STALE_MS,
        }),
      );
      const pending = yield* this.dispatch(getPendingSyncV4Upload({}));
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
        const state = yield* this.dispatchSkipSync(getSyncV4HandshakeState({}));
        const session = yield* this.syncRequest<SyncSessionResponse>(
          "sync-v4-session",
          HttpClientRequest.bodyJsonUnsafe(
            HttpClientRequest.post(`${baseUrl}/sessions`),
            {
              syncVersion: CURRENT_SYNC_VERSION,
              dbId: this.syncConfig.dbId,
              dbType: this.syncConfig.dbType,
              clientId: this.clientId,
              expectedAcceptedClientCursor: state.expectedAcceptedClientCursor,
              coveredClientCursor: state.coveredClientCursor,
              expectedAcknowledgedServerRevision:
                state.expectedAcknowledgedServerRevision,
              appliedServerRevision: state.appliedServerRevision,
            },
          ),
        );
        this.nextClock.calibrate(session.serverTimeMs);
        uploadId = session.uploadId;
        yield* this.dispatchSkipSync(
          recordSyncV4Handshake({
            acceptedClientCursor: session.uploadFromCursor,
            acknowledgedServerRevision: session.serverAcknowledgedRevision,
          }),
        );
        this.setStatus({ phase: "preparing" });
        snapshot = yield* this.dispatchSkipSync(
          freezeSyncV4Upload({
            uploadId,
            after: session.uploadFromCursor,
            registeredSyncableTableNameMap: this.syncConfig.tableNameMap,
            now: yield* Clock.currentTimeMillis,
          }),
        );
      }
      // Yields undefined after discarding an upload the server can no longer
      // accept; a fresh session then freezes the current local changes.
      const restartIfFrozenUploadIsStale = <A, R>(
        request: Effect.Effect<A, SyncError, R>,
      ) =>
        request.pipe(
          Effect.catchIf(
            (error) => shouldRestartFrozenUpload(resumingUpload, error),
            () =>
              this.dispatchSkipSync(
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
          this.syncRequest(
            "sync-v4-upload-chunk",
            HttpClientRequest.bodyJsonUnsafe(
              HttpClientRequest.put(
                `${baseUrl}/sessions/${encodeURIComponent(uploadId)}/chunks/${sequence}`,
              ),
              { checksum, payload: localChunk.payload },
            ),
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
        this.syncRequest<SyncCommitResponse>(
          "sync-v4-commit",
          HttpClientRequest.bodyJsonUnsafe(
            HttpClientRequest.post(
              `${baseUrl}/sessions/${encodeURIComponent(uploadId)}/commit`,
            ),
            {
              chunkCount: snapshot.chunkCount,
              changeCount: snapshot.changeCount,
              throughCursor: snapshot.throughCursor,
              checksum: manifestChecksum,
            },
          ),
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
        yield* this.dispatchSkipSync(
          stageSyncV4Download({
            downloadId: localDownloadId,
            serverRevision: commit.serverRevision,
            acceptedClientCursor: commit.acceptedClientCursor,
            chunks: [payload],
            now: yield* Clock.currentTimeMillis,
          }),
        );
      } else {
        const stagedDownload = commit.download;
        localDownloadId = stagedDownload.downloadId;
        const downloadChunkChecksums: string[] = [];
        this.setStatus({
          progress: { completed: 0, total: stagedDownload.chunkCount },
        });
        yield* this.dispatchSkipSync(
          beginSyncV4Download({
            downloadId: localDownloadId,
            serverRevision: commit.serverRevision,
            acceptedClientCursor: commit.acceptedClientCursor,
            chunkCount: stagedDownload.chunkCount,
            now: yield* Clock.currentTimeMillis,
          }),
        );
        for (
          let sequence = 0;
          sequence < stagedDownload.chunkCount;
          sequence += 1
        ) {
          const chunk = yield* this.syncRequest<{
            checksum: string;
            changesets: ChangesetArrayType;
          }>(
            "sync-v4-download-chunk",
            HttpClientRequest.get(
              `${baseUrl}/downloads/${encodeURIComponent(stagedDownload.downloadId)}/chunks/${sequence}`,
            ),
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
          yield* this.dispatchSkipSync(
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
      const applied = yield* this.dispatchSkipSync(
        this.applySyncV4Download({
          downloadId: localDownloadId,
          uploadId,
          registeredSyncableTableNameMap: this.syncConfig.tableNameMap,
          clientId: this.clientId,
        }),
      );
      if (!applied) {
        yield* this.dispatchSkipSync(
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
        yield* this.syncRequest(
          "sync-v4-download-ack",
          HttpClientRequest.bodyJsonUnsafe(
            HttpClientRequest.post(
              `${baseUrl}/downloads/${encodeURIComponent(downloadId)}/ack`,
            ),
            {},
          ),
        );
      }
      return true;
    });
  }

  private waitForNextSyncTrigger(userSyncVersion?: number) {
    const triggers: Effect.Effect<unknown>[] = [Queue.take(this.wakes)];
    if (userSyncVersion !== undefined) {
      triggers.push(
        completedUserSyncs.waitFor((version) => version > userSyncVersion),
      );
    }
    if (process.env.NODE_ENV !== "development") {
      triggers.push(Effect.sleep(SYNC_POLL_INTERVAL_MS));
    }
    return Effect.raceAll(triggers);
  }
}
