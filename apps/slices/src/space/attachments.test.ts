import { describe, expect, test } from "vitest";
import {
  createAction,
  createSelector,
  DB,
  execSync,
  insert,
  selectFrom,
  selectSync,
  syncDispatch,
  v,
} from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import { dbIdTrait } from "../traits";
import { registeredSpaceSyncableTables } from "./syncMap";
import {
  attachmentsTable,
  itemAttachmentsTable,
  notesTable,
  noteType,
  projectSectionsTable,
  projectSectionType,
  tasksTable,
  taskTemplatesTable,
  taskType,
  type AttachmentParentType,
  type Task,
  type TaskTemplate,
} from "./tables";
import {
  attachmentUsages,
  attachToItem,
  createAttachment,
  deleteAttachments,
  itemAttachments,
  removeItemAttachment,
} from "./attachments";
import { trashTasks, updateTask } from "./tasks";
import { convertTaskToNote } from "./notes";
import { emptyTrash, restoreTrashedTasks } from "./trash";
import { generateTasksForTemplate } from "./taskTemplates";
import { getSpaceBackup, loadSpaceBackup } from "./backup";
import { insertItemCopies } from "./selection";
import { deleteItemsByIds } from "./items";

const action = createAction();
const selector = createSelector();

const sha256 = "a".repeat(64);

const task = (id: string): Task => ({
  type: taskType,
  id,
  title: id,
  state: "todo",
  projectSectionId: "section",
  orderToken: id === "t1" ? "a1" : "a2",
  lastToggledAt: 0,
  nature: "unknown",
  createdAt: 0,
  templateId: null,
  templateDate: null,
});

const seed = action({
  name: "seedAttachmentTest",
  args: {},
  handler: function* () {
    yield* insert(projectSectionsTable, [
      {
        type: projectSectionType,
        id: "section",
        title: "Section",
        orderToken: "a",
        projectId: "project",
        createdAt: 0,
      },
    ]);
    yield* insert(tasksTable, [task("t1"), task("t2")]);
  },
});

const insertNote = action({
  name: "insertNoteAttachmentTest",
  args: { id: v.string() },
  handler: function* ({ id }) {
    yield* insert(notesTable, [
      {
        type: noteType,
        id,
        title: "",
        projectSectionId: "section",
        orderToken: "b",
        createdAt: 0,
      },
    ]);
  },
});

const insertTemplate = action({
  name: "insertTemplateAttachmentTest",
  args: {},
  handler: function* () {
    const day = 24 * 60 * 60 * 1000;
    const template: TaskTemplate = {
      type: "template",
      id: "template",
      title: "Weekly report",
      orderToken: "a3",
      repeatRule: "FREQ=DAILY;INTERVAL=1",
      repeatRuleDtStart: Date.UTC(2026, 0, 1),
      createdAt: Date.UTC(2026, 0, 1),
      lastGeneratedAt: Date.UTC(2026, 0, 1) + day / 2,
      projectSectionId: "section",
    };
    yield* insert(taskTemplatesTable, [template]);
  },
});

const copyTask = action({
  name: "copyTaskAttachmentTest",
  args: { id: v.string() },
  handler: function* ({ id }) {
    const original = yield* selectFrom(tasksTable, "byId")
      .where((q) => q.eq("id", id))
      .first();
    return [...(yield* insertItemCopies([original!])).values()];
  },
});

const rows = selector({
  name: "rowsAttachmentTest",
  args: {},
  handler: function* () {
    return {
      attachments: yield* selectFrom(attachmentsTable, "byIds"),
      links: yield* selectFrom(itemAttachmentsTable, "byIds"),
      tasks: yield* selectFrom(tasksTable, "byIds"),
      notes: yield* selectFrom(notesTable, "byIds"),
    };
  },
});

function createDB() {
  const db = new DB(new BptreeInmemDriver(), {
    traits: [dbIdTrait("space", "a0000000-0000-4000-8000-000000000001")],
  });
  execSync(db.loadTables(registeredSpaceSyncableTables));
  syncDispatch(db, seed({}));
  return db;
}

const read = (db: DB) => selectSync(db, { selector: rows, args: {} });

const listOf = (
  db: DB,
  parentId: string,
  parentType: AttachmentParentType = taskType,
) =>
  selectSync(db, {
    selector: itemAttachments,
    args: { parentType, parentId },
  }).map(({ attachment }) => attachment.id);

function addFile(db: DB, id: string, parentId?: string) {
  return syncDispatch(
    db,
    createAttachment({
      attachment: {
        id,
        name: `${id}.png`,
        mimeType: "image/png",
        size: 3,
        sha256,
      },
      ...(parentId ? { parent: { parentType: taskType, parentId } } : {}),
    }),
  );
}

describe("attachments", () => {
  test("rejects files over 50 MB", () => {
    const db = createDB();
    expect(() =>
      syncDispatch(
        db,
        createAttachment({
          attachment: {
            name: "big.bin",
            mimeType: "application/octet-stream",
            size: 50 * 1024 * 1024 + 1,
            sha256,
          },
        }),
      ),
    ).toThrow("50 MB");
  });

  test("rejects IDs that inline references cannot name", () => {
    const db = createDB();
    expect(() => addFile(db, "a.b")).toThrow("ID");
  });

  test("an inline reference lists the file under the item", () => {
    const db = createDB();
    addFile(db, "f1");

    syncDispatch(
      db,
      updateTask({
        id: "t1",
        task: { content: "See ![f1.png](wbd-attachment:f1)" },
      }),
    );
    syncDispatch(
      db,
      updateTask({ id: "t1", task: { content: "Again wbd-attachment:f1" } }),
    );
    syncDispatch(
      db,
      updateTask({
        id: "t2",
        task: { content: "![gone](wbd-attachment:missing)" },
      }),
    );
    addFile(db, "f2");
    syncDispatch(
      db,
      updateTask({
        id: "t2",
        task: { title: "Fix ![f2.png](wbd-attachment:f2)" },
      }),
    );

    expect(listOf(db, "t1")).toEqual(["f1"]);
    expect(listOf(db, "t2")).toEqual(["f2"]);
  });

  // The server deletes files left unlisted once replicas have settled, so a
  // replica never deletes one another replica has just listed.
  test("removing from an item strips inline references and keeps the file", () => {
    const db = createDB();
    const { link } = addFile(db, "f1", "t1");
    syncDispatch(
      db,
      updateTask({
        id: "t1",
        task: {
          title: "Fix ![f1.png](wbd-attachment:f1) now",
          content: "Before ![f1.png](wbd-attachment:f1) after",
        },
      }),
    );
    syncDispatch(
      db,
      attachToItem({
        attachmentId: "f1",
        parentType: taskType,
        parentId: "t2",
      }),
    );

    syncDispatch(db, removeItemAttachment({ id: link!.id }));

    let state = read(db);
    expect(state.tasks.find((t) => t.id === "t1")).toMatchObject({
      title: "Fix  now",
      content: "Before  after",
    });
    expect(state.attachments.map((a) => a.id)).toEqual(["f1"]);

    const [{ link: other }] = selectSync(db, {
      selector: itemAttachments,
      args: { parentType: taskType, parentId: "t2" },
    });
    syncDispatch(db, removeItemAttachment({ id: other!.id }));

    state = read(db);
    expect(state.attachments.map((a) => a.id)).toEqual(["f1"]);
    expect(state.links).toEqual([]);
  });

  test("deleting a file removes it from every item and description", () => {
    const db = createDB();
    addFile(db, "f1", "t1");
    syncDispatch(
      db,
      updateTask({
        id: "t2",
        task: { content: "Start ![x](wbd-attachment:f1) end" },
      }),
    );

    syncDispatch(db, deleteAttachments({ ids: ["f1"] }));

    const state = read(db);
    expect(state.attachments).toEqual([]);
    expect(state.links).toEqual([]);
    expect(state.tasks.find((t) => t.id === "t2")?.content).toBe("Start  end");
  });

  test("converting a task to a note keeps its files", () => {
    const db = createDB();
    addFile(db, "f1", "t1");

    const note = syncDispatch(db, convertTaskToNote({ taskId: "t1" }));

    expect(listOf(db, note.id, "note")).toEqual(["f1"]);
    expect(read(db).attachments.map((a) => a.id)).toEqual(["f1"]);
  });

  test("copied items list the same files", () => {
    const db = createDB();
    addFile(db, "f1", "t1");

    const [copy] = syncDispatch(db, copyTask({ id: "t1" }));

    expect(listOf(db, copy!.id)).toEqual(["f1"]);
    expect(listOf(db, "t1")).toEqual(["f1"]);
  });

  test("trash keeps links until it is emptied", () => {
    const db = createDB();
    addFile(db, "f1", "t1");

    syncDispatch(db, trashTasks({ ids: ["t1"] }));
    expect(
      selectSync(db, {
        selector: attachmentUsages,
        args: { attachmentIds: ["f1"] },
      }).f1,
    ).toEqual([
      { parentType: taskType, parentId: "t1", title: "", trashed: true },
    ]);

    syncDispatch(db, restoreTrashedTasks({ ids: ["t1"] }));
    expect(listOf(db, "t1")).toEqual(["f1"]);

    // A note sharing the task's ID keeps its own links.
    syncDispatch(db, insertNote({ id: "t1" }));
    syncDispatch(
      db,
      attachToItem({
        attachmentId: "f1",
        parentType: noteType,
        parentId: "t1",
      }),
    );
    syncDispatch(db, trashTasks({ ids: ["t1"] }));
    syncDispatch(db, emptyTrash({}));
    expect(read(db).attachments.map((a) => a.id)).toEqual(["f1"]);
    expect(listOf(db, "t1")).toEqual([]);
    expect(listOf(db, "t1", noteType)).toEqual(["f1"]);
  });

  test("deleting a file removes it from items in the trash", () => {
    const db = createDB();
    addFile(db, "f1", "t1");
    syncDispatch(
      db,
      updateTask({
        id: "t1",
        task: { content: "Start ![x](wbd-attachment:f1) end" },
      }),
    );
    syncDispatch(db, trashTasks({ ids: ["t1"] }));

    syncDispatch(db, deleteAttachments({ ids: ["f1"] }));
    syncDispatch(db, restoreTrashedTasks({ ids: ["t1"] }));

    expect(read(db).tasks.find((t) => t.id === "t1")?.content).toBe(
      "Start  end",
    );
    expect(listOf(db, "t1")).toEqual([]);
  });

  test("generated tasks list their template's files", () => {
    const db = createDB();
    syncDispatch(db, insertTemplate({}));
    addFile(db, "f1");
    syncDispatch(
      db,
      attachToItem({
        attachmentId: "f1",
        parentType: "template",
        parentId: "template",
      }),
    );

    syncDispatch(
      db,
      generateTasksForTemplate({
        templateId: "template",
        toDate: Date.UTC(2026, 0, 3),
      }),
    );

    const generated = read(db).tasks.filter((t) => t.templateId);
    expect(generated.length).toBeGreaterThan(0);
    for (const { id } of generated) expect(listOf(db, id)).toEqual(["f1"]);
    const usages = selectSync(db, {
      selector: attachmentUsages,
      args: { attachmentIds: ["f1"] },
    }).f1;
    expect(usages).toHaveLength(generated.length + 1);
  });

  test("replicas linking the same file to an item create the same link", () => {
    const generate = () => {
      const db = createDB();
      syncDispatch(db, insertTemplate({}));
      addFile(db, "f1");
      syncDispatch(
        db,
        attachToItem({
          attachmentId: "f1",
          parentType: "template",
          parentId: "template",
        }),
      );
      syncDispatch(
        db,
        generateTasksForTemplate({
          templateId: "template",
          toDate: Date.UTC(2026, 0, 3),
        }),
      );
      syncDispatch(
        db,
        updateTask({ id: "t1", task: { content: "![f1](wbd-attachment:f1)" } }),
      );
      return read(db)
        .links.filter((link) => link.parentType === taskType)
        .map((link) => link.id)
        .sort();
    };

    const ids = generate();
    expect(ids.length).toBeGreaterThan(0);
    expect(generate()).toEqual(ids);
  });

  test("deleting items for good removes their links", () => {
    const db = createDB();
    addFile(db, "f1", "t1");
    addFile(db, "f2", "t2");
    const note = syncDispatch(db, convertTaskToNote({ taskId: "t2" }));

    syncDispatch(db, deleteItemsByIds({ ids: ["t1", note!.id] }));

    expect(read(db).links).toEqual([]);
  });

  test("backups carry files and their links", () => {
    const db = createDB();
    addFile(db, "f1", "t1");
    addFile(db, "f2", "t2");
    syncDispatch(db, trashTasks({ ids: ["t2"] }));
    const backup = selectSync(db, { selector: getSpaceBackup, args: {} });

    const restored = createDB();
    syncDispatch(restored, loadSpaceBackup({ backup }));
    syncDispatch(restored, restoreTrashedTasks({ ids: ["t2"] }));

    expect(
      read(restored)
        .attachments.map((a) => a.id)
        .sort(),
    ).toEqual(["f1", "f2"]);
    expect(listOf(restored, "t1")).toEqual(["f1"]);
    expect(listOf(restored, "t2")).toEqual(["f2"]);
  });

  test("backups skip file rows a client could not have written", () => {
    const db = createDB();
    addFile(db, "f1", "t1");
    const backup = selectSync(db, { selector: getSpaceBackup, args: {} });
    const [valid] = backup.attachments!;
    backup.attachments!.push(
      { ...valid!, id: "a.b" },
      { ...valid!, id: "bad-sha", sha256: "not hex" },
      { ...valid!, id: "too-big", size: 50 * 1024 * 1024 + 1 },
      { ...valid!, id: "fraction", size: 1.5 },
    );
    const [link] = backup.itemAttachments!;
    backup.itemAttachments!.push({ ...link!, id: "l2", attachmentId: "a.b" });

    const restored = createDB();
    syncDispatch(restored, loadSpaceBackup({ backup }));

    expect(read(restored).attachments.map((a) => a.id)).toEqual(["f1"]);
    expect(read(restored).links.map((l) => l.attachmentId)).toEqual(["f1"]);
  });
});
