import {
  asyncDispatch,
  selectAsync,
  type HyperDB,
} from "@will-be-done/hyperdb";
import {
  allAttachments,
  type Attachment,
  type AttachmentParentType,
  createAttachment,
  MAX_ATTACHMENT_SIZE,
} from "@will-be-done/slices/space";
import { authUtils } from "@/lib/auth";
import { State } from "@/utils/State";
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

class RetryLater extends Error {}

const sha256Hex = async (blob: Blob) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()),
    ),
  ]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

export const attachmentTransfersByDB = new WeakMap<
  HyperDB,
  AttachmentTransfers
>();

// Keeps every file of a space on this device and on the server. One tab per
// space moves bytes; the others follow its status over a broadcast channel.
export class AttachmentTransfers {
  readonly status = new State<AttachmentTransferStatus>(idleTransferStatus);
  private channel: BroadcastChannel;
  private leader = false;
  private queue = new Map<string, Job>();
  private running = new Map<string, Job>();
  private batch = {
    upload: { files: 0, bytes: 0 },
    download: { files: 0, bytes: 0 },
  };
  private retryAt = new Map<string, number>();
  private awaitingSync = new Set<string>();
  private failed = new Set<string>();
  private storageFull = false;
  private error: string | null = null;
  private reconciling = false;
  private reconcileAgain = false;
  private cleanedOrphans = false;
  private listeners = new Map<string, Set<() => void>>();
  private lastStatusAt = 0;
  private statusTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private db: HyperDB,
    private dbName: string,
    private spaceId: string,
    private syncEnabled: boolean,
    private store: Pick<
      AttachmentBlobStore,
      "get" | "put" | "markUploaded" | "delete" | "keys"
    > = new AttachmentBlobStore(dbName),
  ) {
    this.channel = new BroadcastChannel(`attachments-${dbName}`);
    this.channel.onmessage = ({ data }: MessageEvent<Message>) => {
      if (data.type === "stored") this.notify(data.id);
      else if (!this.leader) {
        if (data.type === "status") this.status.set(data.status);
      } else if (data.type === "want") this.want(data.id);
      else if (data.type === "kick") void this.reconcile();
      else if (data.type === "request-status") this.broadcastStatus();
    };
  }

  start(syncStatus: State<SyncStatus>) {
    if (!this.syncEnabled) return;
    this.post({ type: "request-status" });
    void navigator.locks.request(`attachments-${this.dbName}`, () => {
      this.leader = true;
      void navigator.storage?.persist?.();
      void this.reconcile();
      // Held for the life of the tab.
      return new Promise<never>(() => {});
    });
    syncStatus.subscribe((status) => {
      if (status.phase !== "synced") return;
      this.awaitingSync.clear();
      this.kick();
    });
    window.addEventListener("online", () => {
      this.retryAt.clear();
      this.kick();
    });
  }

  async add(
    file: File,
    parent?: { parentType: AttachmentParentType; parentId: string },
  ) {
    if (file.size > MAX_ATTACHMENT_SIZE) {
      throw new Error(`${file.name} is larger than 50 MB`);
    }
    const id = crypto.randomUUID();
    const sha256 = await sha256Hex(file);
    await this.store.put(id, file, { uploaded: !this.syncEnabled });
    const { attachment } = await asyncDispatch(
      this.db,
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
    this.notify(id);
    this.kick();
    return attachment;
  }

  // Missing bytes jump to the front of the queue.
  async getBlob(id: string) {
    const blob = await this.store.get(id);
    if (!blob && this.syncEnabled) {
      if (this.leader) this.want(id);
      else this.post({ type: "want", id });
    }
    return blob;
  }

  // For exports: this device's copy, or the server's when it has none.
  async readBlob(attachment: Attachment) {
    const local = await this.store.get(attachment.id);
    if (local || !this.syncEnabled) return local;
    const response = await fetch(this.url(attachment.id), {
      headers: this.headers(),
    });
    return response.ok ? await response.blob() : undefined;
  }

  // For restores: the bytes upload again, since the server may not have them.
  async importBlob(id: string, blob: Blob) {
    await this.store.put(id, blob, { uploaded: !this.syncEnabled });
    this.notify(id);
  }

  subscribeBlob(id: string, listener: () => void) {
    const set = this.listeners.get(id) ?? new Set();
    set.add(listener);
    this.listeners.set(id, set);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(id);
    };
  }

  private kick() {
    if (this.leader) void this.reconcile();
    else this.post({ type: "kick" });
  }

  private post(message: Message) {
    this.channel.postMessage(message);
  }

  private notify(id: string) {
    for (const listener of this.listeners.get(id) ?? []) listener();
  }

  private async reconcile() {
    if (this.reconciling) {
      this.reconcileAgain = true;
      return;
    }
    this.reconciling = true;
    try {
      do {
        this.reconcileAgain = false;
        const rows = await selectAsync(this.db, {
          selector: allAttachments,
          args: {},
        });
        const { stored, pending } = await this.store.keys();
        const now = Date.now();
        for (const attachment of rows) {
          const { id } = attachment;
          if (this.failed.has(id) || this.queue.has(id) || this.running.has(id))
            continue;
          if (this.awaitingSync.has(id) || (this.retryAt.get(id) ?? 0) > now)
            continue;
          if (!stored.has(id)) {
            if (!this.storageFull) this.enqueue("download", attachment);
          } else if (pending.has(id)) {
            this.enqueue("upload", attachment);
          }
        }
        // Uploaded bytes without a row belong to a deleted file. Pending ones
        // may be a new file whose row another tab has not persisted yet.
        if (!this.cleanedOrphans) {
          this.cleanedOrphans = true;
          const live = new Set(rows.map(({ id }) => id));
          for (const id of stored) {
            if (!live.has(id) && !pending.has(id)) await this.store.delete(id);
          }
        }
        this.pump();
      } while (this.reconcileAgain);
    } catch (error) {
      console.error("Failed to check attachment transfers", error);
    } finally {
      this.reconciling = false;
    }
  }

  private enqueue(kind: Kind, attachment: Attachment) {
    this.queue.set(attachment.id, { kind, attachment, loaded: 0 });
    this.batch[kind].files++;
    this.batch[kind].bytes += attachment.size;
  }

  private want(id: string) {
    const job = this.queue.get(id);
    if (job) {
      this.queue = new Map([[id, job], ...this.queue]);
      return;
    }
    this.retryAt.delete(id);
    void this.reconcile();
  }

  private pump() {
    for (const [id, job] of this.queue) {
      if (this.running.size >= CONCURRENCY) break;
      this.queue.delete(id);
      this.running.set(id, job);
      void this.runJob(job);
    }
    this.updateStatus();
  }

  private async runJob(job: Job) {
    const { id } = job.attachment;
    try {
      if (job.kind === "upload") await this.upload(job);
      else await this.download(job);
      this.error = null;
    } catch (error) {
      if (!(error instanceof RetryLater)) {
        console.error(`Attachment ${job.kind} failed`, error);
        this.error =
          error instanceof TypeError
            ? "Could not reach the server. Files will transfer when you reconnect."
            : `Some files could not ${job.kind}. They will retry automatically.`;
      }
      // Uploads waiting for their row retry on the next sync instead.
      if (!this.awaitingSync.has(id)) {
        this.retryAt.set(id, Date.now() + MISSING_RETRY_MS);
      }
    } finally {
      this.running.delete(id);
      this.pump();
      if (this.queue.size === 0 && this.running.size === 0) this.resetBatch();
    }
  }

  private url(id: string) {
    return `/api/v1/spaces/${encodeURIComponent(this.spaceId)}/attachments/${encodeURIComponent(id)}/content`;
  }

  private headers(): Record<string, string> {
    const token = authUtils.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  private handleFailure(job: Job, status: number): never {
    const { id } = job.attachment;
    if (status === 401 || status === 403) {
      this.error = "Sign in again to transfer files.";
      throw new RetryLater();
    }
    if (status === 404) {
      // An upload waits for its row to sync; a download for another device
      // to upload the bytes.
      if (job.kind === "upload") this.awaitingSync.add(id);
      throw new RetryLater();
    }
    if (status === 400 || status === 413) {
      this.failed.add(id);
      throw new Error(`Server refused attachment ${id} (${status})`);
    }
    throw new Error(`Attachment ${job.kind} failed with ${status}`);
  }

  private async upload(job: Job) {
    const { id } = job.attachment;
    const blob = await this.store.get(id);
    if (!blob) return;
    const response = await fetch(this.url(id), {
      method: "PUT",
      headers: {
        ...this.headers(),
        "Content-Type": "application/octet-stream",
      },
      body: blob,
    });
    if (!response.ok) this.handleFailure(job, response.status);
    await this.store.markUploaded(id);
    job.loaded = job.attachment.size;
  }

  private async download(job: Job) {
    const { id, mimeType } = job.attachment;
    const response = await fetch(this.url(id), { headers: this.headers() });
    if (!response.ok || !response.body)
      this.handleFailure(job, response.status);
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      job.loaded += value.byteLength;
      this.updateStatus();
    }
    try {
      await this.store.put(id, new Blob(chunks, { type: mimeType }), {
        uploaded: true,
      });
    } catch (error) {
      if (
        error instanceof DOMException &&
        error.name === "QuotaExceededError"
      ) {
        this.storageFull = true;
        for (const [queuedId, queued] of this.queue) {
          if (queued.kind === "download") this.queue.delete(queuedId);
        }
        this.error =
          "This device is out of storage, so some files stay on the server.";
        throw new RetryLater();
      }
      throw error;
    }
    this.notify(id);
    this.post({ type: "stored", id });
  }

  private resetBatch() {
    this.batch = {
      upload: { files: 0, bytes: 0 },
      download: { files: 0, bytes: 0 },
    };
    this.updateStatus(true);
  }

  private progress(kind: Kind): TransferProgress {
    const active = [...this.queue.values(), ...this.running.values()].filter(
      (job) => job.kind === kind,
    );
    const remainingBytes = active.reduce(
      (sum, job) => sum + job.attachment.size - job.loaded,
      0,
    );
    return {
      files: active.length,
      bytesTotal: this.batch[kind].bytes,
      bytesDone: Math.max(0, this.batch[kind].bytes - remainingBytes),
    };
  }

  private updateStatus(immediate = false) {
    const elapsed = Date.now() - this.lastStatusAt;
    if (!immediate && elapsed < STATUS_THROTTLE_MS) {
      this.statusTimer ??= setTimeout(() => {
        this.statusTimer = null;
        this.updateStatus(true);
      }, STATUS_THROTTLE_MS - elapsed);
      return;
    }
    this.lastStatusAt = Date.now();
    this.status.set({
      uploading: this.progress("upload"),
      downloading: this.progress("download"),
      error: this.error,
    });
    this.broadcastStatus();
  }

  private broadcastStatus() {
    if (this.leader) this.post({ type: "status", status: this.status.get() });
  }
}
