import type { HyperDB } from "@will-be-done/hyperdb";
import {
  allAttachments,
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
import { Database } from "../database";
import type { SyncStatus } from "../syncStatus";
import { AttachmentBlobStore } from "./blobStore";

export type TransferProgress = {
  files: number;
  bytesDone: number;
  bytesTotal: number;
};

export type AttachmentTransferStatus = {
  uploading: TransferProgress;
  downloading: TransferProgress;
  error: string | null;
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
};

type Kind = "upload" | "download";
type Job = { kind: Kind; attachment: Attachment; loaded: number };
type Message =
  | { type: "status"; status: AttachmentTransferStatus }
  | { type: "request-status" }
  | { type: "stored"; id: string }
  | { type: "want"; id: string }
  | { type: "kick" };

const CONCURRENCY = 3;
// The server may lack bytes another device has not uploaded yet.
const MISSING_RETRY_MS = 60_000;
const STATUS_THROTTLE_MS = 200;

class AttachmentHttpError extends Data.TaggedError("AttachmentHttpError")<{
  readonly status: number;
}> {}

class AttachmentNetworkError extends Data.TaggedError(
  "AttachmentNetworkError",
)<{ readonly cause: unknown }> {}

class AttachmentStorageFullError extends Data.TaggedError(
  "AttachmentStorageFullError",
)<{ readonly cause: unknown }> {}

class AttachmentStoreError extends Data.TaggedError("AttachmentStoreError")<{
  readonly cause: unknown;
}> {}

type TransferError =
  | AttachmentHttpError
  | AttachmentNetworkError
  | AttachmentStorageFullError
  | AttachmentStoreError;

export type AttachmentTransferServices =
  | Database
  | TabChannels
  | PageEvents
  | AuthSession
  | HttpClient.HttpClient
  | Digest.Digest;

type BlobStore = Pick<
  AttachmentBlobStore,
  "get" | "put" | "markUploaded" | "delete" | "keys"
>;

const fromStore = <A>(run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) =>
      cause instanceof DOMException && cause.name === "QuotaExceededError"
        ? new AttachmentStorageFullError({ cause })
        : new AttachmentStoreError({ cause }),
  });

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

export type AttachmentTransfers = {
  readonly status: State<AttachmentTransferStatus>;
  readonly add: (
    file: File,
    parent?: { parentType: AttachmentParentType; parentId: string },
  ) => Promise<Attachment>;
  // Missing bytes jump to the front of the queue.
  readonly getBlob: (id: string) => Promise<Blob | undefined>;
  // For exports: this device's copy, or the server's when it has none.
  readonly readBlob: (attachment: Attachment) => Promise<Blob | undefined>;
  // For restores: the bytes upload again, since the server may not have them.
  readonly importBlob: (id: string, blob: Blob) => Promise<void>;
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
  store = new AttachmentBlobStore(dbName),
}: {
  dbName: string;
  spaceId: string;
  syncEnabled: boolean;
  syncStatus: State<SyncStatus>;
  store?: BlobStore;
}): Effect.Effect<
  AttachmentTransfers,
  never,
  AttachmentTransferServices | Scope.Scope
> =>
  Effect.gen(function* () {
    const services = yield* Effect.context<AttachmentTransferServices>();
    const run = Effect.runPromiseWith(services);
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
    const failed = new Set<string>();
    let storageFull = false;
    let error: string | null = null;
    let cleanedOrphans = false;

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

    const upload = (job: Job) =>
      Effect.gen(function* () {
        const { id } = job.attachment;
        const blob = yield* fromStore(() => store.get(id));
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
        yield* fromStore(() => store.markUploaded(id));
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
        yield* fromStore(() =>
          store.put(id, new Blob(chunks, { type: mimeType }), {
            uploaded: true,
          }),
        );
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
          AttachmentStoreError: () =>
            `Some files could not ${job.kind}. They will retry automatically.`,
        }),
      );

    const onFailure = (job: Job, failure: TransferError) =>
      Effect.gen(function* () {
        const { id } = job.attachment;
        if (failure._tag === "AttachmentHttpError" && failure.status === 404) {
          // An upload waits for its row to sync; a download for another
          // device to upload the bytes.
          if (job.kind === "upload") awaitingSync.add(id);
        } else {
          error = failureMessage(job)(failure);
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
        if (!awaitingSync.has(id)) {
          retryAt.set(id, (yield* Clock.currentTimeMillis) + MISSING_RETRY_MS);
        }
      });

    const pump = (): void => {
      for (const [id, job] of queue) {
        if (running.size >= CONCURRENCY) break;
        queue.delete(id);
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
              error = null;
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
      const { stored, pending } = yield* fromStore(() => store.keys());
      const now = yield* Clock.currentTimeMillis;
      for (const attachment of rows) {
        const { id } = attachment;
        if (failed.has(id) || queue.has(id) || running.has(id)) continue;
        if (awaitingSync.has(id) || (retryAt.get(id) ?? 0) > now) continue;
        if (!stored.has(id)) {
          if (!storageFull) enqueue("download", attachment);
        } else if (pending.has(id)) {
          enqueue("upload", attachment);
        }
      }
      // Uploaded bytes without a row belong to a deleted file. Pending ones
      // may be a new file whose row another tab has not persisted yet.
      if (!cleanedOrphans) {
        cleanedOrphans = true;
        const live = new Set(rows.map(({ id }) => id));
        for (const id of stored) {
          if (!live.has(id) && !pending.has(id)) {
            yield* fromStore(() => store.delete(id));
          }
        }
      }
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
      yield* Effect.acquireRelease(
        Effect.sync(() =>
          syncStatus.subscribe(({ phase }) => {
            if (phase !== "synced") return;
            awaitingSync.clear();
            kick();
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
        void navigator.storage?.persist?.();
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
            error,
          });
          broadcastStatus();
          yield* Effect.sleep(STATUS_THROTTLE_MS);
        }
      }).pipe(Effect.forkScoped({ startImmediately: true }));
    }

    return {
      status,
      add: async (file, parent) => {
        if (file.size > MAX_ATTACHMENT_SIZE) {
          throw new Error(`${file.name} is larger than 50 MB`);
        }
        return run(
          Effect.gen(function* () {
            const id = crypto.randomUUID();
            const sha256 = yield* (yield* Digest.Digest).digestHex(
              Digest.sha256,
              new Uint8Array(yield* Effect.promise(() => file.arrayBuffer())),
            );
            yield* fromStore(() =>
              store.put(id, file, { uploaded: !syncEnabled }),
            );
            const { attachment } = yield* database.dispatch(
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
            );
            notify(id);
            kick();
            return attachment;
          }),
        );
      },
      getBlob: async (id) => {
        const blob = await store.get(id);
        if (!blob && syncEnabled) {
          if (isLeader()) want(id);
          else channel.post({ type: "want", id });
        }
        return blob;
      },
      readBlob: async (attachment) => {
        const local = await store.get(attachment.id);
        if (local || !syncEnabled) return local;
        return run(
          send(HttpClientRequest.get(url(attachment.id))).pipe(
            Effect.flatMap((response) => response.arrayBuffer),
            Effect.map(
              (bytes) => new Blob([bytes], { type: attachment.mimeType }),
            ),
            Effect.catchTag("AttachmentHttpError", () =>
              Effect.succeed(undefined),
            ),
          ),
        );
      },
      importBlob: async (id, blob) => {
        await store.put(id, blob, { uploaded: !syncEnabled });
        notify(id);
      },
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
