import {
  type Mindmap,
  type MindmapNodeSide,
  type MindmapPlacement,
  type MindmapTree,
  type MindmapTreeNode,
} from "@will-be-done/slices/space";
import { create } from "zustand";
import type { FocusKey } from "@/store/focusSlice.ts";
import type {
  LaidOutNode,
  LayoutTree,
  MindmapLayout,
} from "./mindmapLayout.ts";
import { mindmapNodeFocusKey, mindmapRootFocusKey } from "./focusKeys.ts";
import type { MindmapItem } from "./mindmapDnd.ts";

export type CanvasNode =
  | { kind: "root"; id: string; focusKey: FocusKey; mindmap: Mindmap }
  | {
      kind: "node";
      id: string;
      focusKey: FocusKey;
      tree: MindmapTreeNode;
      parentId: string;
    };

export type CanvasIndex = {
  rootId: string;
  nodes: Map<string, CanvasNode>;
  byFocusKey: Map<FocusKey, string>;
};

export function indexMindmapTree(tree: MindmapTree): CanvasIndex {
  const rootId = tree.mindmap.id;
  const rootKey = mindmapRootFocusKey(rootId);
  const nodes = new Map<string, CanvasNode>([
    [
      rootId,
      { kind: "root", id: rootId, focusKey: rootKey, mindmap: tree.mindmap },
    ],
  ]);
  const byFocusKey = new Map<FocusKey, string>([[rootKey, rootId]]);
  const visit = (trees: MindmapTreeNode[], parentId: string) => {
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
  return { rootId, nodes, byFocusKey };
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
    const parent = index.nodes.get(branch.parentId);
    if (parent?.kind !== "node") return branch.tree.node.side;
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
  if (entry?.kind !== "node") return null;
  const side = sideOf(index, entry);
  const isBranch = entry.parentId === index.rootId;
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
          parentId: index.rootId,
          position: "last",
          side: side === "left" ? "right" : "left",
        },
      }
    : { placement: { siblingId: entry.parentId, edge: "after" } };
}

export type NodeKind = "topic" | "task" | "note";
export const nodeKind = (tree: MindmapTreeNode): NodeKind =>
  tree.task ? "task" : tree.note ? "note" : "topic";

export type DropIntent =
  | { kind: "child" | "before" | "after"; nodeId: string }
  | { kind: "branch"; side: MindmapNodeSide };

export type DraggedItems =
  | { kind: "nodes"; ids: string[] }
  | { kind: "item"; item: MindmapItem };

export type DropPreview = {
  intent: DropIntent;
  dragged: DraggedItems;
  // Where a new main branch goes when dropped on the root.
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
  setNodeId: (nodeId: string | null) => void;
}>((set) => ({
  nodeId: null,
  setNodeId: (nodeId) => set({ nodeId }),
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
  setIds: (ids: ReadonlySet<string>) => void;
  clear: () => void;
}>((set, get) => ({
  ids: emptySelection,
  setIds: (ids) => {
    const current = get().ids;
    if (ids.size !== current.size || [...ids].some((id) => !current.has(id))) {
      set({ ids: ids.size ? ids : emptySelection });
    }
  },
  clear: () => {
    if (get().ids.size) set({ ids: emptySelection });
  },
}));

const ghostPrefix = "ghost:";
export const ghostId = (id: string) => `${ghostPrefix}${id}`;
export const isGhostId = (id: string) => id.startsWith(ghostPrefix);
export const ghostSourceId = (id: string) => id.slice(ghostPrefix.length);

export const ghostIdsOf = (dragged: DraggedItems) =>
  dragged.kind === "nodes"
    ? dragged.ids.map(ghostId)
    : [ghostId(dragged.item.id)];

/** Inserts placeholder leaves where a drop would land, for a live preview. */
export function withDropGhosts(
  branches: readonly LayoutTree[],
  rootId: string,
  { intent, dragged, side }: DropPreview,
): LayoutTree[] {
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
    rootId,
    excluded,
  }: {
    rootId: string;
    // Dragged nodes and their subtrees.
    excluded: ReadonlySet<string>;
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

  if (!nearest || nearestDistance > nodeReach) {
    return { kind: "branch", side: x < 0 ? "left" : "right" };
  }
  if (excluded.has(nearest.id)) return null;
  const nodeId = nearest.id;
  if (nodeId === rootId) return { kind: "child", nodeId };

  const offset = (y - nearest.y) / nearest.height;
  return {
    kind: offset < 0.25 ? "before" : offset > 0.75 ? "after" : "child",
    nodeId,
  };
}

export function placementOfIntent(
  intent: DropIntent,
  rootId: string,
  side: MindmapNodeSide,
): MindmapPlacement {
  if (intent.kind === "branch") {
    return { parentId: rootId, position: "last", side: intent.side };
  }
  if (intent.kind === "child") {
    return intent.nodeId === rootId
      ? { parentId: rootId, position: "last", side }
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
