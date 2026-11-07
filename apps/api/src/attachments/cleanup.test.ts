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
import {
  DELETED_ATTACHMENT_GRACE_MS,
  sweepSpaceAttachments,
  UNSYNCED_ATTACHMENT_GRACE_MS,
} from "./cleanup";
import { LocalAttachmentStorage } from "./storage";

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
    const storage = new LocalAttachmentStorage(root);
    const db = new DB(new BptreeInmemDriver());
    execSync(db.loadTables([...registeredSpaceSyncableTables, changesTable]));
    syncDispatch(db, seed({}));

    const files = {
      live: now - 365 * UNSYNCED_ATTACHMENT_GRACE_MS,
      "deleted-long-ago": now,
      "deleted-recently": now,
      "unsynced-old": now - UNSYNCED_ATTACHMENT_GRACE_MS - 1,
      "unsynced-new": now - 1,
    };
    for (const [id, modifiedAt] of Object.entries(files)) {
      await storage.put(spaceId, id, Buffer.from(id));
      const time = new Date(modifiedAt);
      await utimes(path.join(root, spaceId, id), time, time);
    }

    const removed = await sweepSpaceAttachments({ storage, spaceId, db, now });

    expect(removed.sort()).toEqual(["deleted-long-ago", "unsynced-old"]);
    expect((await storage.list(spaceId)).map(({ id }) => id).sort()).toEqual([
      "deleted-recently",
      "live",
      "unsynced-new",
    ]);
  });
});
