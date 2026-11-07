import {
  deleteRows,
  insert,
  selectFrom,
  upsert,
  v,
} from "@will-be-done/hyperdb";
import { generateJitteredKeyBetween } from "fractional-indexing-jittered";
import { uuidv7 } from "uuidv7";
import { action, selector } from "../builders";
import { changeId, changesTable, isDeletedChange } from "../common/changes";
import { parseHlc } from "../common/hlc";
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
  | { state: "deleted"; deletedAt: number }
  | { state: "unknown" };

// For server storage cleanup: whether stored bytes still have a row, and when
// the row was deleted. "unknown" means the row never arrived.
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
        return change?.deletedAt && isDeletedChange(change)
          ? [
              id,
              {
                state: "deleted",
                deletedAt: parseHlc(change.deletedAt).physical,
              },
            ]
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

// Trash is bounded by its retention period, so scanning it stays small.
function* trashedAttachmentParents() {
  const parents = new Map<string, { parentType: string; parentId: string }[]>();
  for (const row of yield* selectFrom(trashedTasksTable, "byIds")) {
    let snapshot: TrashSnapshot;
    try {
      snapshot = JSON.parse(row.snapshot) as TrashSnapshot;
    } catch {
      continue;
    }
    for (const link of snapshot.itemAttachments ?? []) {
      const list = parents.get(link.attachmentId) ?? [];
      list.push({ parentType: link.parentType, parentId: link.parentId });
      parents.set(link.attachmentId, list);
    }
  }
  return parents;
}

export type AttachmentUsage = {
  parentType: AttachmentParentType;
  parentId: string;
  title: string;
  trashed: boolean;
};

// Where each attachment on a page is listed, live items first.
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

    const trashed = yield* trashedAttachmentParents();
    const result: Record<string, AttachmentUsage[]> = {};
    for (const id of attachmentIds) result[id] = [];
    for (const link of links) {
      result[link.attachmentId]?.push({
        parentType: link.parentType,
        parentId: link.parentId,
        title: titles.get(`${link.parentType}:${link.parentId}`) ?? "",
        trashed: false,
      });
    }
    for (const id of attachmentIds) {
      for (const parent of trashed.get(id) ?? []) {
        result[id]!.push({
          parentType: parent.parentType as AttachmentParentType,
          parentId: parent.parentId,
          title: "",
          trashed: true,
        });
      }
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
  const created: ItemAttachment[] = [];
  let orderToken = links[links.length - 1]?.orderToken ?? null;
  for (const attachmentId of missing) {
    if (!existing.has(attachmentId)) continue;
    orderToken = generateJitteredKeyBetween(orderToken, null);
    created.push({
      type: itemAttachmentType,
      id: uuidv7(),
      attachmentId,
      parentType,
      parentId,
      orderToken,
      createdAt: Date.now(),
    });
  }
  if (created.length > 0) yield* insert(itemAttachmentsTable, created);
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
    }),
    parent: v.optional(
      v.object({ parentType: attachmentParentType, parentId: v.string() }),
    ),
  },
  handler: function* createAttachment({ attachment, parent }) {
    if (
      !Number.isInteger(attachment.size) ||
      attachment.size < 0 ||
      attachment.size > MAX_ATTACHMENT_SIZE
    ) {
      throw new Error("Attachment exceeds the 50 MB limit");
    }
    if (!SHA256_HEX.test(attachment.sha256)) {
      throw new Error("Attachment checksum must be a hex SHA-256");
    }
    if (parent && !(yield* parentExists(parent.parentType, parent.parentId))) {
      throw new Error("Attachment parent not found");
    }
    const row: Attachment = {
      type: attachmentType,
      id: attachment.id || uuidv7(),
      name: attachment.name.trim() || "file",
      mimeType: attachment.mimeType || "application/octet-stream",
      size: attachment.size,
      sha256: attachment.sha256,
      createdAt: Date.now(),
    };
    yield* insert(attachmentsTable, [row]);
    const [link] = parent
      ? yield* linkAttachments(parent.parentType, parent.parentId, [row.id])
      : [];
    return { attachment: row, link };
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
  if (parentType === noteType) {
    const next = withoutInlineReferences(
      yield* selectFrom(notesTable, "byId")
        .where((q) => q.eq("id", parentId))
        .first(),
      attachmentIds,
    );
    if (next) yield* upsert(notesTable, [next]);
  } else if (parentType === taskTemplateType) {
    const next = withoutInlineReferences(
      yield* selectFrom(taskTemplatesTable, "byId")
        .where((q) => q.eq("id", parentId))
        .first(),
      attachmentIds,
    );
    if (next) yield* upsert(taskTemplatesTable, [next]);
  } else {
    const next = withoutInlineReferences(
      yield* selectFrom(tasksTable, "byId")
        .where((q) => q.eq("id", parentId))
        .first(),
      attachmentIds,
    );
    if (next) yield* upsert(tasksTable, [next]);
  }
}

// Deletes files nothing lists any more. A file listed by an item in the trash
// stays, so restoring the item brings it back.
function* deleteOrphanedAttachments(attachmentIds: readonly string[]) {
  const ids = [...new Set(attachmentIds)];
  if (ids.length === 0) return;
  const linked = new Set(
    (yield* linksOfAttachments(ids)).map((link) => link.attachmentId),
  );
  const unlinked = ids.filter((id) => !linked.has(id));
  if (unlinked.length === 0) return;
  const trashed = yield* trashedAttachmentParents();
  const orphans = unlinked.filter((id) => !trashed.has(id));
  if (orphans.length > 0) yield* deleteRows(attachmentsTable, orphans);
}

// Removing a file from an item also removes it from the item's description,
// and deletes the file when no other item lists it.
export const removeItemAttachment = action({
  name: "removeItemAttachment",
  args: { id: v.string() },
  handler: function* removeItemAttachment({ id }) {
    const link = yield* itemAttachmentById({ id });
    if (!link) return;
    yield* deleteRows(itemAttachmentsTable, [link.id]);
    yield* removeInlineReferences(link.parentType, link.parentId, [
      link.attachmentId,
    ]);
    yield* deleteOrphanedAttachments([link.attachmentId]);
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
    for (const link of links) {
      parents.set(`${link.parentType}:${link.parentId}`, link);
    }
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
  },
});

// For conversions that replace an item with a new ID.
export function* moveItemAttachments(
  from: { parentType: AttachmentParentType; parentId: string },
  to: { parentType: AttachmentParentType; parentId: string },
) {
  const links = yield* itemAttachmentLinks(from);
  if (links.length === 0) return;
  yield* upsert(
    itemAttachmentsTable,
    links.map((link) => ({ ...link, ...to })),
  );
}

// Generated tasks list the same files as their template.
export function* copyItemAttachments(
  from: { parentType: AttachmentParentType; parentId: string },
  to: { parentType: AttachmentParentType; parentId: string },
) {
  const links = yield* itemAttachmentLinks(from);
  yield* linkAttachments(
    to.parentType,
    to.parentId,
    links.map((link) => link.attachmentId),
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
  yield* insert(
    itemAttachmentsTable,
    links.flatMap((link) => {
      const parentId = copyIds.get(`${link.parentType}:${link.parentId}`);
      return parentId
        ? [{ ...link, id: uuidv7(), parentId, createdAt: now }]
        : [];
    }),
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

// Returns the removed links so a trash snapshot can keep them.
export function* deleteItemAttachmentLinks(
  parentType: AttachmentParentType,
  parentIds: readonly string[],
) {
  const links = yield* itemAttachmentLinksOfParents(parentType, parentIds);
  if (links.length > 0) {
    yield* deleteRows(
      itemAttachmentsTable,
      links.map((link) => link.id),
    );
  }
  return links;
}

export function* deleteItemAttachmentLinksAndOrphans(
  parentType: AttachmentParentType,
  parentIds: readonly string[],
) {
  const links = yield* deleteItemAttachmentLinks(parentType, parentIds);
  yield* deleteOrphanedAttachments(links.map((link) => link.attachmentId));
}

export function* restoreItemAttachmentLinks(links: readonly ItemAttachment[]) {
  if (links.length === 0) return;
  const existing = new Set(
    (yield* attachmentsByIds({
      ids: [...new Set(links.map((link) => link.attachmentId))],
    })).map((file) => file.id),
  );
  const restored = links.filter((link) => existing.has(link.attachmentId));
  if (restored.length > 0) yield* insert(itemAttachmentsTable, restored);
}

// Called after trash rows are purged with the snapshots they held.
export function* deleteAttachmentsOfPurgedSnapshots(
  snapshots: readonly string[],
) {
  const ids: string[] = [];
  for (const raw of snapshots) {
    try {
      const snapshot = JSON.parse(raw) as TrashSnapshot;
      ids.push(...(snapshot.itemAttachments ?? []).map((l) => l.attachmentId));
    } catch {
      continue;
    }
  }
  yield* deleteOrphanedAttachments(ids);
}
