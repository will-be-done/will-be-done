import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, test } from "bun:test";
import {
  createAction,
  DB,
  deleteRows,
  execSync,
  insert,
  selectFrom,
  syncDispatch,
  v,
} from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import { changeId, changesTable } from "@will-be-done/slices/common";
import {
  type Attachment,
  attachmentsTable,
  type ItemAttachment,
  attachmentType,
  itemAttachmentsTable,
  itemAttachmentType,
  registeredSpaceSyncableTables,
} from "@will-be-done/slices/space";
import { Effect } from "effect";
import {
  DELETED_ATTACHMENT_GRACE_MS,
  sweepSpaceAttachments,
  UNLINKED_ATTACHMENT_GRACE_MS,
  UNSYNCED_ATTACHMENT_GRACE_MS,
} from "./cleanup";
import { AttachmentStorage, makeLocalAttachmentStorage } from "./storage";
import { attachmentSweepMarksTable } from "./tables";

const now = Date.UTC(2026, 10, 7);
const spaceId = "space";
const hlc = (ms: number) => `${String(ms).padStart(16, "0")}-00000000-client`;
const action = createAction();

const file = (id: string): Attachment => ({
  type: attachmentType,
  id,
  name: `${id}.png`,
  mimeType: "image/png",
  size: 1,
  sha256: "a".repeat(64),
  createdAt: 0,
});

const link = (attachmentId: string): ItemAttachment => ({
  type: itemAttachmentType,
  id: `link-${attachmentId}`,
  attachmentId,
  parentType: "task",
  parentId: "task",
  orderToken: "a",
  createdAt: 0,
});

const seed = action({
  name: "seedAttachmentCleanupTest",
  args: {},
  handler: function* () {
    yield* insert(attachmentsTable, [file("live"), file("unlisted")]);
    yield* insert(itemAttachmentsTable, [link("live")]);
    // Deleted by a replica whose clock is a year behind.
    yield* insert(changesTable, [
      {
        id: changeId(attachmentsTable.tableName, "deleted"),
        entityId: "deleted",
        tableName: attachmentsTable.tableName,
        createdAt: hlc(0),
        updatedAt: hlc(now - 365 * DELETED_ATTACHMENT_GRACE_MS),
        deletedAt: hlc(now - 365 * DELETED_ATTACHMENT_GRACE_MS),
        clientId: "client",
        changes: {},
      },
    ]);
  },
});

const setLink = action({
  name: "setLinkAttachmentCleanupTest",
  args: { attachmentId: v.string(), linked: v.boolean() },
  handler: function* ({ attachmentId, linked }) {
    if (linked) yield* insert(itemAttachmentsTable, [link(attachmentId)]);
    else yield* deleteRows(itemAttachmentsTable, [`link-${attachmentId}`]);
  },
});

const rowIds = createAction()({
  name: "rowIdsAttachmentCleanupTest",
  args: {},
  handler: function* () {
    return (yield* selectFrom(attachmentsTable, "byIds")).map(({ id }) => id);
  },
});

let root: string | undefined;
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

const setup = async (ids: string[]) => {
  root = await mkdtemp(path.join(tmpdir(), "wbd-attachments-"));
  const storage = makeLocalAttachmentStorage(root);
  const db = new DB(new BptreeInmemDriver());
  execSync(
    db.loadTables([
      ...registeredSpaceSyncableTables,
      changesTable,
      attachmentSweepMarksTable,
    ]),
  );
  syncDispatch(db, seed({}));
  for (const id of ids) {
    await Effect.runPromise(
      storage.put(spaceId, id, Readable.from([Buffer.from(id)]), {
        size: id.length,
      }),
    );
  }
  const sweep = (at: number) =>
    Effect.runPromise(
      sweepSpaceAttachments(spaceId, db, at).pipe(
        Effect.provideService(AttachmentStorage, storage),
      ),
    );
  const stored = async () =>
    (await Effect.runPromise(storage.list(spaceId))).map(({ id }) => id).sort();
  return { db, sweep, stored };
};

describe("attachment storage cleanup", () => {
  test("removes bytes a grace period after this server saw them unused", async () => {
    const { sweep, stored } = await setup(["live", "deleted", "unsynced"]);

    await sweep(now);
    expect(await stored()).toEqual(["deleted", "live", "unsynced"]);

    await sweep(now + DELETED_ATTACHMENT_GRACE_MS);
    expect(await stored()).toEqual(["live", "unsynced"]);

    await sweep(now + UNSYNCED_ATTACHMENT_GRACE_MS);
    expect(await stored()).toEqual(["live"]);
  });

  test("deletes files no item listed for the grace period", async () => {
    const { db, sweep } = await setup([]);
    syncDispatch(db, setLink({ attachmentId: "live", linked: false }));

    await sweep(now);
    // Listed again by a replica that was offline.
    syncDispatch(db, setLink({ attachmentId: "live", linked: true }));
    await sweep(now + UNLINKED_ATTACHMENT_GRACE_MS / 2);
    syncDispatch(db, setLink({ attachmentId: "live", linked: false }));
    await sweep(now + UNLINKED_ATTACHMENT_GRACE_MS);

    expect(syncDispatch(db, rowIds({})).sort()).toEqual(["live"]);

    await sweep(now + UNLINKED_ATTACHMENT_GRACE_MS * 2);
    expect(syncDispatch(db, rowIds({}))).toEqual([]);
  });
});
