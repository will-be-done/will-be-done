import { describe, expect, it } from "vitest";
import { DB, execSync, selectSync, syncDispatch } from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import { dbIdTrait } from "../traits";
import { createItem, checklistItemChildren } from "./checklistItems";
import { appHandleDrop } from "./app";
import { addToDailyList, dailyEntryByTaskId } from "./dailyEntries";
import { createDailyList } from "./dailyLists";
import {
  convertNoteToTask,
  convertTaskToNote,
  createNoteNextToSectionItem,
  noteById,
} from "./notes";
import {
  createProjectSection,
  createTaskInSection,
  deleteProjectSections,
} from "./projectSections";
import { projectSectionItems } from "./projectSectionItems";
import { addToStash, stashEntryByTaskId } from "./stashEntries";
import { taskById, updateTask } from "./tasks";
import { trashedTasks } from "./trash";
import { registeredSpaceSyncableTables } from "./syncMap";
import { type Note, type Task } from "./tables";

function createDB() {
  const db = new DB(new BptreeInmemDriver(), {
    traits: [dbIdTrait("space", "a0000000-0000-4000-8000-000000000001")],
  });
  execSync(db.loadTables(registeredSpaceSyncableTables));
  const section = syncDispatch(
    db,
    createProjectSection({
      position: "append",
      sectionDraft: {
        id: "section-1",
        title: "Section",
        projectId: "project-1",
      },
    }),
  );
  return { db, sectionId: section.id };
}

function addTask(db: DB, projectSectionId: string, id: string) {
  return syncDispatch(
    db,
    createTaskInSection({
      projectSectionId,
      position: "append",
      taskAttrs: {
        id,
        title: `Title ${id}`,
        content: `Content ${id}`,
        briefDescription: `Summary ${id}`,
      },
    }),
  ) as Task;
}

describe("notes", () => {
  it("converts a task to a note in place, dropping schedule, stash and checklist", () => {
    const { db, sectionId } = createDB();
    const task = addTask(db, sectionId, "task-1");
    const dailyList = syncDispatch(
      db,
      createDailyList({ dailyList: { date: "2026-11-02" } }),
    );
    syncDispatch(
      db,
      addToDailyList({
        taskId: task.id,
        dailyListId: dailyList.id,
        position: "append",
      }),
    );
    syncDispatch(db, addToStash({ taskId: task.id, position: "append" }));
    syncDispatch(
      db,
      createItem({ item: { parentId: task.id, parentType: "task" } }),
    );

    const note = syncDispatch(db, convertTaskToNote({ taskId: task.id }));

    expect(note).toMatchObject({
      type: "note",
      title: task.title,
      content: task.content,
      briefDescription: task.briefDescription,
      projectSectionId: task.projectSectionId,
      orderToken: task.orderToken,
      createdAt: task.createdAt,
    });
    expect(note.id).not.toBe(task.id);
    expect(
      selectSync(db, { selector: noteById, args: { id: note.id } }),
    ).toEqual(note);
    expect(
      selectSync(db, { selector: taskById, args: { id: task.id } }),
    ).toBeUndefined();
    expect(
      selectSync(db, {
        selector: dailyEntryByTaskId,
        args: { taskId: task.id },
      }),
    ).toBeUndefined();
    expect(
      selectSync(db, {
        selector: stashEntryByTaskId,
        args: { taskId: task.id },
      }),
    ).toBeUndefined();
    expect(
      selectSync(db, {
        selector: checklistItemChildren,
        args: { parentId: task.id, parentType: "task" },
      }),
    ).toEqual([]);
    expect(selectSync(db, { selector: trashedTasks, args: {} })).toEqual([]);
  });

  it("converts a done task to a note that shows in its section", () => {
    const { db, sectionId } = createDB();
    const task = addTask(db, sectionId, "task-1");
    syncDispatch(db, updateTask({ id: task.id, task: { state: "done" } }));

    const note = syncDispatch(db, convertTaskToNote({ taskId: task.id }));

    expect(
      selectSync(db, {
        selector: projectSectionItems,
        args: { projectSectionId: sectionId },
      }).map((item) => item.id),
    ).toEqual([note.id]);
  });

  it("converts a note back to a todo task in place", () => {
    const { db, sectionId } = createDB();
    const original = addTask(db, sectionId, "task-1");
    const note = syncDispatch(db, convertTaskToNote({ taskId: original.id }));

    const task = syncDispatch(db, convertNoteToTask({ noteId: note.id }));

    expect(task).toMatchObject({
      type: "task",
      state: "todo",
      title: note.title,
      content: note.content,
      briefDescription: note.briefDescription,
      projectSectionId: note.projectSectionId,
      orderToken: note.orderToken,
      createdAt: note.createdAt,
      templateId: null,
      templateDate: null,
    });
    expect(task.id).not.toBe(note.id);
    expect(
      selectSync(db, { selector: noteById, args: { id: note.id } }),
    ).toBeUndefined();
    expect(
      selectSync(db, { selector: taskById, args: { id: task.id } }),
    ).toEqual(task);
  });

  it("orders notes among section tasks", () => {
    const { db, sectionId } = createDB();
    const first = addTask(db, sectionId, "task-1");
    const middle = addTask(db, sectionId, "task-2");
    const last = addTask(db, sectionId, "task-3");

    const note: Note = syncDispatch(
      db,
      convertTaskToNote({ taskId: middle.id }),
    );

    expect(
      selectSync(db, {
        selector: projectSectionItems,
        args: { projectSectionId: sectionId },
      }).map((item) => item.id),
    ).toEqual([first.id, note.id, last.id]);
  });

  it("moves a note dropped onto a task in another section", () => {
    const { db, sectionId } = createDB();
    const otherSection = syncDispatch(
      db,
      createProjectSection({
        position: "append",
        sectionDraft: { title: "Other", projectId: "project-1" },
      }),
    );
    const note = syncDispatch(
      db,
      convertTaskToNote({ taskId: addTask(db, sectionId, "task-1").id }),
    );
    const first = addTask(db, otherSection.id, "task-2");
    const second = addTask(db, otherSection.id, "task-3");

    syncDispatch(
      db,
      appHandleDrop({
        id: second.id,
        modelType: "task",
        dropId: note.id,
        dropModelType: "note",
        edge: "top",
      }),
    );

    expect(
      selectSync(db, {
        selector: projectSectionItems,
        args: { projectSectionId: otherSection.id },
      }).map((item) => item.id),
    ).toEqual([first.id, note.id, second.id]);
  });

  it.each(["before", "after"] as const)(
    "creates an empty note %s a section item",
    (position) => {
      const { db, sectionId } = createDB();
      const first = addTask(db, sectionId, "task-1");
      const note = syncDispatch(
        db,
        convertTaskToNote({ taskId: addTask(db, sectionId, "task-2").id }),
      );
      const last = addTask(db, sectionId, "task-3");

      const created = syncDispatch(
        db,
        createNoteNextToSectionItem({ itemId: note.id, position }),
      );

      expect(created).toMatchObject({
        type: "note",
        title: "",
        projectSectionId: sectionId,
      });
      expect(
        selectSync(db, {
          selector: projectSectionItems,
          args: { projectSectionId: sectionId },
        }).map((item) => item.id),
      ).toEqual(
        position === "before"
          ? [first.id, created.id, note.id, last.id]
          : [first.id, note.id, created.id, last.id],
      );
    },
  );

  it("deletes notes with their section", () => {
    const { db, sectionId } = createDB();
    const task = addTask(db, sectionId, "task-1");
    const note = syncDispatch(db, convertTaskToNote({ taskId: task.id }));

    syncDispatch(db, deleteProjectSections({ ids: [sectionId] }));

    expect(
      selectSync(db, { selector: noteById, args: { id: note.id } }),
    ).toBeUndefined();
  });
});
