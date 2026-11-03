import type { MindmapNodeSide } from "@will-be-done/slices/space";

export type LayoutTree = {
  node: { id: string; side: MindmapNodeSide; collapsed: boolean };
  children: LayoutTree[];
};

export type Size = { width: number; height: number };

export type LaidOutNode = Size & {
  id: string;
  // Top-left corner in map coordinates; the root is centered on (0, 0).
  x: number;
  y: number;
  side: MindmapNodeSide | null;
  depth: number;
  // Index of the main branch the node belongs to; colors its lines.
  branch: number;
  parentId: string | null;
  hiddenCount: number;
};

export type LaidOutEdge = {
  id: string;
  branch: number;
  depth: number;
  path: string;
};

export type MindmapLayout = {
  nodes: Map<string, LaidOutNode>;
  edges: LaidOutEdge[];
};

const rootGap = 64;
const levelGap = 40;
const siblingGap = 8;
const branchGap = 20;

const countAll = (trees: LayoutTree[]): number =>
  trees.reduce((sum, tree) => sum + 1 + countAll(tree.children), 0);

// MindNode-style layout: main branches fan out left and right of the root, and
// each subtree stacks its children vertically, centered on their parent.
export function layoutMindmap(
  rootId: string,
  branches: LayoutTree[],
  sizeOf: (id: string) => Size,
): MindmapLayout {
  const nodes = new Map<string, LaidOutNode>();
  const edges: LaidOutEdge[] = [];
  const heights = new Map<string, number>();

  const visibleChildren = (tree: LayoutTree) =>
    tree.node.collapsed ? [] : tree.children;

  const stackHeight = (trees: LayoutTree[], gap: number) =>
    trees.reduce(
      (sum, tree, index) => sum + subtreeHeight(tree) + (index ? gap : 0),
      0,
    );

  const subtreeHeight = (tree: LayoutTree): number => {
    const cached = heights.get(tree.node.id);
    if (cached !== undefined) return cached;
    const height = Math.max(
      sizeOf(tree.node.id).height,
      stackHeight(visibleChildren(tree), siblingGap),
    );
    heights.set(tree.node.id, height);
    return height;
  };

  const edgePath = (x1: number, y1: number, x2: number, y2: number) => {
    const mid = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
  };

  const place = (
    tree: LayoutTree,
    side: MindmapNodeSide,
    // The x of the node's edge facing its parent.
    innerX: number,
    centerY: number,
    depth: number,
    branch: number,
    parent: { id: string; x: number; y: number },
  ) => {
    const { id } = tree.node;
    const size = sizeOf(id);
    const direction = side === "right" ? 1 : -1;
    const x = side === "right" ? innerX : innerX - size.width;
    const y = centerY - size.height / 2;
    nodes.set(id, {
      id,
      ...size,
      x,
      y,
      side,
      depth,
      branch,
      parentId: parent.id,
      hiddenCount: tree.node.collapsed ? countAll(tree.children) : 0,
    });
    edges.push({
      id,
      branch,
      depth,
      path: edgePath(parent.x, parent.y, innerX, centerY),
    });

    const outerX = innerX + direction * size.width;
    const children = visibleChildren(tree);
    let top = centerY - stackHeight(children, siblingGap) / 2;
    for (const child of children) {
      const height = subtreeHeight(child);
      place(
        child,
        side,
        outerX + direction * levelGap,
        top + height / 2,
        depth + 1,
        branch,
        { id, x: outerX, y: centerY },
      );
      top += height + siblingGap;
    }
  };

  const root = sizeOf(rootId);
  nodes.set(rootId, {
    id: rootId,
    ...root,
    x: -root.width / 2,
    y: -root.height / 2,
    side: null,
    depth: 0,
    branch: -1,
    parentId: null,
    hiddenCount: 0,
  });

  for (const side of ["right", "left"] as const) {
    const sideBranches = branches.filter((tree) => tree.node.side === side);
    const direction = side === "right" ? 1 : -1;
    const rootEdgeX = (direction * root.width) / 2;
    let top = -stackHeight(sideBranches, branchGap) / 2;
    for (const tree of sideBranches) {
      const height = subtreeHeight(tree);
      place(
        tree,
        side,
        rootEdgeX + direction * rootGap,
        top + height / 2,
        1,
        branches.indexOf(tree),
        { id: rootId, x: rootEdgeX, y: 0 },
      );
      top += height + branchGap;
    }
  }

  return { nodes, edges };
}
