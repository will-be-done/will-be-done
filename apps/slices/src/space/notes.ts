import {
  deleteRows,
  insert,
  selectFrom,
  upsert,
  v,
} from "@will-be-done/hyperdb";
import { uuidv7 } from "uuidv7";
import { action, selector } from "../builders";
import { appById, appCanDrop } from "./app";
import { dailyEntryByTaskId } from "./dailyEntries";
import { stashEntryByTaskId } from "./stashEntries";
import {
  projectSectionItemById,
  projectSectionItemSiblings,
} from "./projectSectionItems";
import { firstProjectSectionChild } from "./projectSections";
import { deleteTasks, taskById, updateTask } from "./tasks";
import { updateTemplate } from "./taskTemplates";
import { registerModelSlice } from "./maps";
import {
  detachMindmapNodesOfItems,
  mindmapNodesByNoteIds,
  relinkMindmapNodes,
} from "./mindmaps";
import { syncItemRichText } from "./richTextItems";
import { generateKeyPositionedBetween } from "./utils";
import {
  checklistItemsTable,
  isDailyEntry,
  isNote,
  isTask,
  isTaskTemplate,
  Note,
  noteType,
  notesTable,
  possibleModelType,
  Task,
  tasksTable,
  taskType,
  trashedTasksTable,
  trashedTaskType,
  type TrashedTaskRow,
  type TrashSnapshot,
} from "./tables";

export const defaultNote: Note = {
  type: noteType,
  id: "default-note-id",
  title: "default note",
  orderToken: "",
  createdAt: 0,
  projectSectionId: "abeee7aa-8bf4-4a5f-9167-ce42ad6187b6",
};

const richTextOf = ({
  title,
  content,
  titleDoc,
  contentDoc,
}: Pick<Note, "title" | "content" | "titleDoc" | "contentDoc">) => ({
  title,
  ...(content === undefined ? {} : { content }),
  ...(titleDoc === undefined ? {} : { titleDoc }),
  ...(contentDoc === undefined ? {} : { contentDoc }),
});

export const noteById = selector({
  name: "noteById",
  args: { id: v.string() },
  handler: function* noteById({ id }) {
    const notes = yield* selectFrom(notesTable, "byId")
      .where((q) => q.eq("id", id))
      .limit(1);
    return notes[0] as Note | undefined;
  },
});

export const noteByIdOrDefault = selector({
  name: "noteByIdOrDefault",
  args: { id: v.string() },
  handler: function* noteByIdOrDefault({ id }) {
    return (yield* noteById({ id })) ?? defaultNote;
  },
});

export const allNotes = selector({
  name: "allNotes",
  args: {},
  handler: function* allNotes() {
    return yield* selectFrom(notesTable, "byProjectSectionIdOrder");
  },
});

// Converting drops these, so the UI asks before converting.
export const taskHasNoteIncompatibleData = selector({
  name: "taskHasNoteIncompatibleData",
  args: { taskId: v.string() },
  handler: function* taskHasNoteIncompatibleData({ taskId }) {
    const checklistItems = yield* selectFrom(
      checklistItemsTable,
      "byParentOrder",
    )
      .where((q) => q.eq("parentType", taskType).eq("parentId", taskId))
      .limit(1);
    if (checklistItems.length > 0) return true;
    if (yield* dailyEntryByTaskId({ taskId })) return true;
    return !!(yield* stashEntryByTaskId({ taskId }));
  },
});

export const updateNote = action({
  name: "updateNote",
  args: {
    id: v.string(),
    note: v.partial(notesTable.v()),
  },
  handler: function* updateNote({ id, note }) {
    const noteInState = yield* noteById({ id });
    if (!noteInState) throw new Error("Note not found");

    const updatedNote = syncItemRichText(noteInState, {
      ...noteInState,
      ...note,
    });
    yield* upsert(notesTable, [updatedNote]);
    return updatedNote;
  },
});

export const deleteNotes = action({
  name: "deleteNotes",
  args: { ids: v.array(v.string()) },
  handler: function* deleteNotes({ ids }) {
    yield* deleteRows(notesTable, ids);
    yield* detachMindmapNodesOfItems({ ids });
  },
});

export const trashNotes = action({
  name: "trashNotes",
  args: { ids: v.array(v.string()) },
  handler: function* trashNotes({ ids }) {
    if (ids.length === 0) return;
    const notes = yield* selectFrom(notesTable, "byId").where((q) =>
      ids.map((id) => q.eq("id", id)),
    );
    if (notes.length === 0) return;

    const noteIds = notes.map((note) => note.id);
    const mindmapNodes = yield* mindmapNodesByNoteIds({ noteIds });
    const trashedAt = Date.now();
    const trashed = notes.map(
      (note): TrashedTaskRow => ({
        type: trashedTaskType,
        id: note.id,
        trashedAt,
        snapshot: JSON.stringify({
          note,
          mindmapNodes: mindmapNodes.filter((node) => node.noteId === note.id),
        } satisfies TrashSnapshot),
      }),
    );
    yield* deleteNotes({ ids: noteIds });
    yield* insert(trashedTasksTable, trashed);
  },
});

export const createNoteNextToSectionItem = action({
  name: "createNoteNextToSectionItem",
  args: {
    itemId: v.string(),
    position: v.union(v.literal("before"), v.literal("after")),
  },
  handler: function* createNoteNextToSectionItem({ itemId, position }) {
    const item = yield* projectSectionItemById({ id: itemId });
    if (!item) throw new Error("Item not found");

    const note: Note = {
      type: noteType,
      id: uuidv7(),
      title: "",
      projectSectionId: item.projectSectionId,
      orderToken: generateKeyPositionedBetween(
        item,
        yield* projectSectionItemSiblings({ itemId }),
        position,
      ),
      createdAt: Date.now(),
    };
    yield* insert(notesTable, [note]);
    return note;
  },
});

export const moveNoteToProject = action({
  name: "moveNoteToProject",
  args: {
    noteId: v.string(),
    projectId: v.string(),
  },
  handler: function* moveNoteToProject({ noteId, projectId }) {
    const firstSection = yield* firstProjectSectionChild({ projectId });
    if (!firstSection) throw new Error("No sections found");

    yield* updateNote({
      id: noteId,
      note: { projectSectionId: firstSection.id },
    });
  },
});

export const convertTaskToNote = action({
  name: "convertTaskToNote",
  args: { taskId: v.string() },
  handler: function* convertTaskToNote({ taskId }) {
    const task = yield* taskById({ id: taskId });
    if (!task) throw new Error("Task not found");

    const id = uuidv7();
    yield* relinkMindmapNodes({
      from: task.id,
      to: { type: "note", id },
    });
    yield* deleteTasks({ ids: [task.id] });

    const note: Note = {
      type: noteType,
      id,
      ...richTextOf(task),
      projectSectionId: task.projectSectionId,
      orderToken: task.orderToken,
      createdAt: task.createdAt,
    };
    yield* insert(notesTable, [note]);
    return note;
  },
});

export const convertNoteToTask = action({
  name: "convertNoteToTask",
  args: { noteId: v.string() },
  handler: function* convertNoteToTask({ noteId }) {
    const note = yield* noteById({ id: noteId });
    if (!note) throw new Error("Note not found");

    const id = uuidv7();
    yield* relinkMindmapNodes({
      from: note.id,
      to: { type: "task", id },
    });
    yield* deleteNotes({ ids: [note.id] });

    const task: Task = {
      type: taskType,
      id,
      ...richTextOf(note),
      state: "todo",
      projectSectionId: note.projectSectionId,
      orderToken: note.orderToken,
      lastToggledAt: Date.now(),
      createdAt: note.createdAt,
      nature: "unknown",
      templateId: null,
      templateDate: null,
    };
    yield* insert(tasksTable, [task]);
    return task;
  },
});

export const noteCanDrop = selector({
  name: "noteCanDrop",
  args: {
    noteId: v.string(),
    dropId: v.string(),
    dropModelType: possibleModelType,
  },
  handler: function* noteCanDrop({ noteId, dropId, dropModelType }) {
    // App drops unwrap stash entries before calling the item handler.
    if (dropModelType === "stashEntry") return false;

    return yield* appCanDrop({
      id: noteId,
      modelType: noteType,
      dropId,
      dropModelType,
    });
  },
});

export const noteHandleDrop = action({
  name: "noteHandleDrop",
  args: {
    noteId: v.string(),
    dropId: v.string(),
    dropModelType: possibleModelType,
    edge: v.union(v.literal("top"), v.literal("bottom")),
  },
  handler: function* noteHandleDrop({ noteId, dropId, dropModelType, edge }) {
    if (!(yield* noteCanDrop({ noteId, dropId, dropModelType }))) return;

    const note = yield* noteById({ id: noteId });
    if (!note) return;

    const dropItem = yield* appById({ id: dropId, modelType: dropModelType });
    if (!dropItem) return;

    const position = {
      projectSectionId: note.projectSectionId,
      orderToken: generateKeyPositionedBetween(
        note,
        yield* projectSectionItemSiblings({ itemId: noteId }),
        edge === "top" ? "before" : "after",
      ),
    };

    if (isTask(dropItem)) {
      yield* updateTask({ id: dropItem.id, task: position });
    } else if (isTaskTemplate(dropItem)) {
      yield* updateTemplate({ id: dropItem.id, template: position });
    } else if (isNote(dropItem)) {
      yield* updateNote({ id: dropItem.id, note: position });
    } else if (isDailyEntry(dropItem)) {
      // Moves the underlying task and keeps its daily entry.
      yield* updateTask({ id: dropItem.taskId, task: position });
    }
  },
});

const notesSlice = {
  byId: noteById,
  delete: trashNotes,
  canDrop: noteCanDrop,
  handleDrop: noteHandleDrop,
};

registerModelSlice(notesSlice, notesTable, noteType);
