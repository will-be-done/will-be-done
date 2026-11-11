import type { Readable } from "node:stream";
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
import {
  AttachmentStorage,
  type ExpectedContent,
} from "../attachments/storage";
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

// The length comes from Content-Length: S3 needs it before the body arrives.
const checkSize = (size: number | undefined) => {
  if (size === undefined || !Number.isSafeInteger(size) || size < 0) {
    return Effect.fail(new BadRequestError("Uploads need a Content-Length"));
  }
  return size > MAX_ATTACHMENT_SIZE
    ? Effect.fail(new BadRequestError("Attachments are limited to 50 MB"))
    : Effect.succeed(size);
};

const store = (
  spaceId: string,
  id: string,
  body: Readable,
  expected: ExpectedContent,
) =>
  Effect.gen(function* () {
    return yield* (yield* AttachmentStorage).put(spaceId, id, body, expected);
  }).pipe(
    Effect.catchTag("AttachmentContentMismatchError", () =>
      Effect.fail(
        new BadRequestError("Uploaded bytes do not match the attachment"),
      ),
    ),
  );

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
  contentLength,
  parent,
  ...space
}: Space & {
  name: string;
  mimeType: string;
  body: Readable;
  contentLength: number | undefined;
  parent?: Parent;
}) =>
  Effect.gen(function* () {
    const size = yield* checkSize(contentLength);
    const db = yield* spaceDatabase(space);
    if (parent) yield* requireParent(db, parent);
    const id = crypto.randomUUID();
    // Bytes first: a row whose upload failed would point at nothing, while
    // bytes without a row are swept by the cleanup job.
    const sha256 = yield* store(space.spaceId, id, body, { size });
    const { attachment } = yield* dispatch(
      db,
      createAttachmentAction({
        attachment: {
          id,
          name,
          mimeType,
          size,
          sha256,
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
  contentLength,
  ...space
}: Space & {
  attachmentId: string;
  body: Readable;
  contentLength: number | undefined;
}) =>
  Effect.gen(function* () {
    const size = yield* checkSize(contentLength);
    const db = yield* spaceDatabase(space);
    const attachment = yield* requireAttachment(db, attachmentId);
    if (size !== attachment.size) {
      return yield* Effect.fail(
        new BadRequestError("Uploaded bytes do not match the attachment"),
      );
    }
    yield* store(space.spaceId, attachmentId, body, {
      size,
      sha256: attachment.sha256,
    });
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
