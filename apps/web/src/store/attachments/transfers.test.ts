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
import { changeId, changesTable } from "@will-be-done/slices/common";
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
import {
  AttachmentStorageFullError,
  type AttachmentBlobStore,
} from "./blobStore";
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

const tombstone = "0000000000000001-00000000-client";

const seed = createAction()({
  name: "seedTransfersTest",
  args: {},
  handler: function* () {
    yield* insert(attachmentsTable, [file("remote"), file("local")]);
    yield* insert(changesTable, [
      {
        id: changeId(attachmentsTable.tableName, "removed"),
        entityId: "removed",
        tableName: attachmentsTable.tableName,
        createdAt: tombstone,
        updatedAt: tombstone,
        deletedAt: tombstone,
        clientId: "client",
        changes: {},
      },
    ]);
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

  // Fails writes as a device without free space would.
  full = false;

  put = (id: string, blob: Blob, { uploaded }: { uploaded: boolean }) =>
    Effect.suspend(() => {
      if (this.full) {
        return Effect.fail(
          new AttachmentStorageFullError({ cause: new Error("quota") }),
        );
      }
      this.blobs.set(id, blob);
      if (uploaded) this.pending.delete(id);
      else this.pending.add(id);
      this.emit(`put:${id}`);
      return Effect.void;
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

type Respond = (url: string, init: RequestInit) => Promise<Response>;

function start(store: FakeStore, respond: Respond) {
  const db = new DB(new BptreeInmemDriver());
  execSync(db.loadTables([attachmentsTable, changesTable]));
  syncDispatch(db, seed({}));
  const syncStatus = new State<SyncStatus>(initialSyncStatus);
  const logger = makeTestLogger();
  const scope = Scope.makeUnsafe();
  scopes.push(scope);
  const transfers = Effect.runPromise(
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
          testHttpClient(() => respond),
          Digest.layerWebCrypto,
          logger.layer,
        ),
      ),
    ),
  );
  return { transfers, syncStatus, logger };
}

const contentUrl = (id: string) =>
  `http://localhost/api/v1/spaces/space/attachments/${id}/content`;

describe("attachment transfers", () => {
  it("downloads missing files, uploads pending ones, and drops deleted ones", async () => {
    const store = new FakeStore();
    Effect.runSync(
      Effect.all([
        store.put("local", new Blob(["local"]), { uploaded: false }),
        store.put("deleted", new Blob(["gone"]), { uploaded: true }),
        store.put("unsynced", new Blob(["new"]), { uploaded: false }),
        // Added and removed again before it could upload.
        store.put("removed", new Blob(["undone"]), { uploaded: false }),
      ]),
    );

    const uploads: RequestInit[] = [];
    const deleted = store.done("delete:deleted");
    const removed = store.done("delete:removed");
    const downloaded = store.done("put:remote");
    const { syncStatus, logger } = start(store, async (url, init) => {
      if (init.method === "PUT") {
        uploads.push(init);
        // The row reaches the server with the next sync.
        return new Response(null, {
          status: uploads.length === 1 ? 404 : 204,
        });
      }
      expect(url).toBe(contentUrl("remote"));
      return new Response("remote", { status: 200 });
    });
    await Promise.all([deleted, removed, downloaded]);

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

  it("opens files from the server once the device is out of storage", async () => {
    const store = new FakeStore();
    store.full = true;

    const { transfers } = start(store, async (url) =>
      url === contentUrl("remote")
        ? new Response("remote", { status: 200 })
        : new Response(null, { status: 404 }),
    );
    const { status, getBlob } = await transfers;
    await Effect.runPromise(status.waitFor(({ storageFull }) => storageFull));

    const blob = await Effect.runPromise(getBlob("remote"));
    expect(await blob?.text()).toBe("remote");
    expect(blob?.type).toBe("text/plain");
    expect(store.blobs.has("remote")).toBe(false);
  });

  it("imports only intact files it does not have", async () => {
    const store = new FakeStore();
    Effect.runSync(store.put("kept", new Blob(["kept"]), { uploaded: false }));
    const { transfers } = start(
      store,
      async () => new Response(null, { status: 404 }),
    );
    const { importBlob } = await transfers;
    const sha256 = async (text: string) =>
      Array.from(
        new Uint8Array(
          await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
        ),
        (byte) => byte.toString(16).padStart(2, "0"),
      ).join("");
    const restore = async (id: string, expected: string, content: string) =>
      Effect.runPromise(
        importBlob(
          { id, size: expected.length, sha256: await sha256(expected) },
          new Blob([content]),
        ),
      );

    expect(await restore("kept", "kept", "evil")).toBe(false);
    expect(await restore("damaged", "good", "bad!")).toBe(false);
    expect(await restore("truncated", "good", "goo")).toBe(false);
    expect(await restore("good", "good", "good")).toBe(true);

    expect(await store.blobs.get("kept")?.text()).toBe("kept");
    expect(store.blobs.has("damaged")).toBe(false);
    expect(store.blobs.has("truncated")).toBe(false);
    expect(await store.blobs.get("good")?.text()).toBe("good");
  });
});
