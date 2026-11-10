import { asyncDispatch, selectAsync } from "@will-be-done/hyperdb";
import {
  convertNoteToTask as convertNoteToTaskAction,
  convertTaskToNote as convertTaskToNoteAction,
  noteById,
  taskById,
  trashNotes,
  updateNote as updateNoteAction,
} from "@will-be-done/slices/space";
import { getSpaceDatabase } from "./databaseAccess";
import { ResourceNotFoundError } from "./errors";
import { toPublicNote, type PublicNote } from "./items";
import { resolveOrderToken, type Placement } from "./placement";
import { itemsInSection, requireSection } from "./sectionQueries";
import { toPublicTask, type PublicTask } from "./tasks";

type SpaceDatabase = Awaited<ReturnType<typeof getSpaceDatabase>>;

async function requireNote(db: SpaceDatabase, noteId: string) {
  const note = await selectAsync(db, {
    selector: noteById,
    args: { id: noteId },
  });
  if (!note) throw new ResourceNotFoundError("Note");
  return note;
}

export async function getNote({
  spaceId,
  noteId,
  userId,
}: {
  spaceId: string;
  noteId: string;
  userId: string;
}): Promise<PublicNote> {
  const db = await getSpaceDatabase(spaceId, userId);
  return toPublicNote(await requireNote(db, noteId));
}

export async function updateNote({
  spaceId,
  noteId,
  userId,
  updates,
}: {
  spaceId: string;
  noteId: string;
  userId: string;
  updates: { title?: string; content?: string; briefDescription?: string };
}): Promise<PublicNote> {
  const db = await getSpaceDatabase(spaceId, userId);
  await requireNote(db, noteId);
  return toPublicNote(
    await asyncDispatch(db, updateNoteAction({ id: noteId, note: updates })),
  );
}

export async function moveNote({
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
}): Promise<PublicNote> {
  const db = await getSpaceDatabase(spaceId, userId);
  await requireNote(db, noteId);
  await requireSection(db, projectSectionId);

  const updated = await asyncDispatch(
    db,
    updateNoteAction({
      id: noteId,
      note: {
        projectSectionId,
        orderToken: resolveOrderToken({
          entities: await itemsInSection(db, projectSectionId, noteId),
          placement,
        }),
      },
    }),
  );
  return toPublicNote(updated);
}

export async function deleteNote({
  spaceId,
  noteId,
  userId,
}: {
  spaceId: string;
  noteId: string;
  userId: string;
}): Promise<void> {
  const db = await getSpaceDatabase(spaceId, userId);
  await requireNote(db, noteId);
  await asyncDispatch(db, trashNotes({ ids: [noteId] }));
}

export async function convertTaskToNote({
  spaceId,
  taskId,
  userId,
}: {
  spaceId: string;
  taskId: string;
  userId: string;
}): Promise<PublicNote> {
  const db = await getSpaceDatabase(spaceId, userId);
  const task = await selectAsync(db, {
    selector: taskById,
    args: { id: taskId },
  });
  if (!task) throw new ResourceNotFoundError("Task");

  return toPublicNote(
    await asyncDispatch(db, convertTaskToNoteAction({ taskId })),
  );
}

export async function convertNoteToTask({
  spaceId,
  noteId,
  userId,
}: {
  spaceId: string;
  noteId: string;
  userId: string;
}): Promise<PublicTask> {
  const db = await getSpaceDatabase(spaceId, userId);
  await requireNote(db, noteId);
  return toPublicTask(
    await asyncDispatch(db, convertNoteToTaskAction({ noteId })),
    null,
  );
}
