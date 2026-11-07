import type { HyperDB } from "@will-be-done/hyperdb";
import { Effect } from "effect";
import {
  convertNoteToTask as convertNoteToTaskAction,
  convertTaskToNote as convertTaskToNoteAction,
  noteById,
  trashNotes,
  updateNote as updateNoteAction,
} from "@will-be-done/slices/space";
import { getSpaceDatabase } from "./databaseAccess";
import { ResourceNotFoundError } from "./errors";
import { dispatch, select } from "./hyperdb";
import { toPublicNote } from "./items";
import { resolveOrderToken, type Placement } from "./placement";
import { itemsInSection, requireSection } from "./sectionQueries";
import { requireTask, toPublicTask } from "./tasks";

export const requireNote = Effect.fnUntraced(function* (
  db: HyperDB,
  noteId: string,
) {
  const note = yield* select(db, { selector: noteById, args: { id: noteId } });
  if (!note) return yield* new ResourceNotFoundError({ resource: "Note" });
  return note;
});

export const getNote = Effect.fn("getNote")(function* ({
  spaceId,
  noteId,
  userId,
}: {
  spaceId: string;
  noteId: string;
  userId: string;
}) {
  const db = yield* getSpaceDatabase(spaceId, userId);
  return toPublicNote(yield* requireNote(db, noteId));
});

export const updateNote = Effect.fn("updateNote")(function* ({
  spaceId,
  noteId,
  userId,
  updates,
}: {
  spaceId: string;
  noteId: string;
  userId: string;
  updates: { title?: string; content?: string };
}) {
  const db = yield* getSpaceDatabase(spaceId, userId);
  yield* requireNote(db, noteId);
  return toPublicNote(
    yield* dispatch(db, updateNoteAction({ id: noteId, note: updates })),
  );
});

export const moveNote = Effect.fn("moveNote")(function* ({
  spaceId,
  noteId,
  userId,
  projectSectionId,
  placement,
}: {
  spaceId: string;
  noteId: string;
  userId: string;
  projectSectionId: string;
  placement: Placement;
}) {
  const db = yield* getSpaceDatabase(spaceId, userId);
  yield* requireNote(db, noteId);
  yield* requireSection(db, projectSectionId);

  const updated = yield* dispatch(
    db,
    updateNoteAction({
      id: noteId,
      note: {
        projectSectionId,
        orderToken: yield* resolveOrderToken({
          entities: yield* itemsInSection(db, projectSectionId, noteId),
          placement,
        }),
      },
    }),
  );
  return toPublicNote(updated);
});

export const deleteNote = Effect.fn("deleteNote")(function* ({
  spaceId,
  noteId,
  userId,
}: {
  spaceId: string;
  noteId: string;
  userId: string;
}) {
  const db = yield* getSpaceDatabase(spaceId, userId);
  yield* requireNote(db, noteId);
  yield* dispatch(db, trashNotes({ ids: [noteId] }));
});

export const convertTaskToNote = Effect.fn("convertTaskToNote")(function* ({
  spaceId,
  taskId,
  userId,
}: {
  spaceId: string;
  taskId: string;
  userId: string;
}) {
  const db = yield* getSpaceDatabase(spaceId, userId);
  yield* requireTask(db, taskId);
  return toPublicNote(yield* dispatch(db, convertTaskToNoteAction({ taskId })));
});

export const convertNoteToTask = Effect.fn("convertNoteToTask")(function* ({
  spaceId,
  noteId,
  userId,
}: {
  spaceId: string;
  noteId: string;
  userId: string;
}) {
  const db = yield* getSpaceDatabase(spaceId, userId);
  yield* requireNote(db, noteId);
  return toPublicTask(
    yield* dispatch(db, convertNoteToTaskAction({ noteId })),
    null,
  );
});
