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
} from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import { dbIdTrait } from "../traits";
import { registeredSpaceSyncableTables } from "./syncMap";
import { getSpaceBackup, loadSpaceBackup } from "./backup";
import { inboxProjectSectionId } from "./projectSections";
import { taskById, trashTasks } from "./tasks";
import { restoreTrashedTasks } from "./trash";
import {
  buildMindmapTree,
  convertMindmapNodeToTask,
  createMindmap,
  createMindmapNode,
  createMindmapTask,
  deleteMindmap,
  deleteMindmapNodes,
  mindmapsOfTask,
  mindmapTree,
  moveMindmapNode,
  moveMindmapNodes,
  type MindmapTreeNode,
} from "./mindmaps";
import {
  type MindmapNode,
  mindmapNodesTable,
  mindmapNodeType,
  projectSectionsTable,
  projectSectionType,
  projectsTable,
  projectType,
  type Task,
  tasksTable,
  taskType,
} from "./tables";

const action = createAction();
const selector = createSelector();

const task = (id: string): Task => ({
  type: taskType,
  id,
  title: `Task ${id}`,
  state: "todo",
  projectSectionId: "section",
  orderToken: id,
  lastToggledAt: 0,
  nature: "unknown",
  createdAt: 0,
  templateId: null,
  templateDate: null,
});

const node = (
  id: string,
  parentId: string,
  attrs: Partial<MindmapNode> = {},
): MindmapNode => ({
  type: mindmapNodeType,
  id,
  mindmapId: "map",
  parentId,
  orderToken: id,
  side: "right",
  taskId: null,
  title: id,
  collapsed: false,
  createdAt: 0,
  ...attrs,
});

// Renders a tree as "id(children)" so assertions read like the picture.
const shape = (nodes: MindmapTreeNode[]): string =>
  nodes
    .map(({ node, children }) =>
      children.length ? `${node.id}(${shape(children)})` : node.id,
    )
    .join(" ");

const seed = action({
  name: "seedMindmapTest",
  args: {},
  handler: function* () {
    yield* insert(projectsTable, [
      {
        type: projectType,
        id: "project",
        title: "Work",
        icon: "",
        isInbox: false,
        orderToken: "a",
        createdAt: 0,
      },
    ]);
    yield* insert(projectSectionsTable, [
      {
        type: projectSectionType,
        id: "section",
        title: "",
        orderToken: "a",
        projectId: "project",
        createdAt: 0,
      },
    ]);
    yield* insert(tasksTable, [task("t1"), task("t2")]);
    yield* createMindmap({ id: "map", title: "Plan" });
  },
});

const nodeRows = selector({
  name: "mindmapTestNodeRows",
  args: {},
  handler: function* () {
    return yield* selectFrom(mindmapNodesTable, "byIds");
  },
});

function createDB(spaceId = "a0000000-0000-4000-8000-000000000001") {
  const db = new DB(new BptreeInmemDriver(), {
    traits: [dbIdTrait("space", spaceId)],
  });
  execSync(db.loadTables(registeredSpaceSyncableTables));
  syncDispatch(db, seed({}));
  return db;
}

const treeShape = (db: DB) =>
  shape(
    selectSync(db, { selector: mindmapTree, args: { mindmapId: "map" } })!
      .branches,
  );

describe("buildMindmapTree", () => {
  test("repairs orphans, cycles and missing tasks the same way in any order", () => {
    const nodes = [
      node("a", "map"),
      node("orphan", "deleted-node"),
      // b -> c -> d -> b: broken at "b", the smallest ID.
      node("c", "b"),
      node("d", "c"),
      node("b", "d"),
      // A task node whose Task is gone gives its place to its children.
      node("gone", "a", { orderToken: "0", taskId: "missing" }),
      node("lifted", "gone"),
      node("kept", "a", { taskId: "t1" }),
    ];
    const tasks = new Map([["t1", task("t1")]]);

    const expected = "a(lifted kept) b(c(d)) orphan";
    expect(shape(buildMindmapTree("map", nodes, tasks))).toBe(expected);
    expect(shape(buildMindmapTree("map", [...nodes].reverse(), tasks))).toBe(
      expected,
    );
  });
});

describe("mindmaps", () => {
  test("a task appears once per map and dropping it again moves it", () => {
    const db = createDB();
    syncDispatch(
      db,
      createMindmapNode({
        mindmapId: "map",
        id: "topic",
        title: "Topic",
        placement: { parentId: "map", position: "last" },
      }),
    );
    syncDispatch(
      db,
      createMindmapNode({
        mindmapId: "map",
        taskId: "t1",
        placement: { parentId: "map", position: "last" },
      }),
    );
    syncDispatch(
      db,
      createMindmapNode({
        mindmapId: "map",
        taskId: "t1",
        placement: { parentId: "topic", position: "first" },
      }),
    );

    const rows = selectSync(db, { selector: nodeRows, args: {} });
    expect(rows.filter((row) => row.taskId === "t1")).toMatchObject([
      { parentId: "topic" },
    ]);
    expect(
      selectSync(db, { selector: mindmapsOfTask, args: { taskId: "t1" } }),
    ).toMatchObject([{ id: "map" }]);
  });

  test("new main branches alternate sides", () => {
    const db = createDB();
    for (const id of ["one", "two", "three"]) {
      syncDispatch(
        db,
        createMindmapNode({
          mindmapId: "map",
          id,
          placement: { parentId: "map", position: "last" },
        }),
      );
    }
    expect(
      selectSync(db, { selector: nodeRows, args: {} }).map(
        ({ id, side }) => `${id}:${side}`,
      ),
    ).toEqual(["one:right", "three:right", "two:left"]);
  });

  test("moves keep sibling order and refuse to enter their own subtree", () => {
    const db = createDB();
    for (const id of ["a", "b", "c"]) {
      syncDispatch(
        db,
        createMindmapNode({
          mindmapId: "map",
          id,
          placement: { parentId: "map", position: "last", side: "right" },
        }),
      );
    }
    syncDispatch(
      db,
      createMindmapNode({
        mindmapId: "map",
        id: "child",
        placement: { parentId: "a", position: "last" },
      }),
    );

    syncDispatch(
      db,
      moveMindmapNode({
        id: "c",
        placement: { siblingId: "a", edge: "before" },
      }),
    );
    expect(treeShape(db)).toBe("c a(child) b");

    expect(() =>
      syncDispatch(
        db,
        moveMindmapNode({
          id: "a",
          placement: { parentId: "child", position: "last" },
        }),
      ),
    ).toThrow("into itself");

    // A selection lands in map order; a node under a selected node rides
    // along with it.
    syncDispatch(
      db,
      moveMindmapNodes({
        ids: ["b", "child", "c", "a"],
        placement: { parentId: "map", position: "first", side: "right" },
      }),
    );
    expect(treeShape(db)).toBe("c a(child) b");
    syncDispatch(
      db,
      moveMindmapNodes({
        ids: ["b", "c"],
        placement: { parentId: "a", position: "first" },
      }),
    );
    expect(treeShape(db)).toBe("a(c b child)");
  });

  test("removing a node removes its subtree but keeps the tasks", () => {
    const db = createDB();
    syncDispatch(
      db,
      createMindmapNode({
        mindmapId: "map",
        id: "topic",
        placement: { parentId: "map", position: "last" },
      }),
    );
    syncDispatch(
      db,
      createMindmapNode({
        mindmapId: "map",
        taskId: "t1",
        placement: { parentId: "topic", position: "last" },
      }),
    );

    syncDispatch(db, deleteMindmapNodes({ ids: ["topic"] }));
    expect(selectSync(db, { selector: nodeRows, args: {} })).toEqual([]);
    expect(
      selectSync(db, {
        selector: createSelector()({
          name: "mindmapTestTasks",
          args: {},
          handler: function* () {
            return yield* selectFrom(tasksTable, "byIds");
          },
        }),
        args: {},
      }),
    ).toHaveLength(2);
  });

  test("new tasks and converted topics go to the inbox", () => {
    const db = createDB();
    syncDispatch(
      db,
      createMindmapNode({
        mindmapId: "map",
        id: "topic",
        title: "Call **Ann**",
        placement: { parentId: "map", position: "last" },
      }),
    );
    const created = syncDispatch(db, convertMindmapNodeToTask({ id: "topic" }));

    expect(created.title).toBe("Call **Ann**");
    const tree = selectSync(db, {
      selector: mindmapTree,
      args: { mindmapId: "map" },
    })!;
    expect(tree.branches[0]).toMatchObject({
      node: { id: "topic", taskId: created.id, title: "" },
      task: { id: created.id },
    });
    const inboxSectionId = selectSync(db, {
      selector: inboxProjectSectionId,
      args: {},
    });
    expect(created.projectSectionId).toBe(inboxSectionId);

    const node = syncDispatch(
      db,
      createMindmapTask({
        mindmapId: "map",
        placement: { parentId: "topic", position: "last" },
      }),
    );
    expect(node).toMatchObject({ parentId: "topic", title: "" });
    expect(
      selectSync(db, { selector: taskById, args: { id: node.taskId! } }),
    ).toMatchObject({ title: "", projectSectionId: inboxSectionId });
  });

  test("trashing a task lifts its children and restoring brings it back", () => {
    const db = createDB();
    syncDispatch(
      db,
      createMindmapNode({
        mindmapId: "map",
        id: "task-node",
        taskId: "t1",
        placement: { parentId: "map", position: "last" },
      }),
    );
    for (const id of ["x", "y"]) {
      syncDispatch(
        db,
        createMindmapNode({
          mindmapId: "map",
          id,
          placement: { parentId: "task-node", position: "last" },
        }),
      );
    }

    syncDispatch(db, trashTasks({ ids: ["t1"] }));
    expect(treeShape(db)).toBe("x y");

    syncDispatch(db, restoreTrashedTasks({ ids: ["t1"] }));
    expect(treeShape(db)).toBe("task-node x y");
    expect(
      selectSync(db, { selector: mindmapTree, args: { mindmapId: "map" } })!
        .branches[0],
    ).toMatchObject({ task: { id: "t1" }, project: { id: "project" } });
  });

  test("backups keep mindmaps, and deleting a map keeps its tasks", () => {
    const source = createDB();
    syncDispatch(
      source,
      createMindmapNode({
        mindmapId: "map",
        id: "topic",
        title: "Topic",
        placement: { parentId: "map", position: "last" },
      }),
    );
    syncDispatch(
      source,
      createMindmapNode({
        mindmapId: "map",
        id: "task-node",
        taskId: "t2",
        placement: { parentId: "topic", position: "last" },
      }),
    );
    const backup = selectSync(source, { selector: getSpaceBackup, args: {} });

    const target = createDB("b0000000-0000-4000-8000-000000000002");
    syncDispatch(target, loadSpaceBackup({ backup }));
    expect(treeShape(target)).toBe("topic(task-node)");

    syncDispatch(target, deleteMindmap({ id: "map" }));
    expect(selectSync(target, { selector: nodeRows, args: {} })).toEqual([]);
    expect(
      selectSync(target, { selector: mindmapsOfTask, args: { taskId: "t2" } }),
    ).toEqual([]);
  });
});
