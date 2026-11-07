import { describe, expect, it } from "vitest";
import {
  createAction,
  DB,
  execSync,
  insert,
  selectSync,
  syncDispatch,
} from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import {
  appHandleDropMany,
  checklistItemChildren,
  attachmentsTable,
  checklistItemsTable,
  itemAttachmentsTable,
  dailyEntriesByDailyListId,
  dailyEntriesTable,
  dailyEntryByTaskId,
  dailyListsTable,
  defaultChecklistItem,
  defaultDailyEntry,
  defaultDailyList,
  defaultProject,
  defaultProjectSection,
  defaultTask,
  moveListItemsToProject,
  notesTable,
  allTasks,
  pasteListItemCopies,
  projectSectionItemIds,
  projectSectionsTable,
  projectsTable,
  setListItemsTaskState,
  stashEntriesTable,
  taskById,
  tasksTable,
  taskTemplatesTable,
  type Task,
} from "./index";

const task = (id: string, projectSectionId: string, orderToken: string) =>
  ({ ...defaultTask, id, projectSectionId, orderToken }) satisfies Task;

function createDB() {
  const db = new DB(new BptreeInmemDriver());
  execSync(
    db.loadTables([
      tasksTable,
      taskTemplatesTable,
      notesTable,
      dailyEntriesTable,
      dailyListsTable,
      stashEntriesTable,
      projectsTable,
      projectSectionsTable,
      checklistItemsTable,
      attachmentsTable,
      itemAttachmentsTable,
    ]),
  );
  const seed = createAction()({
    name: "seedSelection",
    args: {},
    handler: function* () {
      yield* insert(projectsTable, [
        { ...defaultProject, id: "p1", orderToken: "a0" },
        { ...defaultProject, id: "p2", orderToken: "a1" },
      ]);
      yield* insert(projectSectionsTable, [
        { ...defaultProjectSection, id: "s1", projectId: "p1" },
        { ...defaultProjectSection, id: "s2", projectId: "p2" },
      ]);
      yield* insert(tasksTable, [
        task("a", "s1", "a0"),
        task("b", "s1", "a1"),
        task("c", "s1", "a2"),
        { ...task("d", "s1", "a3"), state: "done" },
        task("x", "s2", "a0"),
        task("y", "s2", "a1"),
      ]);
      yield* insert(checklistItemsTable, [
        {
          ...defaultChecklistItem,
          id: "check-a",
          parentId: "a",
          content: "step",
          orderToken: "a0",
        },
      ]);
      yield* insert(dailyListsTable, [
        { ...defaultDailyList, id: "day", date: "01-10-2026" },
      ]);
      yield* insert(dailyEntriesTable, [
        {
          ...defaultDailyEntry,
          id: "entry-c",
          taskId: "c",
          dailyListId: "day",
          orderToken: "a0",
        },
      ]);
    },
  });
  syncDispatch(db, seed({}));
  return db;
}

const sectionOrder = (db: DB, projectSectionId: string) =>
  selectSync(db, {
    selector: projectSectionItemIds,
    args: { projectSectionId },
  });

const dayOrder = (db: DB) =>
  selectSync(db, {
    selector: dailyEntriesByDailyListId,
    args: { dailyListId: "day" },
  }).map((entry) => entry.taskId);

const xy = [
  { id: "x", modelType: "task" as const },
  { id: "y", modelType: "task" as const },
];

describe("appHandleDropMany", () => {
  it.each([
    ["task", "b", "top", ["a", "x", "y", "b", "c"]],
    ["task", "b", "bottom", ["a", "b", "x", "y", "c"]],
    ["projectSection", "s1", "top", ["x", "y", "a", "b", "c"]],
    ["projectSection", "s1", "bottom", ["a", "b", "c", "x", "y"]],
    ["project", "p1", "bottom", ["a", "b", "c", "x", "y"]],
  ] as const)(
    "keeps drops in order on %s %s %s",
    (modelType, id, edge, expected) => {
      const db = createDB();
      syncDispatch(db, appHandleDropMany({ id, modelType, drops: xy, edge }));
      expect(sectionOrder(db, "s1")).toEqual(expected);
    },
  );

  it.each([
    ["dailyList", "day", "top", ["x", "y", "c"]],
    ["dailyList", "day", "bottom", ["c", "x", "y"]],
    ["dailyEntry", "entry-c", "top", ["x", "y", "c"]],
    ["dailyEntry", "entry-c", "bottom", ["c", "x", "y"]],
  ] as const)(
    "keeps drops in order on %s %s %s",
    (modelType, id, edge, expected) => {
      const db = createDB();
      syncDispatch(db, appHandleDropMany({ id, modelType, drops: xy, edge }));
      expect(dayOrder(db)).toEqual(expected);
    },
  );

  it("skips drops onto themselves and keeps the rest", () => {
    const db = createDB();
    syncDispatch(
      db,
      appHandleDropMany({
        id: "b",
        modelType: "task",
        drops: [{ id: "b", modelType: "task" }, ...xy],
        edge: "bottom",
      }),
    );
    expect(sectionOrder(db, "s1")).toEqual(["a", "b", "x", "y", "c"]);
  });
});

describe("selection actions", () => {
  it("sets the state once per task when a task and its entry are both selected", () => {
    const db = createDB();
    syncDispatch(
      db,
      setListItemsTaskState({
        listItems: [
          { id: "c", modelType: "task" },
          { id: "entry-c", modelType: "dailyEntry" },
          { id: "a", modelType: "task" },
        ],
        state: "done",
      }),
    );
    for (const id of ["a", "c"]) {
      expect(selectSync(db, { selector: taskById, args: { id } })?.state).toBe(
        "done",
      );
    }
    expect(
      selectSync(db, { selector: taskById, args: { id: "b" } })?.state,
    ).toBe("todo");
  });

  it("moves entries' tasks to a project in order and keeps them scheduled", () => {
    const db = createDB();
    syncDispatch(
      db,
      moveListItemsToProject({
        listItems: [
          { id: "entry-c", modelType: "dailyEntry" },
          { id: "a", modelType: "task" },
        ],
        projectId: "p2",
      }),
    );
    expect(sectionOrder(db, "s2")).toEqual(["x", "y", "c", "a"]);
    expect(
      selectSync(db, { selector: dailyEntryByTaskId, args: { taskId: "c" } })
        ?.dailyListId,
    ).toBe("day");
  });
});

describe("pasteListItemCopies", () => {
  const aAndEntryC = [
    { id: "a", modelType: "task" as const },
    { id: "entry-c", modelType: "dailyEntry" as const },
  ];

  it("pastes copies in order after the target and keeps the originals", () => {
    const db = createDB();
    const copies = syncDispatch(
      db,
      pasteListItemCopies({
        listItems: aAndEntryC,
        id: "x",
        modelType: "task",
        edge: "bottom",
      }),
    );
    const [copyA, copyC] = copies.map((copy) => copy.id);

    expect(sectionOrder(db, "s2")).toEqual(["x", copyA, copyC, "y"]);
    expect(sectionOrder(db, "s1")).toEqual(["a", "b", "c"]);
    expect(dayOrder(db)).toEqual(["c"]);
    expect(
      selectSync(db, {
        selector: checklistItemChildren,
        args: { parentId: copyA!, parentType: "task" },
      }).map((item) => item.content),
    ).toEqual(["step"]);
  });

  it("schedules copies pasted into a daily list next to their originals", () => {
    const db = createDB();
    const [copyA] = syncDispatch(
      db,
      pasteListItemCopies({
        listItems: [aAndEntryC[0]!],
        id: "entry-c",
        modelType: "dailyEntry",
        edge: "bottom",
      }),
    ).map((copy) => copy.id);

    expect(dayOrder(db)).toEqual(["c", copyA]);
    expect(sectionOrder(db, "s1")).toEqual(["a", copyA, "b", "c"]);
  });

  it("leaves nothing behind when the target rejects the copies", () => {
    const db = createDB();
    const taskCount = selectSync(db, { selector: allTasks, args: {} }).length;
    const copies = syncDispatch(
      db,
      pasteListItemCopies({
        listItems: [aAndEntryC[0]!],
        id: "d",
        modelType: "task",
        edge: "bottom",
      }),
    );

    expect(copies).toEqual([]);
    expect(selectSync(db, { selector: allTasks, args: {} })).toHaveLength(
      taskCount,
    );
  });

  it("pastes copies of done tasks as todo", () => {
    const db = createDB();
    const [copyD] = syncDispatch(
      db,
      pasteListItemCopies({
        listItems: [{ id: "d", modelType: "task" }],
        id: "x",
        modelType: "task",
        edge: "bottom",
      }),
    );

    expect(copyD).toMatchObject({ type: "task", state: "todo" });
    expect(sectionOrder(db, "s2")).toEqual(["x", copyD!.id, "y"]);
  });
});
