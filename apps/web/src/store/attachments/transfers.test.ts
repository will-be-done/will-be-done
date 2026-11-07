import {
  createAction,
  DB,
  execSync,
  insert,
  syncDispatch,
} from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import {
  attachmentsTable,
  attachmentType,
  type Attachment,
} from "@will-be-done/slices/space";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { State } from "@/utils/State";
import { initialSyncStatus, type SyncStatus } from "../syncStatus";
import { AttachmentTransfers } from "./transfers";

vi.mock("@/lib/auth", () => ({ authUtils: { getToken: () => "token" } }));

const file = (id: string): Attachment => ({
  type: attachmentType,
  id,
  name: `${id}.txt`,
  mimeType: "text/plain",
  size: id.length,
  sha256: "a".repeat(64),
  createdAt: 0,
});

const seed = createAction()({
  name: "seedTransfersTest",
  args: {},
  handler: function* () {
    yield* insert(attachmentsTable, [file("remote"), file("local")]);
  },
});

// Resolves once a store method has run for an ID, so tests wait on the
// milestone itself instead of time.
class FakeStore {
  blobs = new Map<string, Blob>();
  pending = new Set<string>();
  private waiters = new Map<string, () => void>();

  done(event: string) {
    return new Promise<void>((resolve) => this.waiters.set(event, resolve));
  }

  private emit(event: string) {
    this.waiters.get(event)?.();
  }

  async get(id: string) {
    return this.blobs.get(id);
  }

  async put(id: string, blob: Blob, { uploaded }: { uploaded: boolean }) {
    this.blobs.set(id, blob);
    if (uploaded) this.pending.delete(id);
    else this.pending.add(id);
    this.emit(`put:${id}`);
  }

  async markUploaded(id: string) {
    this.pending.delete(id);
    this.emit(`uploaded:${id}`);
  }

  async delete(id: string) {
    this.blobs.delete(id);
    this.pending.delete(id);
    this.emit(`delete:${id}`);
  }

  async keys() {
    return {
      stored: new Set(this.blobs.keys()),
      pending: new Set(this.pending),
    };
  }
}

describe("attachment transfers", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", new EventTarget());
    vi.stubGlobal("navigator", {
      locks: { request: (_name: string, hold: () => unknown) => hold() },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("downloads missing files, uploads pending ones, and drops deleted ones", async () => {
    const db = new DB(new BptreeInmemDriver());
    execSync(db.loadTables([attachmentsTable]));
    syncDispatch(db, seed({}));
    const store = new FakeStore();
    await store.put("local", new Blob(["local"]), { uploaded: false });
    await store.put("deleted", new Blob(["gone"]), { uploaded: true });
    await store.put("unsynced", new Blob(["new"]), { uploaded: false });

    const syncStatus = new State<SyncStatus>(initialSyncStatus);
    let uploadAttempts = 0;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        // The row reaches the server with the next sync.
        uploadAttempts++;
        return new Response(null, { status: uploadAttempts === 1 ? 404 : 204 });
      }
      expect(url).toBe("/api/v1/spaces/space/attachments/remote/content");
      return new Response("remote", { status: 200 });
    });
    const transfers = new AttachmentTransfers(db, "db", "space", true, store);

    const deleted = store.done("delete:deleted");
    const downloaded = store.done("put:remote");
    transfers.start(syncStatus);
    await Promise.all([deleted, downloaded]);

    expect(await store.blobs.get("remote")?.text()).toBe("remote");
    expect(store.pending.has("remote")).toBe(false);
    expect(store.blobs.has("unsynced")).toBe(true);
    expect(store.pending.has("local")).toBe(true);

    const uploaded = store.done("uploaded:local");
    syncStatus.set({ ...initialSyncStatus, phase: "synced" });
    await uploaded;

    expect(uploadAttempts).toBe(2);
    expect(store.pending.has("local")).toBe(false);
    const [, init] = fetchMock.mock.calls.find(
      ([, request]) => (request as RequestInit | undefined)?.method === "PUT",
    )!;
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer token",
    });
  });
});
