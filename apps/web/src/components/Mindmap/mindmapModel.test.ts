import { describe, expect, test } from "vitest";
import { type LayoutTree, layoutMindmap } from "./mindmapLayout";
import type {
  MindmapNodeSide,
  MindmapTreeNode,
} from "@will-be-done/slices/space";
import {
  type DropPreview,
  dropIntentAt,
  indexMindmapTree,
  treeMoveOf,
  withDropGhosts,
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
const options = { rootId: "root", excluded: new Set<string>() };

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
  const index = indexMindmapTree({
    mindmap: {
      type: "mindmap",
      id: "root",
      title: "",
      orderToken: "a",
      createdAt: 0,
    },
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
});
