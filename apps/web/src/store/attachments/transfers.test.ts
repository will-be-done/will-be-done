import {
  createAction,
  DB,
  execSync,
  insert,
  SubscribableDB,
  syncDispatch,
} from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import {
  attachmentsTable,
  attachmentType,
  type Attachment,
} from "@will-be-done/slices/space";
import { Effect, Exit, Layer, Scope } from "effect";
import { Digest } from "effect/crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  makeTestLogger,
  makeTestPage,
  makeTestTabs,
  testAuthSession,
  testHttpClient,
} from "@/services/testing";
import { State } from "@/utils/State";
import { Database } from "../database";
import { initialSyncStatus, type SyncStatus } from "../syncStatus";
import type { AttachmentBlobStore } from "./blobStore";
import { makeAttachmentTransfers } from "./transfers";

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
class FakeStore implements AttachmentBlobStore {
  blobs = new Map<string, Blob>();
  pending = new Set<string>();
  private waiters = new Map<string, () => void>();

  done(event: string) {
    return new Promise<void>((resolve) => this.waiters.set(event, resolve));
  }

  private emit(event: string) {
    this.waiters.get(event)?.();
  }

  get = (id: string) => Effect.sync(() => this.blobs.get(id));

  put = (id: string, blob: Blob, { uploaded }: { uploaded: boolean }) =>
    Effect.sync(() => {
      this.blobs.set(id, blob);
      if (uploaded) this.pending.delete(id);
      else this.pending.add(id);
      this.emit(`put:${id}`);
    });

  markUploaded = (id: string) =>
    Effect.sync(() => {
      this.pending.delete(id);
      this.emit(`uploaded:${id}`);
    });

  delete = (id: string) =>
    Effect.sync(() => {
      this.blobs.delete(id);
      this.pending.delete(id);
      this.emit(`delete:${id}`);
    });

  keys = Effect.sync(() => ({
    stored: new Set(this.blobs.keys()),
    pending: new Set(this.pending),
  }));
}

const scopes: Scope.Closeable[] = [];

afterEach(async () => {
  for (const scope of scopes.splice(0)) {
    await Effect.runPromise(Scope.close(scope, Exit.void));
  }
});

describe("attachment transfers", () => {
  it("downloads missing files, uploads pending ones, and drops deleted ones", async () => {
    const db = new DB(new BptreeInmemDriver());
    execSync(db.loadTables([attachmentsTable]));
    syncDispatch(db, seed({}));
    const store = new FakeStore();
    Effect.runSync(
      Effect.all([
        store.put("local", new Blob(["local"]), { uploaded: false }),
        store.put("deleted", new Blob(["gone"]), { uploaded: true }),
        store.put("unsynced", new Blob(["new"]), { uploaded: false }),
      ]),
    );

    const syncStatus = new State<SyncStatus>(initialSyncStatus);
    const uploads: RequestInit[] = [];
    const logger = makeTestLogger();
    const scope = Scope.makeUnsafe();
    scopes.push(scope);

    const deleted = store.done("delete:deleted");
    const downloaded = store.done("put:remote");
    await Effect.runPromise(
      makeAttachmentTransfers({
        dbName: "db",
        spaceId: "space",
        syncEnabled: true,
        syncStatus,
        store,
      }).pipe(
        Scope.provide(scope),
        Effect.provide(
          Layer.mergeAll(
            Database.layer(new SubscribableDB(db)),
            makeTestTabs().layer,
            makeTestPage().layer,
            testAuthSession(":", "token"),
            testHttpClient(() => async (url, init) => {
              if (init.method === "PUT") {
                uploads.push(init);
                // The row reaches the server with the next sync.
                return new Response(null, {
                  status: uploads.length === 1 ? 404 : 204,
                });
              }
              expect(url).toBe(
                "http://localhost/api/v1/spaces/space/attachments/remote/content",
              );
              return new Response("remote", { status: 200 });
            }),
            Digest.layerWebCrypto,
            logger.layer,
          ),
        ),
      ),
    );
    await Promise.all([deleted, downloaded]);

    expect(await store.blobs.get("remote")?.text()).toBe("remote");
    expect(store.pending.has("remote")).toBe(false);
    expect(store.blobs.has("unsynced")).toBe(true);
    expect(store.pending.has("local")).toBe(true);

    const uploaded = store.done("uploaded:local");
    syncStatus.set({ ...initialSyncStatus, phase: "synced" });
    await uploaded;

    expect(uploads).toHaveLength(2);
    expect(store.pending.has("local")).toBe(false);
    expect(new Headers(uploads[1]!.headers).get("authorization")).toBe(
      "Bearer token",
    );
    expect(logger.errors()).toEqual([]);
  });
});
