import { describe, expect, test } from "vitest";
import { type LayoutTree, layoutMindmap } from "./mindmapLayout";

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

const overlaps = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

describe("layoutMindmap", () => {
  test("places branches on their side without overlapping", () => {
    const { nodes } = layoutMindmap(
      "root",
      [
        tree("a", [tree("a1", [tree("a1x"), tree("a1y")]), tree("a2")]),
        tree("b", [tree("b1")]),
        tree("l", [tree("l1"), tree("l2")], { side: "left" }),
      ],
      sizeOf,
    );

    const all = [...nodes.values()];
    for (const [index, node] of all.entries()) {
      for (const other of all.slice(index + 1)) {
        expect(overlaps(node, other), `${node.id} / ${other.id}`).toBe(false);
      }
    }
    expect(nodes.get("a1x")!.x).toBeGreaterThan(nodes.get("a1")!.x);
    expect(nodes.get("l1")!.x).toBeLessThan(nodes.get("l")!.x);
    expect(nodes.get("l")!.x + 80).toBeLessThan(nodes.get("root")!.x);
  });

  test("a collapsed node hides and counts its descendants", () => {
    const { nodes, edges } = layoutMindmap(
      "root",
      [tree("a", [tree("a1", [tree("a1x")])], { collapsed: true })],
      sizeOf,
    );

    expect([...nodes.keys()]).toEqual(["root", "a"]);
    expect(nodes.get("a")!.hiddenCount).toBe(2);
    expect(edges.map(({ id }) => id)).toEqual(["a"]);
  });
});
