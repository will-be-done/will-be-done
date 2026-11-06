import {
  type MindmapNode,
  type MindmapNodeSide,
  type MindmapPlacement,
  type MindmapTree,
  type MindmapTreeNode,
} from "@will-be-done/slices/space";
import { create } from "zustand";
import type { FocusKey } from "@/store/focusSlice.ts";
import type {
  LaidOutNode,
  LayoutRoot,
  LayoutTree,
  MindmapLayout,
} from "./mindmapLayout.ts";
import { mindmapNodeFocusKey, mindmapRootFocusKey } from "./focusKeys.ts";
import type { MindmapItem } from "./mindmapDnd.ts";

export type CanvasNode =
  | { kind: "root"; id: string; focusKey: FocusKey; node: MindmapNode }
  | {
      kind: "node";
      id: string;
      focusKey: FocusKey;
      tree: MindmapTreeNode;
      // null on a floating root.
      parentId: string | null;
    };

export type CanvasIndex = {
  // The center topic.
  rootId: string;
  // The center topic and the floating roots.
  roots: ReadonlySet<string>;
  nodes: Map<string, CanvasNode>;
  byFocusKey: Map<FocusKey, string>;
};

export const noIds: ReadonlySet<string> = new Set();

export const isFloatingRoot = (entry: CanvasNode | undefined) =>
  entry?.kind === "node" && entry.parentId === null;

/** The center topic at the origin, then each floating root at its point. */
export const layoutRootsOf = (tree: MindmapTree): LayoutRoot[] => [
  { id: tree.mindmap.id, x: 0, y: 0, branches: tree.branches },
  ...tree.floating.map(({ node, children }) => ({
    id: node.id,
    x: node.x ?? 0,
    y: node.y ?? 0,
    branches: children,
  })),
];

export function indexMindmapTree(tree: MindmapTree): CanvasIndex {
  const rootId = tree.mindmap.id;
  const rootKey = mindmapRootFocusKey(rootId);
  const nodes = new Map<string, CanvasNode>([
    [rootId, { kind: "root", id: rootId, focusKey: rootKey, node: tree.root }],
  ]);
  const byFocusKey = new Map<FocusKey, string>([[rootKey, rootId]]);
  const visit = (trees: MindmapTreeNode[], parentId: string | null) => {
    for (const child of trees) {
      const focusKey = mindmapNodeFocusKey(child.node);
      nodes.set(child.node.id, {
        kind: "node",
        id: child.node.id,
        focusKey,
        tree: child,
        parentId,
      });
      byFocusKey.set(focusKey, child.node.id);
      visit(child.children, child.node.id);
    }
  };
  visit(tree.branches, rootId);
  visit(tree.floating, null);
  const roots = new Set([rootId, ...tree.floating.map(({ node }) => node.id)]);
  return { rootId, roots, nodes, byFocusKey };
}

export const subtreeIds = (tree: MindmapTreeNode, ids = new Set<string>()) => {
  ids.add(tree.node.id);
  for (const child of tree.children) subtreeIds(child, ids);
  return ids;
};

export type Direction = "left" | "right" | "up" | "down";

const sideOf = (index: CanvasIndex, entry: CanvasNode & { kind: "node" }) => {
  let branch = entry;
  for (;;) {
    const parent =
      branch.parentId === null ? undefined : index.nodes.get(branch.parentId);
    if (parent?.kind !== "node" || index.roots.has(parent.id)) {
      return branch.tree.node.side;
    }
    branch = parent;
  }
};

/**
 * Where Ctrl+arrow moves a node, by screen direction: up and down swap it with
 * its neighbor; away from the root nests it under the sibling above; toward
 * the root moves it out after its parent, or a main branch to the other side.
 */
export function treeMoveOf(
  index: CanvasIndex,
  id: string,
  direction: Direction,
): { placement: MindmapPlacement; newParentId?: string } | null {
  const entry = index.nodes.get(id);
  // Roots are placed, not moved in the tree.
  if (entry?.kind !== "node" || entry.parentId === null) return null;
  const { parentId } = entry;
  const side = sideOf(index, entry);
  const isBranch = index.roots.has(parentId);
  const siblings = [...index.nodes.values()].filter(
    (other): other is CanvasNode & { kind: "node" } =>
      other.kind === "node" &&
      other.parentId === entry.parentId &&
      (!isBranch || other.tree.node.side === side),
  );
  const at = siblings.findIndex((other) => other.id === id);
  const above = siblings[at - 1];
  const below = siblings[at + 1];

  if (direction === "up") {
    return above
      ? { placement: { siblingId: above.id, edge: "before" } }
      : null;
  }
  if (direction === "down") {
    return below ? { placement: { siblingId: below.id, edge: "after" } } : null;
  }
  if (direction === side) {
    return above
      ? {
          placement: { parentId: above.id, position: "last" },
          newParentId: above.id,
        }
      : null;
  }
  return isBranch
    ? {
        placement: {
          parentId,
          position: "last",
          side: side === "left" ? "right" : "left",
        },
      }
    : { placement: { siblingId: parentId, edge: "after" } };
}

export type NodeKind = "topic" | "task" | "note";
export const nodeKind = (tree: MindmapTreeNode): NodeKind =>
  tree.task ? "task" : tree.note ? "note" : "topic";

export type DropIntent =
  | { kind: "child" | "before" | "after"; nodeId: string }
  | { kind: "branch"; side: MindmapNodeSide }
  // A floating root dropped on empty space moves there.
  | { kind: "float" };

export type DraggedItems =
  | { kind: "nodes"; ids: string[] }
  | { kind: "item"; item: MindmapItem; selectionKeys?: FocusKey[] };

export type DropPreview = {
  intent: DropIntent;
  dragged: DraggedItems;
  // Where a new main branch goes when dropped on a root.
  side: MindmapNodeSide;
};

const samePreview = (a: DropPreview | null, b: DropPreview | null) =>
  JSON.stringify(a) === JSON.stringify(b);

export const useMindmapDrop = create<{
  preview: DropPreview | null;
  setPreview: (preview: DropPreview | null) => void;
}>((set, get) => ({
  preview: null,
  setPreview: (preview) => {
    if (!samePreview(get().preview, preview)) set({ preview });
  },
}));

// The task node whose date picker is open.
export const useMindmapDatePicker = create<{
  nodeId: string | null;
  // The picker schedules every task in the selection.
  forSelection: boolean;
  setNodeId: (nodeId: string | null, forSelection?: boolean) => void;
}>((set) => ({
  nodeId: null,
  forSelection: false,
  setNodeId: (nodeId, forSelection = false) => set({ nodeId, forSelection }),
}));

// The node whose "…" menu is open; the toolbar stays shown while it is.
export const useMindmapMenu = create<{
  nodeId: string | null;
  setNodeId: (nodeId: string | null) => void;
}>((set) => ({
  nodeId: null,
  setNodeId: (nodeId) => set({ nodeId }),
}));

const emptySelection: ReadonlySet<string> = new Set();

export const useMindmapSelection = create<{
  ids: ReadonlySet<string>;
  // Where Shift-click ranges start while there is a selection; without one,
  // they start at the focused node, as in lists.
  anchorId: string | null;
  setIds: (ids: ReadonlySet<string>, anchorId?: string | null) => void;
  clear: () => void;
}>((set, get) => ({
  ids: emptySelection,
  anchorId: null,
  setIds: (ids, anchorId = get().anchorId) => {
    const current = get().ids;
    if (
      ids.size !== current.size ||
      [...ids].some((id) => !current.has(id)) ||
      anchorId !== get().anchorId
    ) {
      set({ ids: ids.size ? ids : emptySelection, anchorId });
    }
  },
  clear: () => {
    if (get().ids.size) set({ ids: emptySelection });
  },
}));

/**
 * Nodes in reading order: each node, then its children, then its next
 * sibling; right branches, then left, then floating roots, each right then
 * left. Collapsed children
 * count only in the full order.
 */
function nodeOrder(tree: MindmapTree, visibleOnly: boolean): string[] {
  const order: string[] = [];
  const visit = (trees: readonly MindmapTreeNode[]) => {
    for (const child of trees) {
      order.push(child.node.id);
      if (!(visibleOnly && child.node.collapsed)) visit(child.children);
    }
  };
  const visitBranches = (branches: readonly MindmapTreeNode[]) => {
    visit(branches.filter(({ node }) => node.side === "right"));
    visit(branches.filter(({ node }) => node.side === "left"));
  };
  visitBranches(tree.branches);
  // Floating roots never collapse.
  for (const root of tree.floating) {
    order.push(root.node.id);
    visitBranches(root.children);
  }
  return order;
}

/** What a range selection spans. */
export const visibleNodeOrder = (tree: MindmapTree) => nodeOrder(tree, true);

/** The order a selection acts in; it can keep nodes a collapse hid. */
export const mapNodeOrder = (tree: MindmapTree) => nodeOrder(tree, false);

/** The nodes from `from` to `to` inclusive, in `order`. */
export function rangeOf(order: readonly string[], from: string, to: string) {
  const a = order.indexOf(from);
  const b = order.indexOf(to);
  if (a === -1 || b === -1) return b === -1 ? [] : [to];
  return order.slice(Math.min(a, b), Math.max(a, b) + 1);
}

const ghostPrefix = "ghost:";
export const ghostId = (id: string) => `${ghostPrefix}${id}`;
export const isGhostId = (id: string) => id.startsWith(ghostPrefix);
export const ghostSourceId = (id: string) => id.slice(ghostPrefix.length);

export const ghostIdsOf = (dragged: DraggedItems) =>
  dragged.kind === "nodes"
    ? dragged.ids.map(ghostId)
    : [ghostId(dragged.item.id)];

/** `withDropGhosts` over every root; empty-space branches go to the center. */
export function withDropGhostsOnRoots(
  roots: readonly LayoutRoot[],
  rootId: string,
  preview: DropPreview,
): LayoutRoot[] {
  const { intent } = preview;
  return roots.map((root) =>
    intent.kind === "float" || (intent.kind === "branch" && root.id !== rootId)
      ? root
      : { ...root, branches: withDropGhosts(root.branches, root.id, preview) },
  );
}

/** Inserts placeholder leaves where a drop would land, for a live preview. */
export function withDropGhosts(
  branches: readonly LayoutTree[],
  rootId: string,
  { intent, dragged, side }: DropPreview,
): LayoutTree[] {
  if (intent.kind === "float") return [...branches];
  const ghosts = (ghostSide: MindmapNodeSide): LayoutTree[] =>
    ghostIdsOf(dragged).map((id) => ({
      node: { id, side: ghostSide, collapsed: false },
      children: [],
    }));

  if (intent.kind === "branch" || intent.nodeId === rootId) {
    return [
      ...branches,
      ...ghosts(intent.kind === "branch" ? intent.side : side),
    ];
  }
  const visit = (trees: readonly LayoutTree[]): LayoutTree[] =>
    trees.flatMap((tree) => {
      if (tree.node.id !== intent.nodeId) {
        return [{ ...tree, children: visit(tree.children) }];
      }
      if (intent.kind === "child") {
        return [
          {
            node: { ...tree.node, collapsed: false },
            children: [...tree.children, ...ghosts(tree.node.side)],
          },
        ];
      }
      return intent.kind === "before"
        ? [...ghosts(tree.node.side), tree]
        : [tree, ...ghosts(tree.node.side)];
    });
  return visit(branches);
}

// Pointer reach, in map units, for dropping next to a node rather than
// starting a new branch.
const nodeReach = 48;

const distanceTo = (node: LaidOutNode, x: number, y: number) =>
  Math.hypot(
    Math.max(node.x - x, 0, x - node.x - node.width),
    Math.max(node.y - y, 0, y - node.y - node.height),
  );

/**
 * Picks the drop under a map point. Pass the layout without the drop
 * preview: reading the preview would let each preview move the target and
 * flip the next pick. On the base layout a node's middle nests, which leaves
 * the node in place, and its edges open a placeholder centered on the
 * pointer, so the pointer always rests on the target or its placeholder.
 */
export function dropIntentAt(
  layout: MindmapLayout,
  point: { x: number; y: number },
  {
    roots,
    excluded,
    float = false,
  }: {
    roots: ReadonlySet<string>;
    // Dragged nodes and their subtrees.
    excluded: ReadonlySet<string>;
    // Empty space moves the dragged floating root instead of adding a branch.
    float?: boolean;
  },
): DropIntent | null {
  const { x, y } = point;
  let nearest: LaidOutNode | undefined;
  let nearestDistance = Infinity;
  for (const node of layout.nodes.values()) {
    const distance = distanceTo(node, x, y);
    if (distance < nearestDistance) {
      nearest = node;
      nearestDistance = distance;
    }
  }

  // A dragged floating root is placed freely, so it joins a node only when
  // the pointer is on it.
  if (!nearest || nearestDistance > (float ? 0 : nodeReach)) {
    return float
      ? { kind: "float" }
      : { kind: "branch", side: x < 0 ? "left" : "right" };
  }
  if (excluded.has(nearest.id)) return float ? { kind: "float" } : null;
  const nodeId = nearest.id;
  if (roots.has(nodeId)) return { kind: "child", nodeId };

  const offset = (y - nearest.y) / nearest.height;
  return {
    kind: offset < 0.25 ? "before" : offset > 0.75 ? "after" : "child",
    nodeId,
  };
}

export function placementOfIntent(
  intent: Exclude<DropIntent, { kind: "float" }>,
  index: Pick<CanvasIndex, "rootId" | "roots">,
  side: MindmapNodeSide,
): MindmapPlacement {
  if (intent.kind === "branch") {
    return { parentId: index.rootId, position: "last", side: intent.side };
  }
  if (intent.kind === "child") {
    return index.roots.has(intent.nodeId)
      ? { parentId: intent.nodeId, position: "last", side }
      : { parentId: intent.nodeId, position: "last" };
  }
  return { siblingId: intent.nodeId, edge: intent.kind };
}

export const nodeShapeClass = (depth: number) =>
  depth === 0
    ? "rounded-2xl bg-panel px-5 py-3 text-lg font-semibold"
    : depth === 1
      ? "rounded-xl border-2 bg-panel-tinted px-3 py-1.5 text-[14px] font-medium"
      : "rounded-lg border bg-panel-tinted/70 px-2.5 py-1 text-[13px]";

// Main branch colors, picked to read on the dark surface.
export const branchColors = [
  "#60a5fa",
  "#f472b6",
  "#34d399",
  "#fbbf24",
  "#a78bfa",
  "#f87171",
  "#2dd4bf",
  "#fb923c",
];

export const branchColor = (branch: number) =>
  branch < 0 ? undefined : branchColors[branch % branchColors.length];
