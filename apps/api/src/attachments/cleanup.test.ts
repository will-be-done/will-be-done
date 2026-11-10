import { mkdtemp, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import {
  createAction,
  DB,
  execSync,
  insert,
  syncDispatch,
} from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import { changeId, changesTable } from "@will-be-done/slices/common";
import {
  attachmentsTable,
  attachmentType,
  registeredSpaceSyncableTables,
} from "@will-be-done/slices/space";
import { dbsTable } from "../slices/tables";
import {
  DELETED_ATTACHMENT_GRACE_MS,
  sweepSpaceAttachments,
  sweepStoredAttachments,
  UNSYNCED_ATTACHMENT_GRACE_MS,
} from "./cleanup";
import { Effect } from "effect";
import { AttachmentStorage, makeLocalAttachmentStorage } from "./storage";

const now = Date.UTC(2026, 10, 7);
const spaceId = "space";
const hlc = (ms: number) => `${String(ms).padStart(16, "0")}-00000000-client`;

const seed = createAction()({
  name: "seedAttachmentCleanupTest",
  args: {},
  handler: function* () {
    yield* insert(attachmentsTable, [
      {
        type: attachmentType,
        id: "live",
        name: "live.png",
        mimeType: "image/png",
        size: 1,
        sha256: "a".repeat(64),
        createdAt: 0,
      },
    ]);
    yield* insert(
      changesTable,
      [
        ["deleted-long-ago", now - DELETED_ATTACHMENT_GRACE_MS - 1],
        ["deleted-recently", now - 1],
      ].map(([id, deletedAt]) => ({
        id: changeId(attachmentsTable.tableName, id as string),
        entityId: id as string,
        tableName: attachmentsTable.tableName,
        createdAt: hlc(0),
        updatedAt: hlc(deletedAt as number),
        deletedAt: hlc(deletedAt as number),
        clientId: "client",
        changes: {},
      })),
    );
  },
});

let root: string | undefined;
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

describe("attachment storage cleanup", () => {
  test("removes bytes of long-deleted and never-synced rows only", async () => {
    root = await mkdtemp(path.join(tmpdir(), "wbd-attachments-"));
    const storage = makeLocalAttachmentStorage(root);
    const db = new DB(new BptreeInmemDriver());
    execSync(db.loadTables([...registeredSpaceSyncableTables, changesTable]));
    syncDispatch(db, seed({}));

    const files = {
      live: now - 365 * UNSYNCED_ATTACHMENT_GRACE_MS,
      "deleted-long-ago": now,
      "deleted-recently": now,
      "unsynced-old": now - UNSYNCED_ATTACHMENT_GRACE_MS - 1,
      "unsynced-new": now - 1,
      // A server restored from a week-old backup has no row for it yet.
      "unsynced-since-restore": now - 7 * 24 * 60 * 60 * 1000,
    };
    for (const [id, modifiedAt] of Object.entries(files)) {
      await Effect.runPromise(storage.put(spaceId, id, Buffer.from(id)));
      const time = new Date(modifiedAt);
      await utimes(path.join(root, spaceId, id), time, time);
    }

    const removed = await Effect.runPromise(
      sweepSpaceAttachments(spaceId, db, now).pipe(
        Effect.provideService(AttachmentStorage, storage),
      ),
    );

    expect(removed.sort()).toEqual(["deleted-long-ago", "unsynced-old"]);
    const remaining = await Effect.runPromise(storage.list(spaceId));
    expect(remaining.map(({ id }) => id).sort()).toEqual([
      "deleted-recently",
      "live",
      "unsynced-new",
      "unsynced-since-restore",
    ]);
  });

  test("leaves spaces this server has no database for", async () => {
    root = await mkdtemp(path.join(tmpdir(), "wbd-attachments-"));
    const storage = makeLocalAttachmentStorage(root);
    await Effect.runPromise(
      storage.put("unknown-space", "old", Buffer.from("old")),
    );
    const time = new Date(now - 365 * UNSYNCED_ATTACHMENT_GRACE_MS);
    await utimes(path.join(root, "unknown-space", "old"), time, time);
    const mainDB = new DB(new BptreeInmemDriver());
    execSync(mainDB.loadTables([dbsTable]));

    await Effect.runPromise(
      // Opening a missing database yields an empty one.
      sweepStoredAttachments(mainDB, async () => {
        const db = new DB(new BptreeInmemDriver());
        execSync(
          db.loadTables([...registeredSpaceSyncableTables, changesTable]),
        );
        return db;
      }).pipe(Effect.provideService(AttachmentStorage, storage)),
    );

    expect(await Effect.runPromise(storage.list("unknown-space"))).toHaveLength(
      1,
    );
  });
});
