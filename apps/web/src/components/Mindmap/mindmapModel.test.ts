import { describe, expect, test } from "vitest";
import {
  type LayoutTree,
  layoutMindmap,
  layoutMindmapRoots,
} from "./mindmapLayout";
import {
  type MindmapNodeSide,
  type MindmapTreeNode,
  mindmapRootNode,
} from "@will-be-done/slices/space";
import {
  type DropPreview,
  dropIntentAt,
  indexMindmapTree,
  rangeOf,
  treeMoveOf,
  visibleNodeOrder,
  withDropGhosts,
  withDropGhostsOnRoots,
} from "./mindmapModel";

const tree = (
  id: string,
  children: LayoutTree[] = [],
  attrs: Partial<LayoutTree["node"]> = {},
): LayoutTree => ({
  node: { id, side: "right", collapsed: false, ...attrs },
  children,
});

const sizeOf = (id: string) =>
  id === "root" ? { width: 120, height: 40 } : { width: 80, height: 20 };

const shape = (trees: LayoutTree[]): string =>
  trees
    .map(
      ({ node, children }) =>
        node.id + (children.length ? `(${shape(children)})` : ""),
    )
    .join(" ");

// Right of the root: "a" spans y -30..-10 and "b" spans 10..30, x 124..204.
const branches = [tree("a", [tree("a1")], { collapsed: true }), tree("b")];
const base = layoutMindmap("root", branches, sizeOf);
const options = { roots: new Set(["root"]), excluded: new Set<string>() };

describe("withDropGhosts", () => {
  const preview = (intent: DropPreview["intent"]): DropPreview => ({
    intent,
    dragged: { kind: "nodes", ids: ["x", "y"] },
    side: "left",
  });

  test("places placeholders where each drop lands", () => {
    expect(
      shape(
        withDropGhosts(
          branches,
          "root",
          preview({ kind: "before", nodeId: "b" }),
        ),
      ),
    ).toBe("a(a1) ghost:x ghost:y b");
    expect(
      shape(
        withDropGhosts(
          branches,
          "root",
          preview({ kind: "child", nodeId: "root" }),
        ),
      ),
    ).toBe("a(a1) b ghost:x ghost:y");

    const [a] = withDropGhosts(
      branches,
      "root",
      preview({ kind: "child", nodeId: "a" }),
    );
    expect(a!.node.collapsed).toBe(false);
    expect(shape([a!])).toBe("a(a1 ghost:x ghost:y)");
  });
});

describe("dropIntentAt", () => {
  test("nests in a node's middle and places siblings at its edges", () => {
    expect(dropIntentAt(base, { x: 160, y: -29 }, options)).toEqual({
      kind: "before",
      nodeId: "a",
    });
    expect(dropIntentAt(base, { x: 160, y: -11 }, options)).toEqual({
      kind: "after",
      nodeId: "a",
    });
    expect(dropIntentAt(base, { x: 160, y: -20 }, options)).toEqual({
      kind: "child",
      nodeId: "a",
    });
    expect(dropIntentAt(base, { x: 220, y: 20 }, options)).toEqual({
      kind: "child",
      nodeId: "b",
    });
    expect(dropIntentAt(base, { x: -20, y: 0 }, options)).toEqual({
      kind: "child",
      nodeId: "root",
    });
  });

  // The preview never feeds back into the pick, so a still pointer cannot
  // flicker; this checks the preview also lands where the pointer is.
  test("the pointer rests on the target or its placeholder", () => {
    const rects = (laidOut: ReturnType<typeof layoutMindmap>, id: string) =>
      [...laidOut.nodes.values()].filter((node) =>
        id === "ghost" ? node.id.startsWith("ghost:") : node.id === id,
      );
    for (const x of [130, 160, 200]) {
      for (let y = -38; y <= 38; y += 2) {
        const intent = dropIntentAt(base, { x, y }, options);
        if (!intent || intent.kind === "branch") continue;
        const preview = layoutMindmap(
          "root",
          withDropGhosts(branches, "root", {
            intent,
            dragged: { kind: "item", item: { type: "task", id: "t" } },
            side: "right",
          }),
          sizeOf,
        );
        const under = rects(
          preview,
          intent.kind === "child" ? intent.nodeId : "ghost",
        );
        const gap = Math.min(
          ...under.map((node) =>
            Math.max(node.y - y, 0, y - node.y - node.height),
          ),
        );
        // Half the gap between main branches.
        expect(gap, `${x},${y} ${JSON.stringify(intent)}`).toBeLessThanOrEqual(
          10,
        );
      }
    }
  });

  test("refuses the dragged subtree and starts branches in empty space", () => {
    expect(
      dropIntentAt(
        base,
        { x: 160, y: -20 },
        {
          ...options,
          excluded: new Set(["a", "a1"]),
        },
      ),
    ).toBeNull();
    expect(dropIntentAt(base, { x: -400, y: 0 }, options)).toEqual({
      kind: "branch",
      side: "left",
    });
    expect(dropIntentAt(base, { x: 160, y: 70 }, options)).toEqual({
      kind: "after",
      nodeId: "b",
    });
  });
});

describe("treeMoveOf", () => {
  const topic = (
    id: string,
    children: MindmapTreeNode[] = [],
    side: MindmapNodeSide = "right",
  ): MindmapTreeNode => ({
    node: {
      type: "mindmapNode",
      id,
      mindmapId: "root",
      parentId: "",
      orderToken: id,
      side,
      taskId: null,
      title: id,
      collapsed: false,
      createdAt: 0,
    },
    task: undefined,
    note: undefined,
    project: undefined,
    section: undefined,
    children,
  });
  // Right: a(a1 a2), b. Left: l.
  const mindmap = {
    type: "mindmap",
    id: "root",
    title: "",
    orderToken: "a",
    createdAt: 0,
  } as const;
  const index = indexMindmapTree({
    mindmap,
    root: mindmapRootNode(mindmap),
    // Floating: f(f1 on the left).
    floating: [
      {
        ...topic("f", [topic("f1", [], "left")]),
        node: { ...topic("f").node, parentId: null },
      },
    ],
    branches: [
      topic("a", [topic("a1"), topic("a2")]),
      topic("b"),
      topic("l", [], "left"),
    ],
  });
  const move = (id: string, direction: Parameters<typeof treeMoveOf>[2]) =>
    treeMoveOf(index, id, direction);

  test("up and down swap with neighbors on the same side", () => {
    expect(move("a2", "up")).toEqual({
      placement: { siblingId: "a1", edge: "before" },
    });
    expect(move("a1", "up")).toBeNull();
    expect(move("a", "down")).toEqual({
      placement: { siblingId: "b", edge: "after" },
    });
    expect(move("b", "down")).toBeNull();
  });

  test("away from the root nests, toward it moves out or across", () => {
    expect(move("a2", "right")).toEqual({
      placement: { parentId: "a1", position: "last" },
      newParentId: "a1",
    });
    expect(move("a1", "right")).toBeNull();
    expect(move("a1", "left")).toEqual({
      placement: { siblingId: "a", edge: "after" },
    });
    expect(move("b", "left")).toEqual({
      placement: { parentId: "root", position: "last", side: "left" },
    });
    expect(move("l", "left")).toBeNull();
    expect(move("l", "right")).toEqual({
      placement: { parentId: "root", position: "last", side: "right" },
    });
  });

  test("a floating root stays put and its branches cross over under it", () => {
    expect(move("f", "down")).toBeNull();
    expect(move("f1", "right")).toEqual({
      placement: { parentId: "f", position: "last", side: "right" },
    });
  });
});

describe("range selection", () => {
  const topic = (
    id: string,
    children: MindmapTreeNode[] = [],
    attrs: Partial<MindmapTreeNode["node"]> = {},
  ): MindmapTreeNode => ({
    node: {
      type: "mindmapNode",
      id,
      mindmapId: "root",
      parentId: "",
      orderToken: id,
      side: "right",
      taskId: null,
      title: id,
      collapsed: false,
      createdAt: 0,
      ...attrs,
    },
    task: undefined,
    note: undefined,
    project: undefined,
    section: undefined,
    children,
  });
  const mindmap = {
    type: "mindmap",
    id: "root",
    title: "",
    orderToken: "a",
    createdAt: 0,
  } as const;
  // parent(n1(n1a) n2 n3), hidden(h1) collapsed, left l, floating f(f1).
  const order = visibleNodeOrder({
    mindmap,
    root: mindmapRootNode(mindmap),
    branches: [
      topic("l", [], { side: "left" }),
      topic("parent", [topic("n1", [topic("n1a")]), topic("n2"), topic("n3")]),
      topic("hidden", [topic("h1")], { collapsed: true }),
    ],
    floating: [
      {
        ...topic("f", [topic("f1")]),
        node: { ...topic("f").node, parentId: null },
      },
    ],
  });

  test("follows reading order, skipping collapsed children", () => {
    expect(order).toEqual([
      "parent",
      "n1",
      "n1a",
      "n2",
      "n3",
      "hidden",
      "l",
      "f",
      "f1",
    ]);
  });

  test("selects everything between two siblings, either way round", () => {
    expect(rangeOf(order, "n3", "n1")).toEqual(["n1", "n1a", "n2", "n3"]);
    expect(rangeOf(order, "n1", "n3")).toEqual(["n1", "n1a", "n2", "n3"]);
    expect(rangeOf(order, "gone", "n2")).toEqual(["n2"]);
  });
});

describe("floating roots", () => {
  const floatingBase = layoutMindmapRoots(
    [
      { id: "root", x: 0, y: 0, branches },
      { id: "f", x: 600, y: 300, branches: [tree("f1")] },
    ],
    sizeOf,
  );
  const roots = new Set(["root", "f"]);

  test("lay out around their own point", () => {
    const f = floatingBase.nodes.get("f")!;
    expect([f.x + f.width / 2, f.y + f.height / 2]).toEqual([600, 300]);
    expect(floatingBase.nodes.get("f1")!.x).toBeGreaterThan(f.x + f.width);
    expect(floatingBase.nodes.get("a")).toEqual(base.nodes.get("a"));
  });

  test("take drops like the center topic, and move when dragged to empty space", () => {
    const excluded = new Set<string>();
    expect(
      dropIntentAt(floatingBase, { x: 600, y: 300 }, { roots, excluded }),
    ).toEqual({
      kind: "child",
      nodeId: "f",
    });
    expect(
      dropIntentAt(
        floatingBase,
        { x: 0, y: 600 },
        { roots, excluded, float: true },
      ),
    ).toEqual({ kind: "float" });
    // Close to a node is still free placement; on it, it joins.
    const b = base.nodes.get("b")!;
    const floatAt = (x: number) =>
      dropIntentAt(
        floatingBase,
        { x, y: b.y + b.height / 2 },
        { roots, excluded, float: true },
      );
    expect(floatAt(b.x + b.width + 20)).toEqual({ kind: "float" });
    expect(floatAt(b.x + b.width / 2)).toEqual({ kind: "child", nodeId: "b" });
    // Over its own subtree, the dragged root still just moves.
    expect(
      dropIntentAt(
        floatingBase,
        { x: 600, y: 300 },
        { roots, excluded: new Set(["f", "f1"]), float: true },
      ),
    ).toEqual({ kind: "float" });
  });

  test("a branch dropped on empty space goes to the center topic only", () => {
    const ghosted = withDropGhostsOnRoots(
      [
        { id: "root", x: 0, y: 0, branches: [] },
        { id: "f", x: 600, y: 300, branches: [] },
      ],
      "root",
      {
        intent: { kind: "branch", side: "left" },
        dragged: { kind: "nodes", ids: ["n"] },
        side: "left",
      },
    );
    expect(ghosted.map(({ branches }) => branches.length)).toEqual([1, 0]);
  });
});
