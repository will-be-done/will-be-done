import type { HyperDB } from "@will-be-done/hyperdb";
import {
  allAttachments,
  attachmentById,
  attachmentRowStates,
  attachmentsByIds,
  attachmentsTable,
  type Attachment,
  type AttachmentParentType,
  createAttachment,
  MAX_ATTACHMENT_SIZE,
} from "@will-be-done/slices/space";
import {
  Clock,
  Data,
  Effect,
  FiberSet,
  Match,
  Queue,
  type Scope,
  Stream,
} from "effect";
import { Digest } from "effect/crypto";
import { HttpBody, HttpClient, HttpClientRequest } from "effect/http";
import {
  AuthSession,
  PageEvents,
  TabChannels,
  type TabLeadership,
} from "@/services/browser";
import { State } from "@/utils/State";
import { Database, type DatabaseError } from "../database";
import type { SyncStatus } from "../syncStatus";
import type { AttachmentBlobStore, BlobStoreError } from "./blobStore";

// Asks the browser not to evict downloaded files under storage pressure.
const persistStorage = Effect.suspend(() => {
  const persist = globalThis.navigator?.storage?.persist;
  if (!persist) return Effect.void;
  return Effect.tryPromise(() => persist.call(navigator.storage)).pipe(
    Effect.ignore,
  );
});

export type TransferProgress = {
  files: number;
  bytesDone: number;
  bytesTotal: number;
};

export type AttachmentTransferStatus = {
  uploading: TransferProgress;
  downloading: TransferProgress;
  error: string | null;
  // Downloads stopped for the session; files open from the server instead.
  storageFull: boolean;
};

const idleProgress: TransferProgress = {
  files: 0,
  bytesDone: 0,
  bytesTotal: 0,
};
export const idleTransferStatus: AttachmentTransferStatus = {
  uploading: idleProgress,
  downloading: idleProgress,
  error: null,
  storageFull: false,
};

type Kind = "upload" | "download";
type Job = {
  kind: Kind;
  attachment: Attachment;
  loaded: number;
  // Completed syncs when the transfer started.
  syncRound?: number;
};
type Message =
  | { type: "status"; status: AttachmentTransferStatus }
  | { type: "request-status" }
  | { type: "stored"; id: string }
  | { type: "want"; id: string }
  | { type: "kick" };

const CONCURRENCY = 3;
// The server may lack bytes another device has not uploaded yet.
const MISSING_RETRY_MS = 60_000;
const MAX_RETRY_MS = 60 * 60_000;
const STATUS_THROTTLE_MS = 200;

class AttachmentHttpError extends Data.TaggedError("AttachmentHttpError")<{
  readonly status: number;
}> {}

class AttachmentNetworkError extends Data.TaggedError(
  "AttachmentNetworkError",
)<{ readonly cause: unknown }> {}

export class AttachmentTooLargeError extends Data.TaggedError(
  "AttachmentTooLargeError",
)<{ readonly message: string }> {}

export class AttachmentFileReadError extends Data.TaggedError(
  "AttachmentFileReadError",
)<{ readonly cause: unknown }> {}

type TransferError =
  | AttachmentHttpError
  | AttachmentNetworkError
  | BlobStoreError;

export type AttachmentAddError =
  | AttachmentTooLargeError
  | AttachmentFileReadError
  | BlobStoreError
  | DatabaseError;

export type AttachmentTransferServices =
  | Database
  | TabChannels
  | PageEvents
  | AuthSession
  | HttpClient.HttpClient
  | Digest.Digest;

const send = (request: HttpClientRequest.HttpClientRequest) =>
  Effect.gen(function* () {
    const token = yield* (yield* AuthSession).token;
    const response = yield* (yield* HttpClient.HttpClient).execute(
      token ? HttpClientRequest.bearerToken(request, token) : request,
    );
    if (response.status < 200 || response.status >= 300) {
      return yield* new AttachmentHttpError({ status: response.status });
    }
    return response;
  });

// Its effects already carry the store's services.
export type AttachmentTransfers = {
  readonly status: State<AttachmentTransferStatus>;
  readonly add: (
    file: File,
    parent?: { parentType: AttachmentParentType; parentId: string },
  ) => Effect.Effect<Attachment, AttachmentAddError>;
  // Missing bytes jump to the front of the queue.
  readonly getBlob: (
    id: string,
  ) => Effect.Effect<Blob | undefined, TransferError | DatabaseError>;
  // For exports: this device's copy, or the server's when it has none.
  readonly readBlob: (
    attachment: Attachment,
  ) => Effect.Effect<Blob | undefined, TransferError>;
  // For restores: the bytes upload again, since the server may not have them.
  // Keeps a local copy over the given bytes, and skips bytes that do not
  // match the row.
  readonly importBlob: (
    attachment: Pick<Attachment, "id" | "size" | "sha256">,
    blob: Blob,
  ) => Effect.Effect<boolean, BlobStoreError | AttachmentFileReadError>;
  // Drops local bytes of files that have no row, after a failed restore.
  readonly discardUnlistedBlobs: (
    ids: readonly string[],
  ) => Effect.Effect<void, BlobStoreError | DatabaseError>;
  // Synchronous, for React subscriptions.
  readonly subscribeBlob: (id: string, listener: () => void) => () => void;
};

export const attachmentTransfersByDB = new WeakMap<
  HyperDB,
  AttachmentTransfers
>();

// Keeps every file of a space on this device and on the server. One tab per
// space moves bytes; the others follow its status over a tab channel. Closing
// the scope stops transfers in flight.
export const makeAttachmentTransfers = ({
  dbName,
  spaceId,
  syncEnabled,
  syncStatus,
  store,
}: {
  dbName: string;
  spaceId: string;
  syncEnabled: boolean;
  syncStatus: State<SyncStatus>;
  store: AttachmentBlobStore;
}): Effect.Effect<
  AttachmentTransfers,
  never,
  AttachmentTransferServices | Scope.Scope
> =>
  Effect.gen(function* () {
    const services = yield* Effect.context<AttachmentTransferServices>();
    const provide = Effect.provideContext(services);
    const database = yield* Database;
    const tabs = yield* TabChannels;
    const channel = yield* tabs.channel<Message>(`attachments-${dbName}`);
    const leadership: TabLeadership | undefined = syncEnabled
      ? yield* tabs.leadership(`attachments-election-${dbName}`)
      : undefined;
    const isLeader = () => leadership?.isLeader() ?? false;
    const runJob = yield* FiberSet.makeRuntime<AttachmentTransferServices>();
    // A wake-up during a pass stays queued, so another pass follows it.
    const wakes = yield* Queue.sliding<void>(1);
    const statusChanges = yield* Queue.sliding<void>(1);

    const status = new State<AttachmentTransferStatus>(idleTransferStatus);
    const listeners = new Map<string, Set<() => void>>();
    let queue = new Map<string, Job>();
    const running = new Map<string, Job>();
    let batch = {
      upload: { files: 0, bytes: 0 },
      download: { files: 0, bytes: 0 },
    };
    const retryAt = new Map<string, number>();
    const awaitingSync = new Set<string>();
    const attempts = new Map<string, number>();
    let syncRound = 0;
    const failed = new Set<string>();
    let storageFull = false;
    // Per file, so one file transferring never hides another's failure.
    const errors = new Map<string, string>();
    let cleanedOrphans = false;
    let nextWakeAt: number | undefined;

    const url = (id: string) =>
      `/api/v1/spaces/${encodeURIComponent(spaceId)}/attachments/${encodeURIComponent(id)}/content`;

    const notify = (id: string) => {
      for (const listener of listeners.get(id) ?? []) listener();
    };

    const broadcastStatus = () => {
      if (isLeader()) channel.post({ type: "status", status: status.get() });
    };

    const progress = (kind: Kind): TransferProgress => {
      const active = [...queue.values(), ...running.values()].filter(
        (job) => job.kind === kind,
      );
      const remainingBytes = active.reduce(
        (sum, job) => sum + job.attachment.size - job.loaded,
        0,
      );
      return {
        files: active.length,
        bytesTotal: batch[kind].bytes,
        bytesDone: Math.max(0, batch[kind].bytes - remainingBytes),
      };
    };

    const statusChanged = () => Queue.offerUnsafe(statusChanges, undefined);

    const kick = () => {
      if (isLeader()) Queue.offerUnsafe(wakes, undefined);
      else channel.post({ type: "kick" });
    };

    const enqueue = (kind: Kind, attachment: Attachment) => {
      queue.set(attachment.id, { kind, attachment, loaded: 0 });
      batch[kind].files++;
      batch[kind].bytes += attachment.size;
    };

    const want = (id: string) => {
      const job = queue.get(id);
      if (job) {
        queue = new Map([[id, job], ...queue]);
        return;
      }
      retryAt.delete(id);
      Queue.offerUnsafe(wakes, undefined);
    };

    // Has the leading tab transfer this file next.
    const requestDownload = (id: string) => {
      if (isLeader()) want(id);
      else channel.post({ type: "want", id });
    };

    // The server's copy, or nothing while no device has uploaded it.
    const remoteBlob = (attachment: Attachment) =>
      send(HttpClientRequest.get(url(attachment.id))).pipe(
        Effect.flatMap((response) => response.arrayBuffer),
        Effect.catchTag("HttpClientError", (cause) =>
          Effect.fail(new AttachmentNetworkError({ cause })),
        ),
        Effect.map((bytes) => new Blob([bytes], { type: attachment.mimeType })),
        Effect.catchTag("AttachmentHttpError", (failure) =>
          failure.status === 404
            ? Effect.succeed(undefined)
            : Effect.fail(failure),
        ),
      );

    const upload = (job: Job) =>
      Effect.gen(function* () {
        const { id } = job.attachment;
        const blob = yield* store.get(id);
        if (!blob) return;
        yield* send(
          HttpClientRequest.put(url(id)).pipe(
            HttpClientRequest.setBody(
              HttpBody.raw(blob, {
                contentType: "application/octet-stream",
                contentLength: blob.size,
              }),
            ),
          ),
        );
        yield* store.markUploaded(id);
        job.loaded = job.attachment.size;
      });

    const download = (job: Job) =>
      Effect.gen(function* () {
        const { id, mimeType } = job.attachment;
        const response = yield* send(HttpClientRequest.get(url(id)));
        const chunks: Uint8Array<ArrayBuffer>[] = [];
        yield* Stream.runForEach(response.stream, (chunk) =>
          Effect.sync(() => {
            chunks.push(chunk as Uint8Array<ArrayBuffer>);
            job.loaded += chunk.byteLength;
            statusChanged();
          }),
        );
        yield* store.put(id, new Blob(chunks, { type: mimeType }), {
          uploaded: true,
        });
        notify(id);
        channel.post({ type: "stored", id });
      });

    const failureMessage = (job: Job) =>
      Match.type<TransferError>().pipe(
        Match.tagsExhaustive({
          AttachmentHttpError: ({ status }) =>
            status === 401 || status === 403
              ? "Sign in again to transfer files."
              : `Some files could not ${job.kind}. They will retry automatically.`,
          AttachmentNetworkError: () =>
            "Could not reach the server. Files will transfer when you reconnect.",
          AttachmentStorageFullError: () =>
            "This device is out of storage, so some files stay on the server.",
          AttachmentBlobStoreError: () =>
            `Some files could not ${job.kind}. They will retry automatically.`,
        }),
      );

    const onFailure = (job: Job, failure: TransferError) =>
      Effect.gen(function* () {
        const { id } = job.attachment;
        if (failure._tag === "AttachmentHttpError" && failure.status === 404) {
          // An upload waits for its row to sync; a download for another
          // device to upload the bytes.
          if (job.kind === "upload") {
            // A sync that completed meanwhile may have delivered the row.
            if (job.syncRound !== syncRound) {
              enqueue("upload", job.attachment);
              return;
            }
            awaitingSync.add(id);
          }
        } else {
          errors.set(id, failureMessage(job)(failure));
        }
        if (
          failure._tag === "AttachmentHttpError" &&
          (failure.status === 400 || failure.status === 413)
        ) {
          failed.add(id);
        }
        if (failure._tag === "AttachmentStorageFullError") {
          storageFull = true;
          for (const [queuedId, queued] of queue) {
            if (queued.kind === "download") queue.delete(queuedId);
          }
        }
        const expected =
          failure._tag === "AttachmentStorageFullError" ||
          (failure._tag === "AttachmentHttpError" &&
            [401, 403, 404].includes(failure.status));
        if (!expected) {
          yield* Effect.logError(`Attachment ${job.kind} failed`, failure);
        }
        // Uploads waiting for their row retry on the next sync instead.
        // Others back off, since bytes may never arrive.
        if (!awaitingSync.has(id)) {
          const attempt = (attempts.get(id) ?? 0) + 1;
          attempts.set(id, attempt);
          const at =
            (yield* Clock.currentTimeMillis) +
            Math.min(MISSING_RETRY_MS * 2 ** (attempt - 1), MAX_RETRY_MS);
          retryAt.set(id, at);
          yield* wakeAt(at);
        }
      });

    // A retry is due without waiting for a sync, which may never come.
    const wakeAt = (at: number) =>
      Effect.gen(function* () {
        if (nextWakeAt !== undefined && nextWakeAt <= at) return;
        nextWakeAt = at;
        const delay = Math.max(0, at - (yield* Clock.currentTimeMillis));
        runJob(
          Effect.sleep(delay).pipe(
            Effect.andThen(
              Effect.sync(() => {
                if (nextWakeAt !== at) return;
                nextWakeAt = undefined;
                Queue.offerUnsafe(wakes, undefined);
              }),
            ),
          ),
        );
      });

    const pump = (): void => {
      for (const [id, job] of queue) {
        if (running.size >= CONCURRENCY) break;
        queue.delete(id);
        job.syncRound = syncRound;
        running.set(id, job);
        runJob(transfer(job));
      }
      statusChanged();
    };

    const transfer = (job: Job) =>
      (job.kind === "upload" ? upload(job) : download(job)).pipe(
        Effect.catchTag("HttpClientError", (cause) =>
          Effect.fail(new AttachmentNetworkError({ cause })),
        ),
        Effect.matchEffect({
          onSuccess: () =>
            Effect.sync(() => {
              errors.delete(job.attachment.id);
              attempts.delete(job.attachment.id);
            }),
          onFailure: (failure) => onFailure(job, failure),
        }),
        Effect.ensuring(
          Effect.sync(() => {
            running.delete(job.attachment.id);
            pump();
            if (queue.size === 0 && running.size === 0) {
              batch = {
                upload: { files: 0, bytes: 0 },
                download: { files: 0, bytes: 0 },
              };
              statusChanged();
            }
          }),
        ),
      );

    const reconcile = Effect.gen(function* () {
      const rows = yield* database.select({
        selector: allAttachments,
        args: {},
      });
      const { stored, pending } = yield* store.keys;
      const now = yield* Clock.currentTimeMillis;
      const live = new Set(rows.map(({ id }) => id));
      for (const id of errors.keys()) {
        if (!live.has(id)) errors.delete(id);
      }
      let nextRetry = Infinity;
      for (const attachment of rows) {
        const { id } = attachment;
        if (failed.has(id) || queue.has(id) || running.has(id)) continue;
        if (awaitingSync.has(id)) continue;
        const due = retryAt.get(id) ?? 0;
        if (due > now) {
          nextRetry = Math.min(nextRetry, due);
          continue;
        }
        if (!stored.has(id)) {
          if (!storageFull) enqueue("download", attachment);
        } else if (pending.has(id)) {
          enqueue("upload", attachment);
        }
      }
      // Uploaded bytes without a row belong to a deleted file. Pending ones
      // go only once their row is known to be deleted: without a tombstone
      // they may be a new file whose row another tab has not persisted yet.
      if (!cleanedOrphans) {
        cleanedOrphans = true;
        const unlisted = [...stored].filter((id) => !live.has(id));
        const states = yield* database.select({
          selector: attachmentRowStates,
          args: { ids: unlisted.filter((id) => pending.has(id)) },
        });
        for (const id of unlisted) {
          if (!pending.has(id) || states[id]?.state === "deleted") {
            yield* store.delete(id);
          }
        }
      }
      if (nextRetry !== Infinity) yield* wakeAt(nextRetry);
      pump();
    }).pipe(
      Effect.catchCause((cause) =>
        Effect.logError("Failed to check attachment transfers", cause),
      ),
    );

    yield* channel.listen((message) => {
      if (message.type === "stored") notify(message.id);
      else if (!isLeader()) {
        if (message.type === "status") status.set(message.status);
      } else if (message.type === "want") want(message.id);
      else if (message.type === "kick") Queue.offerUnsafe(wakes, undefined);
      else if (message.type === "request-status") broadcastStatus();
    });

    if (leadership) {
      channel.post({ type: "request-status" });
      // A completed sync may have delivered rows that uploads waited for.
      yield* Effect.gen(function* () {
        while (true) {
          yield* syncStatus.waitFor(({ phase }) => phase === "synced");
          syncRound++;
          if (awaitingSync.size > 0) {
            awaitingSync.clear();
            kick();
          }
          yield* syncStatus.waitFor(({ phase }) => phase !== "synced");
        }
      }).pipe(Effect.forkScoped({ startImmediately: true }));
      // Any write to the file rows, from this tab, another, or a sync, may
      // need a transfer; other writes never do.
      yield* Effect.acquireRelease(
        Effect.sync(() =>
          database.hyperDB.subscribe((ops) => {
            if (isLeader() && ops.some((op) => op.table === attachmentsTable)) {
              Queue.offerUnsafe(wakes, undefined);
            }
          }),
        ),
        (unsubscribe) => Effect.sync(unsubscribe),
      );
      yield* (yield* PageEvents).listen("window", "online", () => {
        retryAt.clear();
        kick();
      });
      yield* Effect.gen(function* () {
        yield* leadership.awaitLeadership;
        yield* persistStorage;
        Queue.offerUnsafe(wakes, undefined);
        while (true) {
          yield* Queue.take(wakes);
          yield* reconcile;
        }
      }).pipe(Effect.forkScoped({ startImmediately: true }));
      // The first change publishes at once, later ones at most every
      // STATUS_THROTTLE_MS.
      yield* Effect.gen(function* () {
        while (true) {
          yield* Queue.take(statusChanges);
          status.set({
            uploading: progress("upload"),
            downloading: progress("download"),
            error: [...errors.values()].at(-1) ?? null,
            storageFull,
          });
          broadcastStatus();
          yield* Effect.sleep(STATUS_THROTTLE_MS);
        }
      }).pipe(Effect.forkScoped({ startImmediately: true }));
    }

    return {
      status,
      add: (file, parent) =>
        provide(
          Effect.gen(function* () {
            if (file.size > MAX_ATTACHMENT_SIZE) {
              return yield* new AttachmentTooLargeError({
                message: `${file.name} is larger than 50 MB`,
              });
            }
            const id = crypto.randomUUID();
            const bytes = yield* Effect.tryPromise({
              try: () => file.arrayBuffer(),
              catch: (cause) => new AttachmentFileReadError({ cause }),
            });
            const sha256 = yield* (yield* Digest.Digest).digestHex(
              Digest.sha256,
              new Uint8Array(bytes),
            );
            yield* store.put(id, file, { uploaded: !syncEnabled });
            const { attachment } = yield* database
              .dispatch(
                createAttachment({
                  attachment: {
                    id,
                    name: file.name || "file",
                    mimeType: file.type || "application/octet-stream",
                    size: file.size,
                    sha256,
                  },
                  ...(parent ? { parent } : {}),
                }),
              )
              // Bytes without a row would never upload or be cleaned up.
              .pipe(Effect.onError(() => Effect.ignore(store.delete(id))));
            notify(id);
            kick();
            return attachment;
          }),
        ),
      getBlob: (id) =>
        provide(
          Effect.gen(function* () {
            const local = yield* store.get(id);
            if (local || !syncEnabled) return local;
            if (status.get().storageFull) {
              const attachment = yield* database.select({
                selector: attachmentById,
                args: { id },
              });
              return attachment ? yield* remoteBlob(attachment) : undefined;
            }
            requestDownload(id);
            return undefined;
          }),
        ),
      readBlob: (attachment) =>
        provide(
          Effect.gen(function* () {
            const local = yield* store.get(attachment.id);
            if (local || !syncEnabled) return local;
            return yield* remoteBlob(attachment);
          }),
        ),
      importBlob: ({ id, size, sha256 }, blob) =>
        provide(
          Effect.gen(function* () {
            const digester = yield* Digest.Digest;
            const matches = (candidate: Blob) =>
              Effect.gen(function* () {
                if (candidate.size !== size) return false;
                const bytes = yield* Effect.tryPromise({
                  try: () => candidate.arrayBuffer(),
                  catch: (cause) => new AttachmentFileReadError({ cause }),
                });
                const digest = yield* digester.digestHex(
                  Digest.sha256,
                  new Uint8Array(bytes),
                );
                return digest === sha256;
              });
            const local = yield* store.get(id);
            if (local && (yield* matches(local))) {
              // The restored server may have lost the bytes.
              if (syncEnabled) {
                yield* store.put(id, local, { uploaded: false });
                requestDownload(id);
              }
              return true;
            }
            if (!(yield* matches(blob))) return false;
            yield* store.put(id, blob, { uploaded: !syncEnabled });
            notify(id);
            if (syncEnabled) requestDownload(id);
            return true;
          }),
        ),
      discardUnlistedBlobs: (ids) =>
        Effect.gen(function* () {
          const listed = new Set(
            (yield* database.select({
              selector: attachmentsByIds,
              args: { ids: [...ids] },
            })).map((attachment) => attachment.id),
          );
          for (const id of ids) {
            if (!listed.has(id)) yield* store.delete(id);
          }
        }),
      subscribeBlob: (id, listener) => {
        const set = listeners.get(id) ?? new Set();
        set.add(listener);
        listeners.set(id, set);
        return () => {
          set.delete(listener);
          if (set.size === 0) listeners.delete(id);
        };
      },
    };
  });
