import { describe, expect, test } from "vitest";
import {
  createAction,
  createSelector,
  DB,
  deleteRows,
  execSync,
  insert,
  selectFrom,
  selectSync,
  syncDispatch,
  v,
} from "@will-be-done/hyperdb";
import { BptreeInmemDriver } from "@will-be-done/hyperdb/drivers/inmemory";
import { dbIdTrait } from "../traits";
import { richTextMarkdownToPlainText } from "../common/richText";
import { registeredSpaceSyncableTables } from "./syncMap";
import { getSpaceBackup, loadSpaceBackup } from "./backup";
import {
  createProjectSection,
  deleteProjectSections,
  inboxProjectSectionId,
  projectSectionsByProjectId,
} from "./projectSections";
import { createInboxIfNotExists, createProject } from "./projects";
import { taskById, trashTasks } from "./tasks";
import {
  convertNoteToTask,
  convertTaskToNote,
  noteById,
  trashNotes,
} from "./notes";
import { restoreTrashedTasks } from "./trash";
import {
  buildMindmapTree,
  convertMindmapNodeToNote,
  convertMindmapNodeToTask,
  convertMindmapNodeToTopic,
  createMindmap,
  createMindmapNode,
  createMindmapNote,
  createMindmapTask,
  deleteMindmap,
  deleteMindmapNodes,
  mindmapsOfItem,
  mindmapsWithTitles,
  mindmapTree,
  moveMindmapNode,
  moveMindmapNodes,
  type MindmapOutline,
  mindmapOutlineTree,
  parseMindmapOutline,
  pasteMindmapNodes,
  pasteMindmapOutline,
  placeMindmapItems,
  type MindmapPlacement,
  type MindmapTreeNode,
  updateMindmap,
  updateMindmapNode,
} from "./mindmaps";
import {
  type MindmapNode,
  mindmapNodesTable,
  type Note,
  mindmapNodeType,
  notesTable,
  noteType,
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
  // A valid fractional key, so copies can be ordered after it.
  orderToken: `a${id}`,
  lastToggledAt: 0,
  nature: "unknown",
  createdAt: 0,
  templateId: null,
  templateDate: null,
});

const note = (id: string): Note => ({
  type: noteType,
  id,
  title: "Draft",
  projectSectionId: "section",
  orderToken: `a${id}`,
  createdAt: 0,
});

const node = (
  id: string,
  parentId: string | null,
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
    yield* insert(notesTable, [note("n1")]);
    yield* createMindmap({ id: "map", title: "Plan" });
  },
});

const deleteRootRow = action({
  name: "mindmapTestDeleteRootRow",
  args: {},
  handler: function* () {
    yield* deleteRows(mindmapNodesTable, ["map"]);
  },
});

// Rows as sync can leave them, e.g. a parent cycle from concurrent moves.
const insertNodes = action({
  name: "mindmapTestInsertNodes",
  args: { rows: v.array(v.pass<MindmapNode>()) },
  handler: function* ({ rows }) {
    yield* insert(mindmapNodesTable, rows);
  },
});

// Every node but the center topic, which lives as long as its map.
const nodeRows = selector({
  name: "mindmapTestNodeRows",
  args: {},
  handler: function* () {
    return (yield* selectFrom(mindmapNodesTable, "byIds")).filter(
      (row) => row.id !== row.mindmapId,
    );
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
      node("map", null),
      node("a", "map"),
      node("orphan", "deleted-node"),
      node("loose", null),
      // b -> c -> d -> b: broken at "b", the smallest ID.
      node("c", "b"),
      node("d", "c"),
      node("b", "d"),
      // A task node whose Task is gone gives its place to its children.
      node("gone", "a", { orderToken: "0", taskId: "missing" }),
      node("lifted", "gone"),
      node("kept", "a", { taskId: "t1" }),
      node("under-loose", "loose"),
    ];
    const tasks = new Map([["t1", task("t1")]]);

    const picture = (rows: MindmapNode[]) => {
      const { branches, floating } = buildMindmapTree("map", rows, { tasks });
      return `${shape(branches)} | ${shape(floating)}`;
    };
    const expected = "a(lifted kept) b(c(d)) orphan | loose(under-loose)";
    expect(picture(nodes)).toBe(expected);
    expect(picture([...nodes].reverse())).toBe(expected);
  });

  // Concurrent conversions can merge into a node linking both.
  test("a node linking a task and a note shows whichever exists, task first", () => {
    const both = node("both", "map", { taskId: "t1", noteId: "n1" });
    const [withTask] = buildMindmapTree("map", [both], {
      tasks: new Map([["t1", task("t1")]]),
      notes: new Map([["n1", note("n1")]]),
    }).branches;
    expect(withTask).toMatchObject({ task: { id: "t1" } });
    const [noteOnly] = buildMindmapTree("map", [both], {
      notes: new Map([["n1", note("n1")]]),
    }).branches;
    expect(noteOnly).toMatchObject({ task: undefined, note: { id: "n1" } });
  });
});

describe("mindmaps", () => {
  test("the center topic is a node; the map's name is plain text and falls back to it", () => {
    const db = createDB();
    const tree = () =>
      selectSync(db, { selector: mindmapTree, args: { mindmapId: "map" } })!;
    const listed = () =>
      selectSync(db, { selector: mindmapsWithTitles, args: {} });
    // The center topic starts as the name.
    expect(tree().root).toMatchObject({
      id: "map",
      parentId: null,
      title: "Plan",
    });
    const starred = syncDispatch(db, createMindmap({ title: "*Not* bold" }));
    const starredRoot = selectSync(db, {
      selector: mindmapTree,
      args: { mindmapId: starred.id },
    })!.root;
    expect(richTextMarkdownToPlainText(starredRoot.title, "title")).toBe(
      "*Not* bold",
    );
    syncDispatch(db, deleteMindmap({ id: starred.id }));

    syncDispatch(db, updateMindmap({ id: "map", mindmap: { title: "" } }));
    syncDispatch(
      db,
      updateMindmapNode({ id: "map", node: { title: "**Q3** launch" } }),
    );
    expect(tree().root.title).toBe("**Q3** launch");
    expect(listed()).toMatchObject([{ title: "Q3 launch" }]);

    syncDispatch(
      db,
      updateMindmap({ id: "map", mindmap: { title: "Plan *b*" } }),
    );
    expect(listed()).toMatchObject([{ title: "Plan *b*" }]);
    expect(tree().root.title).toBe("**Q3** launch");
  });

  test("the center topic cannot move, go away, convert or get siblings", () => {
    const db = createDB();
    syncDispatch(
      db,
      createMindmapNode({
        mindmapId: "map",
        id: "topic",
        placement: { parentId: "map", position: "last" },
      }),
    );
    expect(
      syncDispatch(
        db,
        moveMindmapNodes({
          ids: ["map"],
          placement: { parentId: "topic", position: "last" },
        }),
      ),
    ).toEqual([]);
    syncDispatch(db, deleteMindmapNodes({ ids: ["map"] }));
    expect(() =>
      syncDispatch(db, convertMindmapNodeToTask({ id: "map" })),
    ).toThrow();
    expect(() =>
      syncDispatch(
        db,
        createMindmapNode({
          mindmapId: "map",
          placement: { siblingId: "map", edge: "after" },
        }),
      ),
    ).toThrow();
    const tree = selectSync(db, {
      selector: mindmapTree,
      args: { mindmapId: "map" },
    })!;
    expect(tree.root).toMatchObject({ id: "map", parentId: null });
    expect(shape(tree.branches)).toBe("topic");
  });

  test("floating roots keep their point, grow both sides and can join the tree", () => {
    const db = createDB();
    const tree = () =>
      selectSync(db, { selector: mindmapTree, args: { mindmapId: "map" } })!;
    const create = (id: string, placement: MindmapPlacement) =>
      syncDispatch(db, createMindmapNode({ mindmapId: "map", id, placement }));
    create("float", { x: 300, y: -120 });
    create("one", { parentId: "float", position: "last" });
    create("two", { parentId: "float", position: "last" });
    create("topic", { parentId: "map", position: "last" });
    expect(tree().floating).toMatchObject([
      { node: { id: "float", parentId: null, x: 300, y: -120 } },
    ]);
    expect(tree().floating[0]!.children.map(({ node }) => node.side)).toEqual([
      "right",
      "left",
    ]);

    // Repositioning and floating a topic out of the tree.
    syncDispatch(
      db,
      moveMindmapNodes({
        ids: ["float", "topic"],
        placement: { x: 10, y: 20 },
      }),
    );
    expect(
      tree().floating.map(({ node: { id, x, y } }) => `${id}@${x},${y}`),
    ).toEqual(["topic@10,20", "float@10,76"]);
    expect(shape(tree().branches)).toBe("");

    // Joining the tree drops the point.
    syncDispatch(
      db,
      moveMindmapNode({
        id: "float",
        placement: { parentId: "map", position: "last" },
      }),
    );
    expect(tree().branches[0]!.node).not.toHaveProperty("x");
    expect(shape(tree().branches)).toBe("float(one two)");

    // Roots are topics.
    expect(() =>
      syncDispatch(db, convertMindmapNodeToTask({ id: "topic" })),
    ).toThrow();
    expect(() =>
      syncDispatch(
        db,
        createMindmapNode({
          mindmapId: "map",
          taskId: "t1",
          placement: { x: 0, y: 0 },
        }),
      ),
    ).toThrow();

    syncDispatch(db, deleteMindmapNodes({ ids: ["topic"] }));
    expect(tree().floating).toEqual([]);
  });

  // The map row can sync before its root row.
  test("a map without its root row shows an empty center topic that edits into a row", () => {
    const db = createDB();
    syncDispatch(db, deleteRootRow({}));
    expect(
      selectSync(db, { selector: mindmapTree, args: { mindmapId: "map" } })!
        .root,
    ).toMatchObject({ id: "map", parentId: null, title: "" });

    syncDispatch(
      db,
      updateMindmapNode({ id: "map", node: { title: "Center" } }),
    );
    expect(
      selectSync(db, { selector: mindmapTree, args: { mindmapId: "map" } })!
        .root,
    ).toMatchObject({ title: "Center" });
  });

  test("a task can sit on several nodes of one map", () => {
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
    expect(
      rows
        .filter((row) => row.taskId === "t1")
        .map((row) => row.parentId)
        .sort(),
    ).toEqual(["map", "topic"]);
    // The map is listed once for the task.
    expect(
      selectSync(db, { selector: mindmapsOfItem, args: { id: "t1" } }),
    ).toMatchObject([{ mindmap: { id: "map" } }]);
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

    // An orphan shows as a main branch and keeps its on-screen place.
    syncDispatch(
      db,
      insertNodes({ rows: [node("orphan", "gone", { orderToken: "0" })] }),
    );
    expect(treeShape(db)).toBe("orphan a(c b child)");
    syncDispatch(
      db,
      moveMindmapNodes({
        ids: ["a", "orphan"],
        placement: { parentId: "map", position: "last", side: "right" },
      }),
    );
    expect(treeShape(db)).toBe("orphan a(c b child)");
  });

  test("pasting copies, moves, or rebuilds nodes from another map", () => {
    const db = createDB();
    const tree = (mindmapId = "map") =>
      selectSync(db, { selector: mindmapTree, args: { mindmapId } })!;
    const create = (attrs: Parameters<typeof createMindmapNode>[0]) =>
      syncDispatch(db, createMindmapNode(attrs));
    create({
      mindmapId: "map",
      id: "a",
      title: "A",
      placement: { parentId: "map", position: "last" },
    });
    create({
      mindmapId: "map",
      id: "t1-node",
      taskId: "t1",
      placement: { parentId: "a", position: "last" },
    });
    create({
      mindmapId: "map",
      id: "b",
      title: "B",
      placement: { parentId: "map", position: "last" },
    });
    const under = (parentId: string) =>
      ({ parentId, position: "last" }) as const;

    // A copy duplicates the topic, linked to the same task; the originals stay.
    const [copied] = syncDispatch(
      db,
      pasteMindmapNodes({
        mindmapId: "map",
        ids: ["a", "t1-node"],
        placement: under("b"),
        mode: "copy",
      }),
    );
    const b = tree().branches.find(({ node }) => node.id === "b")!;
    expect(b.children).toMatchObject([
      {
        node: { id: copied!.id, title: "A" },
        children: [{ task: { id: "t1" } }],
      },
    ]);
    expect(b.children[0]!.children[0]!.node.id).not.toBe("t1-node");
    expect(shape(tree().branches)).toMatch(/^a\(t1-node\)/);

    // Pasting into the copied node again takes only what was copied.
    const pasteIntoA = () =>
      syncDispatch(
        db,
        pasteMindmapNodes({
          mindmapId: "map",
          ids: ["a", "t1-node"],
          placement: under("a"),
          mode: "copy",
        }),
      );
    pasteIntoA();
    pasteIntoA();
    const a = tree().branches.find(({ node }) => node.id === "a")!;
    expect(
      a.children.map(({ node, children }) => [node.title, children.length]),
    ).toEqual([
      ["", 0],
      ["A", 1],
      ["A", 1],
    ]);
    syncDispatch(
      db,
      deleteMindmapNodes({
        ids: a.children.slice(1).map(({ node }) => node.id),
      }),
    );

    // A cut within the map moves the nodes themselves.
    syncDispatch(
      db,
      pasteMindmapNodes({
        mindmapId: "map",
        ids: ["a"],
        placement: under("b"),
        mode: "cut",
      }),
    );
    expect(tree().branches.map(({ node }) => node.id)).toEqual(["b"]);

    // A cut into another map rebuilds there with the same task.
    const other = syncDispatch(db, createMindmap({ title: "Other" }));
    syncDispatch(
      db,
      pasteMindmapNodes({
        mindmapId: other.id,
        ids: ["a"],
        placement: under(other.id),
        mode: "cut",
      }),
    );
    expect(tree(other.id).branches).toMatchObject([
      { node: { title: "A" }, children: [{ task: { id: "t1" } }] },
    ]);
    expect(
      selectSync(db, { selector: nodeRows, args: {} }).filter(
        (row) => row.id === "a" || row.id === "t1-node",
      ),
    ).toEqual([]);

    // A stored cycle copies as it shows, x(y).
    syncDispatch(db, insertNodes({ rows: [node("y", "x"), node("x", "y")] }));
    const [cycleCopy] = syncDispatch(
      db,
      pasteMindmapNodes({
        mindmapId: "map",
        ids: ["x", "y"],
        placement: under("b"),
        mode: "copy",
      }),
    );
    expect(
      tree()
        .branches.find(({ node }) => node.id === "b")!
        .children.filter(({ node }) => node.id === cycleCopy!.id)
        .map(({ node, children }) => [node.title, children.length]),
    ).toEqual([["x", 1]]);
  });

  test.each([
    [
      "a markdown list",
      "* node 1\n* node 2\n  * node 3\n  * node 4\n    * node 5",
      "node 1 node 2(node 3 node 4(node 5))",
    ],
    ["the outline a copy writes", "A\n  B\n    C\n  D\nE", "A(B(C) D) E"],
    [
      "mixed markers, tabs, checkboxes and blank lines",
      "- a\r\n\t+ [x] b\r\n\r\n\t\t1. c\r\n- [ ] d\r\n-\r\n   ",
      "a(b(c)) d",
    ],
    ["a dedent between levels", "a\n    b\n  c", "a(b c)"],
    ["a first line deeper than the rest", "  a\nb", "a b"],
    ["bullet characters", "• a\n\t◦ b\n\t\t▪ c", "a(b(c))"],
    ["inline markdown", "- **bold** and `code`", "**bold** and `code`"],
  ])("pasted text reads as an outline: %s", (_, text, expected) => {
    const show = (items: MindmapOutline[]): string =>
      items
        .map(({ title, children }) =>
          children.length ? `${title}(${show(children)})` : title,
        )
        .join(" ");
    expect(show(mindmapOutlineTree(parseMindmapOutline(text)))).toBe(expected);
  });

  test("a pasted outline becomes topics under the target", () => {
    const db = createDB();
    syncDispatch(
      db,
      createMindmapNode({
        mindmapId: "map",
        id: "a",
        title: "A",
        placement: { parentId: "map", position: "last" },
      }),
    );
    syncDispatch(
      db,
      createMindmapNode({
        mindmapId: "map",
        id: "left",
        title: "Left",
        placement: { parentId: "map", position: "last", side: "left" },
      }),
    );
    const pasted = syncDispatch(
      db,
      pasteMindmapOutline({
        mindmapId: "map",
        lines: parseMindmapOutline("* one\n* two\n  * three\n  * four"),
        placement: { parentId: "left", position: "last" },
      }),
    );
    expect(pasted.map((node) => node.title)).toEqual(["one", "two"]);
    const left = selectSync(db, {
      selector: mindmapTree,
      args: { mindmapId: "map" },
    })!.branches.find(({ node }) => node.id === "left")!;
    const titles = (trees: MindmapTreeNode[]): unknown[] =>
      trees.map(({ node, children }) =>
        children.length ? [node.title, titles(children)] : node.title,
      );
    expect(titles(left.children)).toEqual(["one", ["two", ["three", "four"]]]);
    // Topics take their branch's side, as typed ones do.
    expect(
      new Set(
        selectSync(db, { selector: nodeRows, args: {} })
          .filter((row) => row.id !== "a")
          .map((row) => row.side),
      ),
    ).toEqual(new Set(["left"]));
  });

  test("placed items keep their order, each on a new node", () => {
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
        taskId: "t2",
        placement: { parentId: "map", position: "last" },
      }),
    );
    syncDispatch(
      db,
      placeMindmapItems({
        mindmapId: "map",
        items: [
          { type: "task", id: "t1" },
          { type: "note", id: "n1" },
          { type: "task", id: "t2" },
        ],
        placement: { parentId: "topic", position: "last" },
      }),
    );
    const topic = selectSync(db, {
      selector: mindmapTree,
      args: { mindmapId: "map" },
    })!.branches[0]!;
    expect(
      topic.children.map((child) => (child.task ?? child.note)!.id),
    ).toEqual(["t1", "n1", "t2"]);
    // The earlier t2 node stays where it was.
    expect(
      selectSync(db, { selector: mindmapTree, args: { mindmapId: "map" } })!
        .branches[1]!.task,
    ).toMatchObject({ id: "t2" });
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

    // A stored cycle shows as b(c); removing c keeps b.
    syncDispatch(db, insertNodes({ rows: [node("c", "b"), node("b", "c")] }));
    expect(treeShape(db)).toBe("b(c)");
    syncDispatch(db, deleteMindmapNodes({ ids: ["c"] }));
    expect(treeShape(db)).toBe("b");
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

  test("new tasks, notes and converted topics go to the chosen project or the inbox", () => {
    const db = createDB();
    // The inbox's original section can be deleted; tasks go to whichever is first.
    const inbox = syncDispatch(db, createInboxIfNotExists({}));
    const { id: inboxSectionId } = syncDispatch(
      db,
      createProjectSection({
        sectionDraft: { projectId: inbox.id, title: "Later" },
        position: "append",
      }),
    );
    syncDispatch(
      db,
      deleteProjectSections({
        ids: [selectSync(db, { selector: inboxProjectSectionId, args: {} })],
      }),
    );
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

    syncDispatch(
      db,
      createMindmapNode({
        mindmapId: "map",
        id: "idea",
        title: "Idea",
        placement: { parentId: "map", position: "last" },
      }),
    );
    const note = syncDispatch(db, convertMindmapNodeToNote({ id: "idea" }));
    expect(note).toMatchObject({
      title: "Idea",
      projectSectionId: inboxSectionId,
    });
    const noteNode = syncDispatch(
      db,
      createMindmapNote({
        mindmapId: "map",
        placement: { parentId: "idea", position: "last" },
      }),
    );
    expect(
      selectSync(db, { selector: noteById, args: { id: noteNode.noteId! } }),
    ).toMatchObject({ title: "", projectSectionId: inboxSectionId });
    expect(
      selectSync(db, { selector: mindmapTree, args: { mindmapId: "map" } })!
        .branches[1],
    ).toMatchObject({
      node: { id: "idea", noteId: note.id, title: "" },
      note: { id: note.id },
      children: [{ note: { id: noteNode.noteId } }],
    });

    // The project picked under the map; an unknown one falls back to the inbox.
    const work = syncDispatch(
      db,
      createProject({ project: { title: "Work" }, position: "append" }),
    );
    const [workSection] = selectSync(db, {
      selector: projectSectionsByProjectId,
      args: { projectId: work.id },
    });
    const sectionOf = (node: MindmapNode) =>
      (node.taskId
        ? selectSync(db, { selector: taskById, args: { id: node.taskId } })
        : selectSync(db, { selector: noteById, args: { id: node.noteId! } })
      )?.projectSectionId;
    const placement = { parentId: "map", position: "last" } as const;
    expect(
      sectionOf(
        syncDispatch(
          db,
          createMindmapTask({
            mindmapId: "map",
            placement,
            projectId: work.id,
          }),
        ),
      ),
    ).toBe(workSection!.id);
    expect(
      sectionOf(
        syncDispatch(
          db,
          createMindmapNote({
            mindmapId: "map",
            placement,
            projectId: work.id,
          }),
        ),
      ),
    ).toBe(workSection!.id);
    syncDispatch(
      db,
      createMindmapNode({
        mindmapId: "map",
        id: "plan",
        title: "Plan",
        placement,
      }),
    );
    expect(
      syncDispatch(
        db,
        convertMindmapNodeToTask({ id: "plan", projectId: work.id }),
      ).projectSectionId,
    ).toBe(workSection!.id);
    expect(
      sectionOf(
        syncDispatch(
          db,
          createMindmapTask({ mindmapId: "map", placement, projectId: "gone" }),
        ),
      ),
    ).toBe(inboxSectionId);
  });

  test("a note node survives trash and task conversion, and unlinks to a topic", () => {
    const db = createDB();
    const draft = { id: "n1" };
    syncDispatch(
      db,
      createMindmapNode({
        mindmapId: "map",
        id: "note-node",
        noteId: draft.id,
        placement: { parentId: "map", position: "last" },
      }),
    );
    syncDispatch(
      db,
      createMindmapNode({
        mindmapId: "map",
        id: "x",
        placement: { parentId: "note-node", position: "last" },
      }),
    );
    const branch = () =>
      selectSync(db, { selector: mindmapTree, args: { mindmapId: "map" } })!
        .branches[0];

    syncDispatch(db, trashNotes({ ids: [draft.id] }));
    expect(treeShape(db)).toBe("x");
    syncDispatch(db, restoreTrashedTasks({ ids: [draft.id] }));
    expect(treeShape(db)).toBe("note-node x");

    // Conversion replaces the item with a new ID; the node follows it.
    const task = syncDispatch(db, convertNoteToTask({ noteId: draft.id }));
    expect(treeShape(db)).toBe("note-node x");
    expect(branch()).toMatchObject({
      node: { taskId: task.id },
      task: { id: task.id },
      project: { id: "project" },
    });
    expect(branch()!.node).not.toHaveProperty("noteId");
    const back = syncDispatch(db, convertTaskToNote({ taskId: task.id }));
    expect(branch()).toMatchObject({
      node: { taskId: null, noteId: back.id },
      note: { id: back.id },
    });
    expect(
      selectSync(db, { selector: mindmapsOfItem, args: { id: back.id } }),
    ).toMatchObject([{ mindmap: { id: "map" } }]);

    syncDispatch(db, convertMindmapNodeToTopic({ id: "note-node" }));
    expect(branch()).toMatchObject({
      node: { taskId: null, title: "Draft" },
      note: undefined,
    });
    expect(branch()!.node).not.toHaveProperty("noteId");
    expect(
      selectSync(db, { selector: noteById, args: { id: back.id } }),
    ).toBeDefined();
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
    ).toMatchObject({
      task: { id: "t1" },
      project: { id: "project" },
      section: { id: "section" },
    });
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
    syncDispatch(
      source,
      createMindmapNode({
        mindmapId: "map",
        id: "note-node",
        noteId: "n1",
        placement: { parentId: "topic", position: "last" },
      }),
    );
    // Concurrent conversions: the Task is gone, the Note shows.
    syncDispatch(
      source,
      insertNodes({
        rows: [node("both", "topic", { taskId: "gone", noteId: "n1" })],
      }),
    );
    const backup = selectSync(source, { selector: getSpaceBackup, args: {} });

    const target = createDB("b0000000-0000-4000-8000-000000000002");
    syncDispatch(target, loadSpaceBackup({ backup }));
    expect(treeShape(target)).toBe("topic(task-node note-node both)");

    syncDispatch(target, deleteMindmap({ id: "map" }));
    expect(selectSync(target, { selector: nodeRows, args: {} })).toEqual([]);
    expect(
      selectSync(target, { selector: mindmapsOfItem, args: { id: "t2" } }),
    ).toEqual([]);
  });
});
