import { createHash } from "node:crypto";
import {
  asyncDispatch,
  selectAsync,
  type ActionGenerator,
  type AnyObjectSelector,
  type SelectorReturn,
  type SelectorRunInput,
} from "@will-be-done/hyperdb";
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
import { Effect } from "effect";
import { AttachmentStorage } from "../attachments/storage";
import { getSpaceDatabase } from "./databaseAccess";
import { BadRequestError, ResourceNotFoundError } from "./errors";
import { decodeNumericCursor, encodeNumericCursor } from "./pagination";

type SpaceDatabase = Awaited<ReturnType<typeof getSpaceDatabase>>;
type Parent = { parentType: AttachmentParentType; parentId: string };
type Space = { spaceId: string; userId: string };

export type PublicAttachment = Omit<Attachment, "type">;
export type PublicItemAttachment = Omit<ItemAttachment, "type"> & {
  attachment: PublicAttachment;
};

const toPublicAttachment = ({
  type: _type,
  ...attachment
}: Attachment): PublicAttachment => attachment;

const toPublicItemAttachment = (
  { type: _type, ...link }: ItemAttachment,
  attachment: Attachment,
): PublicItemAttachment => ({
  ...link,
  attachment: toPublicAttachment(attachment),
});

const sha256Hex = (body: Buffer) =>
  createHash("sha256").update(body).digest("hex");

// Access and database failures keep the errors route handlers map to
// responses.
const spaceDatabase = ({ spaceId, userId }: Space) =>
  Effect.promise(() => getSpaceDatabase(spaceId, userId));

const select = <TSelector extends AnyObjectSelector>(
  db: SpaceDatabase,
  input: SelectorRunInput<TSelector>,
): Effect.Effect<SelectorReturn<TSelector>> =>
  Effect.promise(() => selectAsync(db, input));

const dispatch = <A>(db: SpaceDatabase, action: ActionGenerator<A>) =>
  Effect.promise(() => asyncDispatch(db, action));

const checkSize = (body: Buffer) =>
  body.length > MAX_ATTACHMENT_SIZE
    ? Effect.fail(new BadRequestError("Attachments are limited to 50 MB"))
    : Effect.void;

const requireAttachment = (db: SpaceDatabase, attachmentId: string) =>
  select(db, { selector: attachmentById, args: { id: attachmentId } }).pipe(
    Effect.flatMap((attachment) =>
      attachment
        ? Effect.succeed(attachment)
        : Effect.fail(new ResourceNotFoundError("Attachment")),
    ),
  );

const parentSelectors = {
  task: { selector: taskById, name: "Task" },
  template: { selector: taskTemplateById, name: "Task template" },
  note: { selector: noteById, name: "Note" },
} as const;

const requireParent = (db: SpaceDatabase, { parentType, parentId }: Parent) => {
  const { selector, name } = parentSelectors[parentType];
  return select(db, { selector, args: { id: parentId } }).pipe(
    Effect.flatMap((parent) =>
      parent ? Effect.void : Effect.fail(new ResourceNotFoundError(name)),
    ),
  );
};

export const listAttachments = ({
  cursor,
  limit,
  ...space
}: Space & { cursor?: string; limit: number }) =>
  Effect.gen(function* () {
    const db = yield* spaceDatabase(space);
    const decoded = cursor ? decodeNumericCursor(cursor) : undefined;
    const page = yield* select(db, {
      selector: attachmentsPage,
      args: {
        limit,
        ...(decoded
          ? { cursor: { createdAt: decoded.sort, id: decoded.id } }
          : {}),
      },
    });
    const usages = yield* select(db, {
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
  });

export const getAttachment = ({
  attachmentId,
  ...space
}: Space & { attachmentId: string }) =>
  Effect.gen(function* () {
    const db = yield* spaceDatabase(space);
    const attachment = yield* requireAttachment(db, attachmentId);
    const usages = yield* select(db, {
      selector: attachmentUsages,
      args: { attachmentIds: [attachmentId] },
    });
    return {
      ...toPublicAttachment(attachment),
      usages: usages[attachmentId] ?? [],
    };
  });

export const createAttachment = ({
  name,
  mimeType,
  body,
  parent,
  ...space
}: Space & {
  name: string;
  mimeType: string;
  body: Buffer;
  parent?: Parent;
}) =>
  Effect.gen(function* () {
    yield* checkSize(body);
    const db = yield* spaceDatabase(space);
    if (parent) yield* requireParent(db, parent);
    const id = crypto.randomUUID();
    // Bytes first: a row whose upload failed would point at nothing, while
    // bytes without a row are swept by the cleanup job.
    yield* (yield* AttachmentStorage).put(space.spaceId, id, body);
    const { attachment } = yield* dispatch(
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
  });

// Clients create the row offline and upload its bytes once the row has synced.
export const uploadAttachmentContent = ({
  attachmentId,
  body,
  ...space
}: Space & { attachmentId: string; body: Buffer }) =>
  Effect.gen(function* () {
    yield* checkSize(body);
    const db = yield* spaceDatabase(space);
    const attachment = yield* requireAttachment(db, attachmentId);
    if (
      body.length !== attachment.size ||
      sha256Hex(body) !== attachment.sha256
    ) {
      return yield* Effect.fail(
        new BadRequestError("Uploaded bytes do not match the attachment"),
      );
    }
    yield* (yield* AttachmentStorage).put(space.spaceId, attachmentId, body);
  });

export const getAttachmentContent = ({
  attachmentId,
  ...space
}: Space & { attachmentId: string }) =>
  Effect.gen(function* () {
    const db = yield* spaceDatabase(space);
    const attachment = yield* requireAttachment(db, attachmentId);
    const stored = yield* (yield* AttachmentStorage).get(
      space.spaceId,
      attachmentId,
    );
    if (!stored) {
      return yield* Effect.fail(
        new ResourceNotFoundError("Attachment content"),
      );
    }
    return { attachment, ...stored };
  });

export const deleteAttachment = ({
  attachmentId,
  ...space
}: Space & { attachmentId: string }) =>
  Effect.gen(function* () {
    const db = yield* spaceDatabase(space);
    yield* requireAttachment(db, attachmentId);
    yield* dispatch(db, deleteAttachments({ ids: [attachmentId] }));
  });

export const listItemAttachments = ({
  parent,
  ...space
}: Space & { parent: Parent }) =>
  Effect.gen(function* () {
    const db = yield* spaceDatabase(space);
    yield* requireParent(db, parent);
    const rows = yield* select(db, { selector: itemAttachments, args: parent });
    return rows.map(({ link, attachment }) =>
      toPublicItemAttachment(link, attachment),
    );
  });

export const attachToItem = ({
  attachmentId,
  parent,
  ...space
}: Space & { attachmentId: string; parent: Parent }) =>
  Effect.gen(function* () {
    const db = yield* spaceDatabase(space);
    const attachment = yield* requireAttachment(db, attachmentId);
    yield* requireParent(db, parent);
    const link = yield* dispatch(
      db,
      attachToItemAction({ attachmentId, ...parent }),
    );
    if (!link) {
      return yield* Effect.fail(new ResourceNotFoundError("Attachment"));
    }
    return toPublicItemAttachment(link, attachment);
  });

export const removeItemAttachment = ({
  itemAttachmentId,
  ...space
}: Space & { itemAttachmentId: string }) =>
  Effect.gen(function* () {
    const db = yield* spaceDatabase(space);
    const link = yield* select(db, {
      selector: itemAttachmentById,
      args: { id: itemAttachmentId },
    });
    if (!link) {
      return yield* Effect.fail(new ResourceNotFoundError("Item attachment"));
    }
    yield* dispatch(db, removeItemAttachmentAction({ id: itemAttachmentId }));
  });
