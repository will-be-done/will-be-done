import {
  asyncDispatch,
  createAction,
  DB,
  execAsync,
  insert,
  PreloadedHybridDB,
  selectAsync,
  selectFrom,
  SubscribableDB,
  upsert,
} from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import { isUndoReplay } from "@will-be-done/hyperdb/undo";
import {
  checklistItemById,
  convertTaskToNote,
  createItem,
  createProjectSection,
  createTaskInSection,
  dailyListsTable,
  deleteItems,
  deleteProjects,
  projectById,
  projectsTable,
  registeredSpaceSyncableTables,
  type DailyList,
  type Project,
} from "@will-be-done/slices/space";
import { dbIdTrait } from "@will-be-done/slices/traits";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { toast } from "sonner";
import { withUndoToast, installUndo, replayHistory } from "./undo";

vi.mock("sonner", () => ({
  toast: Object.assign(
    vi.fn(() => "toast-id"),
    { dismiss: vi.fn() },
  ),
}));

const action = createAction();
const saveProject = action({
  name: "undoTestSaveProject",
  args: { project: projectsTable.v() },
  handler: function* ({ project }) {
    yield* upsert(projectsTable, [project]);
  },
});

const coldDailyList: DailyList = {
  type: "dailyList",
  id: "daily-list-1",
  date: "2026-01-01",
};

const project: Project = {
  type: "project",
  id: "project-1",
  title: "First",
  icon: "",
  isInbox: false,
  orderToken: "a0",
  createdAt: 0,
};

async function setup() {
  const primary = new DB(new BptreeInmemDriver(), {
    traits: [dbIdTrait("space", "a0000000-0000-4000-8000-000000000001")],
  });
  // Left unhydrated, so reading it makes a replay wait on persistence.
  await execAsync(primary.loadTables([dailyListsTable]));
  await asyncDispatch(primary, insert(dailyListsTable, [coldDailyList]));
  const db = new SubscribableDB(new PreloadedHybridDB(primary));
  await execAsync(db.loadTables(registeredSpaceSyncableTables));
  installUndo(db);

  const save = (title: string, id = project.id) =>
    asyncDispatch(db, saveProject({ project: { ...project, id, title } }));
  const saveRemote = (title: string) =>
    asyncDispatch(
      db.withTraits({ type: "skip-sync" }),
      saveProject({ project: { ...project, title } }),
    );
  const title = async (id = project.id) =>
    (await selectAsync(db, { selector: projectById, args: { id } }))?.title;

  return { db, save, saveRemote, title };
}

describe("replayHistory", () => {
  it("keeps sync merges out of history", async () => {
    const { db, saveRemote, title } = await setup();

    await saveRemote("Remote");
    await replayHistory(db, "undo");

    expect(await title()).toBe("Remote");
  });

  it("runs presses in order while a replay waits on persistence", async () => {
    const { db, save, title } = await setup();
    db.afterChange(function* (_db, _table, traits) {
      if (!isUndoReplay(traits)) return;
      yield* selectFrom(dailyListsTable, "byId").where((q) =>
        q.eq("id", coldDailyList.id),
      );
    });

    await save("First");
    await save("Second");
    await save("Third");
    void replayHistory(db, "undo");
    await replayHistory(db, "undo");
    expect(await title()).toBe("First");

    void replayHistory(db, "redo");
    await replayHistory(db, "redo");
    expect(await title()).toBe("Third");
  });

  it("drops a conflicting step and moves on to the one before it", async () => {
    const { db, save, saveRemote, title } = await setup();

    await saveRemote("First");
    await save("Other", "project-2");
    await save("Second");
    await saveRemote("Remote");

    await replayHistory(db, "undo");
    expect(await title()).toBe("Remote");
    expect(await title("project-2")).toBe("Other");

    await replayHistory(db, "undo");
    expect(await title("project-2")).toBe(undefined);
  });
});

const toastText = (call: number) => {
  const [title] = vi.mocked(toast).mock.calls[call] ?? [];
  return renderToStaticMarkup(typeof title === "function" ? title() : title);
};

describe("withUndoToast", () => {
  beforeEach(() => vi.clearAllMocks());

  it("offers undo only while the delete is the latest step", async () => {
    const { db, save } = await setup();
    await save("First");
    await asyncDispatch(
      db,
      createProjectSection({
        sectionDraft: { projectId: project.id, title: "Column" },
        position: "append",
      }),
    );
    const remove = (id: string) =>
      withUndoToast(db, () => asyncDispatch(db, deleteProjects({ ids: [id] })));

    await remove(project.id);
    expect(toastText(0)).toContain(
      renderToStaticMarkup('Project "First" was deleted'),
    );

    await remove("missing");
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast.dismiss).not.toHaveBeenCalled();

    await save("Other", "project-2");
    expect(toast.dismiss).toHaveBeenCalledWith("toast-id");
  });

  const setupTask = async () => {
    const { db, save } = await setup();
    await save("First");
    const section = await asyncDispatch(
      db,
      createProjectSection({
        sectionDraft: { projectId: project.id, title: "Column" },
        position: "append",
      }),
    );
    const task = await asyncDispatch(
      db,
      createTaskInSection({
        projectSectionId: section.id,
        position: "append",
        taskAttrs: { title: "Buy milk" },
      }),
    );
    return { db, task };
  };

  it("names a task replaced by a note as converted, not deleted", async () => {
    const { db, task } = await setupTask();

    await withUndoToast(db, () =>
      asyncDispatch(db, convertTaskToNote({ taskId: task.id })),
    );

    expect(toastText(0)).toContain(
      renderToStaticMarkup('Task "Buy milk" was converted to a note'),
    );
  });

  it("names a deleted checklist item, and undo restores its text", async () => {
    const { db, task } = await setupTask();
    const item = await asyncDispatch(
      db,
      createItem({
        item: {
          parentId: task.id,
          parentType: "task",
          content: "Call **Bob**",
        },
      }),
    );

    await withUndoToast(db, () =>
      asyncDispatch(db, deleteItems({ ids: [item.id] })),
    );
    expect(toastText(0)).toContain(
      renderToStaticMarkup('Checklist item "Call Bob" was deleted'),
    );

    await replayHistory(db, "undo");
    const restored = await selectAsync(db, {
      selector: checklistItemById,
      args: { id: item.id },
    });
    expect(restored?.content).toBe("Call **Bob**");
  });
});
