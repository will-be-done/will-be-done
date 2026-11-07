import { createHash } from "node:crypto";
import type { Readable } from "node:stream";
import { asyncDispatch, selectAsync } from "@will-be-done/hyperdb";
import {
  type Attachment,
  attachmentById,
  type AttachmentParentType,
  attachmentsPage,
  attachmentUsages,
  attachToItem as attachToItemAction,
  createAttachment as createAttachmentAction,
  deleteAttachments,
  itemAttachmentById,
  itemAttachments,
  type ItemAttachment,
  MAX_ATTACHMENT_SIZE,
  noteById,
  removeItemAttachment as removeItemAttachmentAction,
  taskById,
  taskTemplateById,
} from "@will-be-done/slices/space";
import { getAttachmentStorage } from "../attachments/storage";
import { getSpaceDatabase } from "./databaseAccess";
import { BadRequestError, ResourceNotFoundError } from "./errors";
import { decodeNumericCursor, encodeNumericCursor } from "./pagination";

type SpaceDatabase = Awaited<ReturnType<typeof getSpaceDatabase>>;
type Parent = { parentType: AttachmentParentType; parentId: string };

export type PublicAttachment = Omit<Attachment, "type">;
export type PublicItemAttachment = Omit<ItemAttachment, "type"> & {
  attachment: PublicAttachment;
};

const toPublicAttachment = ({
  type: _type,
  ...attachment
}: Attachment): PublicAttachment => attachment;

const sha256Hex = (body: Buffer) =>
  createHash("sha256").update(body).digest("hex");

const assertSize = (body: Buffer) => {
  if (body.length > MAX_ATTACHMENT_SIZE) {
    throw new BadRequestError("Attachments are limited to 50 MB");
  }
};

async function requireAttachment(db: SpaceDatabase, attachmentId: string) {
  const attachment = await selectAsync(db, {
    selector: attachmentById,
    args: { id: attachmentId },
  });
  if (!attachment) throw new ResourceNotFoundError("Attachment");
  return attachment;
}

async function requireParent(
  db: SpaceDatabase,
  { parentType, parentId }: Parent,
) {
  const selector =
    parentType === "note"
      ? noteById
      : parentType === "template"
        ? taskTemplateById
        : taskById;
  const parent = await selectAsync(db, { selector, args: { id: parentId } });
  if (!parent) {
    throw new ResourceNotFoundError(
      parentType === "note"
        ? "Note"
        : parentType === "template"
          ? "Task template"
          : "Task",
    );
  }
}

export async function listAttachments({
  spaceId,
  userId,
  cursor,
  limit,
}: {
  spaceId: string;
  userId: string;
  cursor?: string;
  limit: number;
}) {
  const db = await getSpaceDatabase(spaceId, userId);
  const decoded = cursor ? decodeNumericCursor(cursor) : undefined;
  const page = await selectAsync(db, {
    selector: attachmentsPage,
    args: {
      limit,
      ...(decoded
        ? { cursor: { createdAt: decoded.sort, id: decoded.id } }
        : {}),
    },
  });
  const usages = await selectAsync(db, {
    selector: attachmentUsages,
    args: { attachmentIds: page.attachments.map(({ id }) => id) },
  });
  const last = page.attachments[page.attachments.length - 1];
  return {
    attachments: page.attachments.map((attachment) => ({
      ...toPublicAttachment(attachment),
      usages: usages[attachment.id] ?? [],
    })),
    nextCursor:
      page.hasMore && last
        ? encodeNumericCursor({ sort: last.createdAt, id: last.id })
        : null,
  };
}

export async function getAttachment({
  spaceId,
  userId,
  attachmentId,
}: {
  spaceId: string;
  userId: string;
  attachmentId: string;
}) {
  const db = await getSpaceDatabase(spaceId, userId);
  const attachment = await requireAttachment(db, attachmentId);
  const usages = await selectAsync(db, {
    selector: attachmentUsages,
    args: { attachmentIds: [attachmentId] },
  });
  return {
    ...toPublicAttachment(attachment),
    usages: usages[attachmentId] ?? [],
  };
}

export async function createAttachment({
  spaceId,
  userId,
  name,
  mimeType,
  body,
  parent,
}: {
  spaceId: string;
  userId: string;
  name: string;
  mimeType: string;
  body: Buffer;
  parent?: Parent;
}) {
  assertSize(body);
  const db = await getSpaceDatabase(spaceId, userId);
  if (parent) await requireParent(db, parent);
  const id = crypto.randomUUID();
  // Bytes first: a row whose upload failed would point at nothing, while
  // bytes without a row are swept by the cleanup job.
  await getAttachmentStorage().put(spaceId, id, body);
  const { attachment } = await asyncDispatch(
    db,
    createAttachmentAction({
      attachment: {
        id,
        name,
        mimeType,
        size: body.length,
        sha256: sha256Hex(body),
      },
      ...(parent ? { parent } : {}),
    }),
  );
  return toPublicAttachment(attachment);
}

// Clients create the row offline and upload its bytes once the row has synced.
export async function uploadAttachmentContent({
  spaceId,
  userId,
  attachmentId,
  body,
}: {
  spaceId: string;
  userId: string;
  attachmentId: string;
  body: Buffer;
}) {
  assertSize(body);
  const db = await getSpaceDatabase(spaceId, userId);
  const attachment = await requireAttachment(db, attachmentId);
  if (
    body.length !== attachment.size ||
    sha256Hex(body) !== attachment.sha256
  ) {
    throw new BadRequestError("Uploaded bytes do not match the attachment");
  }
  await getAttachmentStorage().put(spaceId, attachmentId, body);
}

export async function getAttachmentContent({
  spaceId,
  userId,
  attachmentId,
}: {
  spaceId: string;
  userId: string;
  attachmentId: string;
}): Promise<{ attachment: Attachment; body: Readable; size: number }> {
  const db = await getSpaceDatabase(spaceId, userId);
  const attachment = await requireAttachment(db, attachmentId);
  const stored = await getAttachmentStorage().get(spaceId, attachmentId);
  if (!stored) throw new ResourceNotFoundError("Attachment content");
  return { attachment, ...stored };
}

export async function deleteAttachment({
  spaceId,
  userId,
  attachmentId,
}: {
  spaceId: string;
  userId: string;
  attachmentId: string;
}) {
  const db = await getSpaceDatabase(spaceId, userId);
  await requireAttachment(db, attachmentId);
  await asyncDispatch(db, deleteAttachments({ ids: [attachmentId] }));
}

const toPublicItemAttachment = (
  { type: _type, ...link }: ItemAttachment,
  attachment: Attachment,
): PublicItemAttachment => ({
  ...link,
  attachment: toPublicAttachment(attachment),
});

export async function listItemAttachments({
  spaceId,
  userId,
  parent,
}: {
  spaceId: string;
  userId: string;
  parent: Parent;
}) {
  const db = await getSpaceDatabase(spaceId, userId);
  await requireParent(db, parent);
  const rows = await selectAsync(db, {
    selector: itemAttachments,
    args: parent,
  });
  return rows.map(({ link, attachment }) =>
    toPublicItemAttachment(link, attachment),
  );
}

export async function attachToItem({
  spaceId,
  userId,
  attachmentId,
  parent,
}: {
  spaceId: string;
  userId: string;
  attachmentId: string;
  parent: Parent;
}) {
  const db = await getSpaceDatabase(spaceId, userId);
  const attachment = await requireAttachment(db, attachmentId);
  await requireParent(db, parent);
  const link = await asyncDispatch(
    db,
    attachToItemAction({ attachmentId, ...parent }),
  );
  if (!link) throw new ResourceNotFoundError("Attachment");
  return toPublicItemAttachment(link, attachment);
}

export async function removeItemAttachment({
  spaceId,
  userId,
  itemAttachmentId,
}: {
  spaceId: string;
  userId: string;
  itemAttachmentId: string;
}) {
  const db = await getSpaceDatabase(spaceId, userId);
  const link = await selectAsync(db, {
    selector: itemAttachmentById,
    args: { id: itemAttachmentId },
  });
  if (!link) throw new ResourceNotFoundError("Item attachment");
  await asyncDispatch(db, removeItemAttachmentAction({ id: itemAttachmentId }));
}
