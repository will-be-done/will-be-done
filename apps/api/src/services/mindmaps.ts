import { asyncDispatch, selectAsync } from "@will-be-done/hyperdb";
import {
  createMindmap as createMindmapAction,
  createMindmapNode as createMindmapNodeAction,
  deleteMindmap as deleteMindmapAction,
  deleteMindmapNodes,
  isMindmapNodeWithin,
  isMindmapRoot,
  type Mindmap,
  mindmapById,
  type MindmapNode,
  mindmapNodeById,
  mindmapNodes,
  mindmapRootNode,
  type MindmapNodeSide,
  type MindmapPlacement,
  mindmapsOrdered,
  mindmapTree,
  type MindmapTreeNode,
  moveMindmapNode as moveMindmapNodeAction,
  noteById,
  taskById,
  updateMindmap as updateMindmapAction,
  updateMindmapNode as updateMindmapNodeAction,
} from "@will-be-done/slices/space";
import { getSpaceDatabase } from "./databaseAccess";
import {
  ConflictError,
  InvalidPlacementError,
  ResourceNotFoundError,
} from "./errors";
import { type Placement } from "./placement";

type SpaceDatabase = Awaited<ReturnType<typeof getSpaceDatabase>>;

export interface PublicMindmap {
  type: "mindmap";
  id: string;
  title: string;
  createdAt: number;
}

export interface PublicMindmapNode {
  type: "mindmapNode";
  id: string;
  mindmapId: string;
  parentId: string | null;
  kind: "topic" | "task" | "note";
  taskId: string | null;
  noteId: string | null;
  title: string;
  side: MindmapNodeSide;
  position: Point | null;
  collapsed: boolean;
  createdAt: number;
}

type Point = { x: number; y: number };

const toPublicMindmap = (mindmap: Mindmap): PublicMindmap => ({
  type: "mindmap",
  id: mindmap.id,
  title: mindmap.title,
  createdAt: mindmap.createdAt,
});

const toPublicNode = (
  node: MindmapNode,
  parentId: string | null,
  itemTitle: string | undefined,
): PublicMindmapNode => ({
  type: "mindmapNode",
  id: node.id,
  mindmapId: node.mindmapId,
  parentId,
  kind: node.taskId ? "task" : node.noteId ? "note" : "topic",
  taskId: node.taskId,
  noteId: node.noteId ?? null,
  title: node.taskId || node.noteId ? (itemTitle ?? "") : node.title,
  side: node.side,
  position:
    node.parentId === null && !isMindmapRoot(node)
      ? { x: node.x ?? 0, y: node.y ?? 0 }
      : null,
  collapsed: node.collapsed,
  createdAt: node.createdAt,
});

async function publicNode(
  db: SpaceDatabase,
  node: MindmapNode,
): Promise<PublicMindmapNode> {
  const item = node.taskId
    ? await selectAsync(db, { selector: taskById, args: { id: node.taskId } })
    : node.noteId
      ? await selectAsync(db, { selector: noteById, args: { id: node.noteId } })
      : undefined;
  return toPublicNode(node, node.parentId, item?.title);
}

async function requireMindmap(db: SpaceDatabase, mindmapId: string) {
  const mindmap = await selectAsync(db, {
    selector: mindmapById,
    args: { id: mindmapId },
  });
  if (!mindmap) throw new ResourceNotFoundError("Mindmap");
  return mindmap;
}

async function requireNode(db: SpaceDatabase, nodeId: string) {
  const node = await selectAsync(db, {
    selector: mindmapNodeById,
    args: { id: nodeId },
  });
  if (node) return node;
  // A center topic whose row has not synced yet.
  const mindmap = await selectAsync(db, {
    selector: mindmapById,
    args: { id: nodeId },
  });
  if (!mindmap) throw new ResourceNotFoundError("Mindmap node");
  return mindmapRootNode(mindmap);
}

async function resolvePlacement({
  db,
  mindmapId,
  parentId,
  placement,
  side,
  movingId,
}: {
  db: SpaceDatabase;
  mindmapId: string;
  parentId: string;
  placement: Placement;
  side?: MindmapNodeSide;
  movingId?: string;
}): Promise<MindmapPlacement> {
  if (parentId !== mindmapId) {
    const parent = await selectAsync(db, {
      selector: mindmapNodeById,
      args: { id: parentId },
    });
    if (!parent || parent.mindmapId !== mindmapId) {
      throw new ResourceNotFoundError("Parent node");
    }
  }
  const parent = parentId;
  if (placement.kind === "first" || placement.kind === "last") {
    return {
      parentId: parent,
      position: placement.kind,
      ...(side === undefined ? {} : { side }),
    };
  }

  const anchor = await selectAsync(db, {
    selector: mindmapNodeById,
    args: { id: placement.anchorId },
  });
  if (
    !anchor ||
    anchor.mindmapId !== mindmapId ||
    anchor.parentId !== parent ||
    anchor.id === movingId
  ) {
    throw new InvalidPlacementError(
      "Placement anchor must be a node under the destination parent",
    );
  }
  return { siblingId: anchor.id, edge: placement.kind };
}

export async function listMindmaps({
  spaceId,
  userId,
}: {
  spaceId: string;
  userId: string;
}): Promise<PublicMindmap[]> {
  const db = await getSpaceDatabase(spaceId, userId);
  return (await selectAsync(db, { selector: mindmapsOrdered, args: {} })).map(
    toPublicMindmap,
  );
}

export async function getMindmap({
  spaceId,
  userId,
  mindmapId,
}: {
  spaceId: string;
  userId: string;
  mindmapId: string;
}): Promise<{ mindmap: PublicMindmap; nodes: PublicMindmapNode[] }> {
  const db = await getSpaceDatabase(spaceId, userId);
  const tree = await selectAsync(db, {
    selector: mindmapTree,
    args: { mindmapId },
  });
  if (!tree) throw new ResourceNotFoundError("Mindmap");

  // Depth-first from the center topic, so every parent precedes its children
  // and siblings keep their order. Nodes reflect the same conflict repair the
  // apps show.
  const nodes: PublicMindmapNode[] = [toPublicNode(tree.root, null, undefined)];
  const visit = (trees: MindmapTreeNode[], parentId: string) => {
    for (const tree of trees) {
      nodes.push(
        toPublicNode(tree.node, parentId, (tree.task ?? tree.note)?.title),
      );
      visit(tree.children, tree.node.id);
    }
  };
  visit(tree.branches, tree.root.id);
  for (const floating of tree.floating) {
    nodes.push(toPublicNode(floating.node, null, undefined));
    visit(floating.children, floating.node.id);
  }

  return { mindmap: toPublicMindmap(tree.mindmap), nodes };
}

export async function createMindmap({
  spaceId,
  userId,
  title,
}: {
  spaceId: string;
  userId: string;
  title: string;
}): Promise<PublicMindmap> {
  const db = await getSpaceDatabase(spaceId, userId);
  return toPublicMindmap(
    await asyncDispatch(db, createMindmapAction({ title })),
  );
}

export async function updateMindmap({
  spaceId,
  userId,
  mindmapId,
  title,
}: {
  spaceId: string;
  userId: string;
  mindmapId: string;
  title: string;
}): Promise<PublicMindmap> {
  const db = await getSpaceDatabase(spaceId, userId);
  await requireMindmap(db, mindmapId);
  return toPublicMindmap(
    await asyncDispatch(
      db,
      updateMindmapAction({ id: mindmapId, mindmap: { title } }),
    ),
  );
}

export async function deleteMindmap({
  spaceId,
  userId,
  mindmapId,
}: {
  spaceId: string;
  userId: string;
  mindmapId: string;
}): Promise<void> {
  const db = await getSpaceDatabase(spaceId, userId);
  await requireMindmap(db, mindmapId);
  await asyncDispatch(db, deleteMindmapAction({ id: mindmapId }));
}

export async function createMindmapNode({
  spaceId,
  userId,
  mindmapId,
  parentId = mindmapId,
  placement = { kind: "last" },
  position,
  side,
  title,
  taskId,
  noteId,
}: {
  spaceId: string;
  userId: string;
  mindmapId: string;
  parentId?: string;
  placement?: Placement;
  position?: Point;
  side?: MindmapNodeSide;
  title?: string;
  taskId?: string;
  noteId?: string;
}): Promise<PublicMindmapNode> {
  const db = await getSpaceDatabase(spaceId, userId);
  await requireMindmap(db, mindmapId);
  if (taskId !== undefined) {
    const task = await selectAsync(db, {
      selector: taskById,
      args: { id: taskId },
    });
    if (!task) throw new ResourceNotFoundError("Task");
  }
  if (noteId !== undefined) {
    const note = await selectAsync(db, {
      selector: noteById,
      args: { id: noteId },
    });
    if (!note) throw new ResourceNotFoundError("Note");
  }

  const node = await asyncDispatch(
    db,
    createMindmapNodeAction({
      mindmapId,
      placement:
        position ??
        (await resolvePlacement({
          db,
          mindmapId,
          parentId,
          placement,
          side,
        })),
      ...(taskId !== undefined
        ? { taskId }
        : noteId !== undefined
          ? { noteId }
          : { title: title ?? "" }),
    }),
  );
  return publicNode(db, node);
}

export async function updateMindmapNode({
  spaceId,
  userId,
  nodeId,
  title,
  collapsed,
  side,
}: {
  spaceId: string;
  userId: string;
  nodeId: string;
  title?: string;
  collapsed?: boolean;
  side?: MindmapNodeSide;
}): Promise<PublicMindmapNode> {
  const db = await getSpaceDatabase(spaceId, userId);
  const node = await requireNode(db, nodeId);
  if (title !== undefined && (node.taskId || node.noteId)) {
    throw new ConflictError(
      "A task or note node shows its item's title; update the item instead",
    );
  }

  const updated = await asyncDispatch(
    db,
    updateMindmapNodeAction({
      id: nodeId,
      node: {
        ...(title === undefined ? {} : { title }),
        ...(collapsed === undefined ? {} : { collapsed }),
        ...(side === undefined ? {} : { side }),
      },
    }),
  );
  return publicNode(db, updated);
}

export async function moveMindmapNode({
  spaceId,
  userId,
  nodeId,
  parentId,
  placement = { kind: "last" },
  position,
  side,
}: {
  spaceId: string;
  userId: string;
  nodeId: string;
  parentId?: string;
  placement?: Placement;
  position?: Point;
  side?: MindmapNodeSide;
}): Promise<PublicMindmapNode> {
  const db = await getSpaceDatabase(spaceId, userId);
  const node = await requireNode(db, nodeId);
  if (isMindmapRoot(node)) {
    throw new ConflictError("The central topic cannot move");
  }
  const nodes = await selectAsync(db, {
    selector: mindmapNodes,
    args: { mindmapId: node.mindmapId },
  });
  if (parentId !== undefined && isMindmapNodeWithin(nodes, nodeId, parentId)) {
    throw new ConflictError("A node cannot move into its own subtree");
  }
  if (position && (node.taskId || node.noteId)) {
    throw new ConflictError("Only topics float");
  }

  const moved = await asyncDispatch(
    db,
    moveMindmapNodeAction({
      id: nodeId,
      placement:
        position ??
        (await resolvePlacement({
          db,
          mindmapId: node.mindmapId,
          parentId: parentId ?? node.mindmapId,
          placement,
          side,
          movingId: nodeId,
        })),
    }),
  );
  return publicNode(db, moved);
}

export async function deleteMindmapNode({
  spaceId,
  userId,
  nodeId,
}: {
  spaceId: string;
  userId: string;
  nodeId: string;
}): Promise<void> {
  const db = await getSpaceDatabase(spaceId, userId);
  const node = await requireNode(db, nodeId);
  if (isMindmapRoot(node)) {
    throw new ConflictError(
      "The central topic goes with its mindmap; delete the mindmap instead",
    );
  }
  await asyncDispatch(db, deleteMindmapNodes({ ids: [nodeId] }));
}
