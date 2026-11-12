import {
  deleteRows,
  insert,
  selectFrom,
  upsert,
  v,
} from "@will-be-done/hyperdb";
import { withoutUndo } from "@will-be-done/hyperdb/undo";
import { generateJitteredKeyBetween } from "fractional-indexing-jittered";
import { uuidv7 } from "uuidv7";
import { action, selector } from "../builders";
import { changeId, changesTable, isDeletedChange } from "../common/changes";
import { genUUIDV5Many } from "../traits";
import {
  attachmentIdsInMarkdown,
  removeRichTextDocAttachments,
  seedRichTextDoc,
} from "../common/richText";
import { syncItemRichText } from "./richTextItems";
import {
  type Attachment,
  attachmentParentType,
  type AttachmentParentType,
  isAttachmentParentType,
  attachmentsTable,
  attachmentType,
  type ItemAttachment,
  itemAttachmentsTable,
  itemAttachmentType,
  notesTable,
  noteType,
  tasksTable,
  taskTemplatesTable,
  taskTemplateType,
  taskType,
  trashedTasksTable,
  type TrashSnapshot,
} from "./tables";

export const MAX_ATTACHMENT_SIZE = 50 * 1024 * 1024;

const SHA256_HEX = /^[0-9a-f]{64}$/;
// What an inline reference and server storage can name.
export const ATTACHMENT_ID = /^[A-Za-z0-9_-]+$/;
// Types a browser can show without running anything; the rest download, since
// opening them from a blob URL or the API would run them on that origin.
export const INLINE_ATTACHMENT_TYPE =
  /^(image\/(png|jpeg|gif|webp|avif|bmp)|application\/pdf|text\/plain|audio\/[\w.+-]+|video\/[\w.+-]+)$/;

// Why a client could not have written this row, if it could not.
export const attachmentRowProblem = ({
  id,
  size,
  sha256,
}: Pick<Attachment, "id" | "size" | "sha256">) => {
  if (!ATTACHMENT_ID.test(id))
    return "Attachment ID may only use A-Z, 0-9, _ and -";
  if (!Number.isInteger(size) || size < 0 || size > MAX_ATTACHMENT_SIZE) {
    return "Attachment exceeds the 50 MB limit";
  }
  if (!SHA256_HEX.test(sha256))
    return "Attachment checksum must be a hex SHA-256";
  return undefined;
};

// Safe integers, so the v1 API can serialize them.
const isPixelSize = (value: number) => Number.isSafeInteger(value) && value > 0;

// Why an image's stored pixel size is invalid, if it is.
export const imageSizeProblem = ({
  width,
  height,
}: Pick<Attachment, "width" | "height">) => {
  if ((width === undefined) !== (height === undefined)) {
    return "Attachment width and height go together";
  }
  if (width !== undefined && !isPixelSize(width)) {
    return "Attachment width must be a positive whole number";
  }
  if (height !== undefined && !isPixelSize(height)) {
    return "Attachment height must be a positive whole number";
  }
  return undefined;
};

export const attachmentById = selector({
  name: "attachmentById",
  args: { id: v.string() },
  handler: function* attachmentById({ id }) {
    return (yield* selectFrom(attachmentsTable, "byId")
      .where((q) => q.eq("id", id))
      .first()) as Attachment | undefined;
  },
});

export const attachmentsByIds = selector({
  name: "attachmentsByIds",
  args: { ids: v.array(v.string()) },
  handler: function* attachmentsByIds({ ids }) {
    if (ids.length === 0) return [];
    return yield* selectFrom(attachmentsTable, "byId").where((q) =>
      ids.map((id) => q.eq("id", id)),
    );
  },
});

// Every file in the space, for the background transfer queue and exports.
export const allAttachments = selector({
  name: "allAttachments",
  args: {},
  handler: function* allAttachments() {
    return yield* selectFrom(attachmentsTable, "byIds");
  },
});

// Newest first; the cursor is the last row of the previous page.
export const attachmentsPage = selector({
  name: "attachmentsPage",
  args: {
    limit: v.number(),
    cursor: v.optional(v.object({ createdAt: v.number(), id: v.string() })),
  },
  handler: function* attachmentsPage({ limit, cursor }) {
    const query = selectFrom(attachmentsTable, "byCreatedAtId");
    const rows = yield* (
      cursor
        ? query.where((q) => [
            q.lt("createdAt", cursor.createdAt),
            q.eq("createdAt", cursor.createdAt).lt("id", cursor.id),
          ])
        : query
    )
      .order("desc")
      .limit(limit + 1);
    return {
      attachments: rows.slice(0, limit),
      hasMore: rows.length > limit,
    };
  },
});

export type AttachmentRowState =
  | { state: "live" }
  | { state: "deleted" }
  | { state: "unknown" };

// For the server's cleanup sweep: which of these files no item lists.
export const unlinkedAttachmentIds = selector({
  name: "unlinkedAttachmentIds",
  args: { ids: v.array(v.string()) },
  handler: function* unlinkedAttachmentIds({ ids }) {
    const linked = new Set(
      (yield* linksOfAttachments(ids)).map((link) => link.attachmentId),
    );
    return ids.filter((id) => !linked.has(id));
  },
});

// For storage cleanup: whether stored bytes still have a row. "unknown" means
// the row never arrived.
export const attachmentRowStates = selector({
  name: "attachmentRowStates",
  args: { ids: v.array(v.string()) },
  handler: function* attachmentRowStates({ ids }) {
    const live = new Set(
      (yield* attachmentsByIds({ ids })).map((file) => file.id),
    );
    const missing = ids.filter((id) => !live.has(id));
    const changes =
      missing.length > 0
        ? yield* selectFrom(changesTable, "byId").where((q) =>
            missing.map((id) =>
              q.eq("id", changeId(attachmentsTable.tableName, id)),
            ),
          )
        : [];
    const changesById = new Map(
      changes.map((change) => [change.entityId, change]),
    );
    return Object.fromEntries(
      ids.map((id): [string, AttachmentRowState] => {
        if (live.has(id)) return [id, { state: "live" }];
        const change = changesById.get(id);
        return change && isDeletedChange(change)
          ? [id, { state: "deleted" }]
          : [id, { state: "unknown" }];
      }),
    );
  },
});

export const itemAttachmentById = selector({
  name: "itemAttachmentById",
  args: { id: v.string() },
  handler: function* itemAttachmentById({ id }) {
    return (yield* selectFrom(itemAttachmentsTable, "byId")
      .where((q) => q.eq("id", id))
      .first()) as ItemAttachment | undefined;
  },
});

export const itemAttachmentLinks = selector({
  name: "itemAttachmentLinks",
  args: { parentType: attachmentParentType, parentId: v.string() },
  handler: function* itemAttachmentLinks({ parentType, parentId }) {
    return yield* selectFrom(itemAttachmentsTable, "byParentOrder").where((q) =>
      q.eq("parentType", parentType).eq("parentId", parentId),
    );
  },
});

// An item's files in list order, each with the link that lists it.
export const itemAttachments = selector({
  name: "itemAttachments",
  args: { parentType: attachmentParentType, parentId: v.string() },
  handler: function* itemAttachments({ parentType, parentId }) {
    const links = yield* itemAttachmentLinks({ parentType, parentId });
    const files = new Map(
      (yield* attachmentsByIds({
        ids: [...new Set(links.map((link) => link.attachmentId))],
      })).map((file) => [file.id, file]),
    );
    return links.flatMap((link) => {
      const attachment = files.get(link.attachmentId);
      return attachment ? [{ link, attachment }] : [];
    });
  },
});

export const itemAttachmentCount = selector({
  name: "itemAttachmentCount",
  args: { parentType: attachmentParentType, parentId: v.string() },
  handler: function* itemAttachmentCount({ parentType, parentId }) {
    return (yield* itemAttachmentLinks({ parentType, parentId })).length;
  },
});

function* linksOfAttachments(attachmentIds: readonly string[]) {
  if (attachmentIds.length === 0) return [];
  return yield* selectFrom(itemAttachmentsTable, "byAttachmentId").where((q) =>
    attachmentIds.map((id) => q.eq("attachmentId", id)),
  );
}

// The files of the item that lists this one, in list order. A file listed
// by several items takes the first of them.
export const attachmentSiblings = selector({
  name: "attachmentSiblings",
  args: { attachmentId: v.string() },
  handler: function* attachmentSiblings({ attachmentId }) {
    const links = yield* linksOfAttachments([attachmentId]);
    const link = links.find((candidate) =>
      isAttachmentParentType(candidate.parentType),
    );
    if (!link || !isAttachmentParentType(link.parentType)) return [];
    return (yield* itemAttachments({
      parentType: link.parentType,
      parentId: link.parentId,
    })).map(({ attachment }) => attachment);
  },
});

export type AttachmentUsage = {
  parentType: ItemAttachment["parentType"];
  parentId: string;
  title: string;
  trashed: boolean;
};

// Where each attachment on a page is listed. A link whose item is gone
// belongs to an item in the trash: links stay until the trash is emptied.
export const attachmentUsages = selector({
  name: "attachmentUsages",
  args: { attachmentIds: v.array(v.string()) },
  handler: function* attachmentUsages({ attachmentIds }) {
    const links = yield* linksOfAttachments(attachmentIds);
    const idsOf = (type: AttachmentParentType) => [
      ...new Set(
        links
          .filter((link) => link.parentType === type)
          .map((link) => link.parentId),
      ),
    ];
    const titles = new Map<string, string>();
    for (const [type, table] of [
      ["task", tasksTable],
      [taskTemplateType, taskTemplatesTable],
      [noteType, notesTable],
    ] as const) {
      const ids = idsOf(type);
      if (ids.length === 0) continue;
      const rows = yield* selectFrom(table, "byId").where((q) =>
        ids.map((id) => q.eq("id", id)),
      );
      for (const row of rows) titles.set(`${type}:${row.id}`, row.title);
    }

    const result: Record<string, AttachmentUsage[]> = {};
    for (const id of attachmentIds) result[id] = [];
    for (const link of links) {
      if (!isAttachmentParentType(link.parentType)) {
        result[link.attachmentId]?.push({
          parentType: link.parentType,
          parentId: link.parentId,
          title: "",
          trashed: false,
        });
        continue;
      }
      const title = titles.get(`${link.parentType}:${link.parentId}`);
      result[link.attachmentId]?.push({
        parentType: link.parentType,
        parentId: link.parentId,
        title: title ?? "",
        trashed: title === undefined,
      });
    }
    for (const usages of Object.values(result)) {
      usages.sort((a, b) => Number(a.trashed) - Number(b.trashed));
    }
    return result;
  },
});

function* parentExists(parentType: AttachmentParentType, parentId: string) {
  const table =
    parentType === noteType
      ? notesTable
      : parentType === taskTemplateType
        ? taskTemplatesTable
        : tasksTable;
  return !!(yield* selectFrom(table, "byId")
    .where((q) => q.eq("id", parentId))
    .first());
}

// One link per item and file, so replicas that link the same file to the same
// item create the same row instead of listing the file twice.
function* withLinkIds<T extends Omit<ItemAttachment, "id">>(links: T[]) {
  const ids = yield* genUUIDV5Many(
    itemAttachmentType,
    links.map(
      (link) => `${link.parentType}:${link.parentId}:${link.attachmentId}`,
    ),
  );
  return links.map((link, index) => ({ ...link, id: ids[index]! }));
}

function* linkAttachments(
  parentType: AttachmentParentType,
  parentId: string,
  attachmentIds: readonly string[],
) {
  if (attachmentIds.length === 0) return [];
  const links = yield* itemAttachmentLinks({ parentType, parentId });
  const linked = new Set(links.map((link) => link.attachmentId));
  const missing = [...new Set(attachmentIds)].filter((id) => !linked.has(id));
  if (missing.length === 0) return [];
  const existing = new Set(
    (yield* attachmentsByIds({ ids: missing })).map((file) => file.id),
  );
  const unlinked: Omit<ItemAttachment, "id">[] = [];
  let orderToken = links[links.length - 1]?.orderToken ?? null;
  for (const attachmentId of missing) {
    if (!existing.has(attachmentId)) continue;
    orderToken = generateJitteredKeyBetween(orderToken, null);
    unlinked.push({
      type: itemAttachmentType,
      attachmentId,
      parentType,
      parentId,
      orderToken,
      createdAt: Date.now(),
    });
  }
  const created = yield* withLinkIds(unlinked);
  // Listing a file is never an undo step (see createAttachment).
  if (created.length > 0) {
    yield* withoutUndo(() => upsert(itemAttachmentsTable, created));
  }
  return created;
}

type InlineReferences = { title: string; content?: string };

// A file referenced inline is always in the item's list, whichever client or
// API call wrote the reference. Pass `previous` to skip unchanged text.
export function* ensureInlineAttachmentLinks(
  parentType: AttachmentParentType,
  parentId: string,
  item: InlineReferences,
  previous?: InlineReferences,
) {
  if (
    previous &&
    item.title === previous.title &&
    item.content === previous.content
  ) {
    return;
  }
  const ids = attachmentIdsInMarkdown(`${item.title}\n${item.content ?? ""}`);
  if (ids.length > 0) yield* linkAttachments(parentType, parentId, ids);
}

export const createAttachment = action({
  name: "createAttachment",
  args: {
    attachment: v.object({
      id: v.optional(v.string()),
      name: v.string(),
      mimeType: v.string(),
      size: v.number(),
      sha256: v.string(),
      width: v.optional(v.number()),
      height: v.optional(v.number()),
    }),
    parent: v.optional(
      v.object({ parentType: attachmentParentType, parentId: v.string() }),
    ),
  },
  handler: function* createAttachment({ attachment, parent }) {
    const id = attachment.id || uuidv7();
    const problem =
      attachmentRowProblem({ ...attachment, id }) ??
      imageSizeProblem(attachment);
    if (problem) throw new Error(problem);
    if (parent && !(yield* parentExists(parent.parentType, parent.parentId))) {
      throw new Error("Attachment parent not found");
    }
    const row: Attachment = {
      type: attachmentType,
      id,
      name: attachment.name.trim() || "file",
      mimeType: attachment.mimeType || "application/octet-stream",
      size: attachment.size,
      sha256: attachment.sha256,
      createdAt: Date.now(),
      ...(attachment.width !== undefined && { width: attachment.width }),
      ...(attachment.height !== undefined && { height: attachment.height }),
    };
    // Undo skips file changes: the text that references a file is not an undo
    // step, so undoing them would leave references with no file or no link.
    yield* withoutUndo(() => insert(attachmentsTable, [row]));
    const [link] = parent
      ? yield* linkAttachments(parent.parentType, parent.parentId, [row.id])
      : [];
    return { attachment: row, link };
  },
});

// Fills in the size of an image that was stored without one.
export const setAttachmentImageSize = action({
  name: "setAttachmentImageSize",
  args: { id: v.string(), width: v.number(), height: v.number() },
  handler: function* setAttachmentImageSize({ id, width, height }) {
    const attachment = yield* attachmentById({ id });
    if (!attachment || attachment.width !== undefined) return;
    const row = { ...attachment, width, height };
    const problem = imageSizeProblem(row);
    if (problem) throw new Error(problem);
    yield* withoutUndo(() => upsert(attachmentsTable, [row]));
  },
});

export const attachToItem = action({
  name: "attachToItem",
  args: {
    attachmentId: v.string(),
    parentType: attachmentParentType,
    parentId: v.string(),
  },
  handler: function* attachToItem({ attachmentId, parentType, parentId }) {
    if (!(yield* parentExists(parentType, parentId))) {
      throw new Error("Attachment parent not found");
    }
    yield* linkAttachments(parentType, parentId, [attachmentId]);
    return (yield* itemAttachmentLinks({ parentType, parentId })).find(
      (link) => link.attachmentId === attachmentId,
    );
  },
});

const withoutInlineReferences = <
  T extends {
    title: string;
    titleDoc?: string;
    content?: string;
    contentDoc?: string;
  },
>(
  row: T | undefined,
  attachmentIds: readonly string[],
): T | undefined => {
  if (!row) return undefined;
  const referenced = (markdown: string | undefined) =>
    attachmentIdsInMarkdown(markdown ?? "").filter((id) =>
      attachmentIds.includes(id),
    );
  const titleIds = referenced(row.title);
  const contentIds = referenced(row.content);
  if (titleIds.length === 0 && contentIds.length === 0) return undefined;
  return syncItemRichText(row, {
    ...row,
    ...(titleIds.length > 0 && {
      titleDoc: removeRichTextDocAttachments(
        row.titleDoc ?? seedRichTextDoc(row.title, "title"),
        titleIds,
      ),
    }),
    ...(contentIds.length > 0 && {
      contentDoc: removeRichTextDocAttachments(
        row.contentDoc ?? seedRichTextDoc(row.content ?? "", "content"),
        contentIds,
      ),
    }),
  });
};

function* removeInlineReferences(
  parentType: AttachmentParentType,
  parentId: string,
  attachmentIds: readonly string[],
) {
  if (parentType === taskTemplateType) {
    const next = withoutInlineReferences(
      yield* selectFrom(taskTemplatesTable, "byId")
        .where((q) => q.eq("id", parentId))
        .first(),
      attachmentIds,
    );
    if (next) yield* upsert(taskTemplatesTable, [next]);
    return;
  }
  if (parentType === noteType) {
    const note = yield* selectFrom(notesTable, "byId")
      .where((q) => q.eq("id", parentId))
      .first();
    if (note) {
      const next = withoutInlineReferences(note, attachmentIds);
      if (next) yield* upsert(notesTable, [next]);
      return;
    }
  } else {
    const task = yield* selectFrom(tasksTable, "byId")
      .where((q) => q.eq("id", parentId))
      .first();
    if (task) {
      const next = withoutInlineReferences(task, attachmentIds);
      if (next) yield* upsert(tasksTable, [next]);
      return;
    }
  }

  // Restoring the item from the trash must not bring the references back.
  const trashed = yield* selectFrom(trashedTasksTable, "byId")
    .where((q) => q.eq("id", parentId))
    .first();
  if (!trashed) return;
  const snapshot = JSON.parse(trashed.snapshot) as TrashSnapshot;
  let next: TrashSnapshot | undefined;
  if ("note" in snapshot) {
    const note = withoutInlineReferences(snapshot.note, attachmentIds);
    if (note) next = { ...snapshot, note };
  } else {
    const task = withoutInlineReferences(snapshot.task, attachmentIds);
    if (task) next = { ...snapshot, task };
  }
  if (next) {
    yield* upsert(trashedTasksTable, [
      { ...trashed, snapshot: JSON.stringify(next) },
    ]);
  }
}

// Removing a file from an item also removes it from the item's description.
// A file nothing lists any more stays: the server deletes it once replicas
// have settled, since another replica may have listed it meanwhile.
export const removeItemAttachment = action({
  name: "removeItemAttachment",
  args: { id: v.string() },
  handler: function* removeItemAttachment({ id }) {
    const link = yield* itemAttachmentById({ id });
    if (!link) return;
    yield* withoutUndo(function* () {
      yield* deleteRows(itemAttachmentsTable, [link.id]);
      if (isAttachmentParentType(link.parentType)) {
        yield* removeInlineReferences(link.parentType, link.parentId, [
          link.attachmentId,
        ]);
      }
    });
  },
});

export const deleteAttachments = action({
  name: "deleteAttachments",
  args: { ids: v.array(v.string()) },
  handler: function* deleteAttachments({ ids }) {
    if (ids.length === 0) return;
    const links = yield* linksOfAttachments(ids);
    const parents = new Map<
      string,
      { parentType: AttachmentParentType; parentId: string }
    >();
    for (const { parentType, parentId } of links) {
      // A background's owner clears its own reference to the file.
      if (isAttachmentParentType(parentType)) {
        parents.set(`${parentType}:${parentId}`, { parentType, parentId });
      }
    }
    yield* withoutUndo(function* () {
      if (links.length > 0) {
        yield* deleteRows(
          itemAttachmentsTable,
          links.map((link) => link.id),
        );
      }
      for (const { parentType, parentId } of parents.values()) {
        yield* removeInlineReferences(parentType, parentId, ids);
      }
      yield* deleteRows(attachmentsTable, ids);
    });
  },
});

// For conversions that replace an item with a new ID.
export function* moveItemAttachments(
  from: { parentType: AttachmentParentType; parentId: string },
  to: { parentType: AttachmentParentType; parentId: string },
) {
  const links = yield* itemAttachmentLinks(from);
  if (links.length === 0) return;
  yield* deleteRows(
    itemAttachmentsTable,
    links.map((link) => link.id),
  );
  yield* upsert(
    itemAttachmentsTable,
    yield* withLinkIds(
      links.map(({ id: _id, ...link }) => ({ ...link, ...to })),
    ),
  );
}

// Generated tasks list the same files as their template.
export function* copyItemAttachments(
  from: { parentType: AttachmentParentType; parentId: string },
  to: { parentType: AttachmentParentType; parentId: string },
) {
  const links = yield* itemAttachmentLinks(from);
  if (links.length === 0) return;
  const now = Date.now();
  yield* upsert(
    itemAttachmentsTable,
    yield* withLinkIds(
      links.map(({ id: _id, ...link }) => ({ ...link, ...to, createdAt: now })),
    ),
  );
}

// Copies of items list the same files as their originals.
export function* copyAttachmentsToItemCopies(
  pairs: readonly {
    parentType: AttachmentParentType;
    originalId: string;
    copyId: string;
  }[],
) {
  const links: ItemAttachment[] = [];
  for (const parentType of [taskType, taskTemplateType, noteType] as const) {
    links.push(
      ...(yield* itemAttachmentLinksOfParents(
        parentType,
        pairs
          .filter((pair) => pair.parentType === parentType)
          .map((pair) => pair.originalId),
      )),
    );
  }
  if (links.length === 0) return;
  const copyIds = new Map(
    pairs.map((pair) => [`${pair.parentType}:${pair.originalId}`, pair.copyId]),
  );
  const now = Date.now();
  yield* upsert(
    itemAttachmentsTable,
    yield* withLinkIds(
      links.flatMap(({ id: _id, ...link }) => {
        const parentId = copyIds.get(`${link.parentType}:${link.parentId}`);
        return parentId ? [{ ...link, parentId, createdAt: now }] : [];
      }),
    ),
  );
}

export function* itemAttachmentLinksOfParents(
  parentType: AttachmentParentType,
  parentIds: readonly string[],
) {
  if (parentIds.length === 0) return [];
  return yield* selectFrom(itemAttachmentsTable, "byParentOrder").where((q) =>
    parentIds.map((id) => q.eq("parentType", parentType).eq("parentId", id)),
  );
}

export function* deleteItemAttachmentLinks(
  parentType: AttachmentParentType,
  parentIds: readonly string[],
) {
  const links = yield* itemAttachmentLinksOfParents(parentType, parentIds);
  if (links.length === 0) return;
  yield* deleteRows(
    itemAttachmentsTable,
    links.map((link) => link.id),
  );
}
