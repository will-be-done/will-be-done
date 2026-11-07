import type { HyperDB } from "@will-be-done/hyperdb";
import { Effect } from "effect";
import {
  createMindmap as createMindmapAction,
  createMindmapNode as createMindmapNodeAction,
  deleteMindmap as deleteMindmapAction,
  deleteMindmapNodes,
  isMindmapNodeWithin,
  isMindmapRoot,
  type Note,
  type Mindmap,
  mindmapById,
  type MindmapNode,
  mindmapNodeById,
  mindmapNodes,
  mindmapParentsOf,
  mindmapRootNode,
  type MindmapNodeSide,
  type MindmapPlacement,
  mindmapsOrdered,
  mindmapTree,
  type MindmapTreeNode,
  moveMindmapNode as moveMindmapNodeAction,
  noteById,
  taskById,
  type Task,
  updateMindmap as updateMindmapAction,
  updateMindmapNode as updateMindmapNodeAction,
} from "@will-be-done/slices/space";
import { getSpaceDatabase } from "./databaseAccess";
import { ConflictError, ResourceNotFoundError } from "./errors";
import { dispatch, select } from "./hyperdb";
import { requireNote } from "./notes";
import { type Placement } from "./placement";
import { requireTask } from "./tasks";

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

// A node can link both a task and a note after concurrent conversions; it
// shows whichever exists, task first, as the tree does.
const toPublicNode = (
  { node, task, note }: { node: MindmapNode; task?: Task; note?: Note },
  parentId: string | null,
): PublicMindmapNode => {
  const kind =
    task || (!note && node.taskId)
      ? "task"
      : note || node.noteId
        ? "note"
        : "topic";
  return {
    type: "mindmapNode",
    id: node.id,
    mindmapId: node.mindmapId,
    parentId,
    kind,
    taskId: kind === "task" ? node.taskId : null,
    noteId: kind === "note" ? (node.noteId ?? null) : null,
    title: kind === "topic" ? node.title : ((task ?? note)?.title ?? ""),
    side: node.side,
    position:
      node.parentId === null && !isMindmapRoot(node)
        ? { x: node.x ?? 0, y: node.y ?? 0 }
        : null,
    collapsed: node.collapsed,
    createdAt: node.createdAt,
  };
};

const publicNode = Effect.fnUntraced(function* (
  db: HyperDB,
  node: MindmapNode,
) {
  const [task, note] = yield* Effect.all(
    [
      node.taskId
        ? select(db, { selector: taskById, args: { id: node.taskId } })
        : Effect.undefined,
      node.noteId
        ? select(db, { selector: noteById, args: { id: node.noteId } })
        : Effect.undefined,
    ],
    { concurrency: "unbounded" },
  );
  return toPublicNode({ node, task, note }, node.parentId);
});

const requireMindmap = Effect.fnUntraced(function* (
  db: HyperDB,
  mindmapId: string,
) {
  const mindmap = yield* select(db, {
    selector: mindmapById,
    args: { id: mindmapId },
  });
  if (!mindmap)
    return yield* new ResourceNotFoundError({ resource: "Mindmap" });
  return mindmap;
});

const requireNode = Effect.fnUntraced(function* (db: HyperDB, nodeId: string) {
  const node = yield* select(db, {
    selector: mindmapNodeById,
    args: { id: nodeId },
  });
  if (node) return node;
  // A center topic whose row has not synced yet.
  const mindmap = yield* select(db, {
    selector: mindmapById,
    args: { id: nodeId },
  });
  if (!mindmap) {
    return yield* new ResourceNotFoundError({ resource: "Mindmap node" });
  }
  return mindmapRootNode(mindmap);
});

const resolvePlacement = Effect.fnUntraced(function* ({
  db,
  mindmapId,
  parentId,
  placement,
  side,
  movingId,
}: {
  db: HyperDB;
  mindmapId: string;
  parentId: string;
  placement: Placement;
  side?: MindmapNodeSide;
  movingId?: string;
}): Effect.fn.Return<MindmapPlacement, ResourceNotFoundError | ConflictError> {
  if (parentId !== mindmapId) {
    const parent = yield* select(db, {
      selector: mindmapNodeById,
      args: { id: parentId },
    });
    if (!parent || parent.mindmapId !== mindmapId) {
      return yield* new ResourceNotFoundError({ resource: "Parent node" });
    }
  }
  if (placement.kind === "first" || placement.kind === "last") {
    return {
      parentId,
      position: placement.kind,
      ...(side === undefined ? {} : { side }),
    };
  }

  const anchor = yield* select(db, {
    selector: mindmapNodeById,
    args: { id: placement.anchorId },
  });
  if (
    !anchor ||
    anchor.mindmapId !== mindmapId ||
    anchor.parentId !== parentId ||
    anchor.id === movingId
  ) {
    return yield* new ConflictError({
      message: "Placement anchor must be a node under the destination parent",
    });
  }
  return { siblingId: anchor.id, edge: placement.kind };
});

export const listMindmaps = Effect.fn("listMindmaps")(function* ({
  spaceId,
  userId,
}: {
  spaceId: string;
  userId: string;
}) {
  const db = yield* getSpaceDatabase(spaceId, userId);
  const mindmaps = yield* select(db, { selector: mindmapsOrdered, args: {} });
  return mindmaps.map(toPublicMindmap);
});

export const getMindmap = Effect.fn("getMindmap")(function* ({
  spaceId,
  userId,
  mindmapId,
}: {
  spaceId: string;
  userId: string;
  mindmapId: string;
}) {
  const db = yield* getSpaceDatabase(spaceId, userId);
  const tree = yield* select(db, {
    selector: mindmapTree,
    args: { mindmapId },
  });
  if (!tree) return yield* new ResourceNotFoundError({ resource: "Mindmap" });

  // Depth-first from the center topic, so every parent precedes its children
  // and siblings keep their order. Nodes reflect the same conflict repair the
  // apps show.
  const nodes: PublicMindmapNode[] = [toPublicNode({ node: tree.root }, null)];
  const visit = (trees: MindmapTreeNode[], parentId: string) => {
    for (const tree of trees) {
      nodes.push(toPublicNode(tree, parentId));
      visit(tree.children, tree.node.id);
    }
  };
  visit(tree.branches, tree.root.id);
  for (const floating of tree.floating) {
    nodes.push(toPublicNode(floating, null));
    visit(floating.children, floating.node.id);
  }

  return { mindmap: toPublicMindmap(tree.mindmap), nodes };
});

export const createMindmap = Effect.fn("createMindmap")(function* ({
  spaceId,
  userId,
  title,
}: {
  spaceId: string;
  userId: string;
  title: string;
}) {
  const db = yield* getSpaceDatabase(spaceId, userId);
  return toPublicMindmap(yield* dispatch(db, createMindmapAction({ title })));
});

export const updateMindmap = Effect.fn("updateMindmap")(function* ({
  spaceId,
  userId,
  mindmapId,
  title,
}: {
  spaceId: string;
  userId: string;
  mindmapId: string;
  title: string;
}) {
  const db = yield* getSpaceDatabase(spaceId, userId);
  yield* requireMindmap(db, mindmapId);
  return toPublicMindmap(
    yield* dispatch(
      db,
      updateMindmapAction({ id: mindmapId, mindmap: { title } }),
    ),
  );
});

export const deleteMindmap = Effect.fn("deleteMindmap")(function* ({
  spaceId,
  userId,
  mindmapId,
}: {
  spaceId: string;
  userId: string;
  mindmapId: string;
}) {
  const db = yield* getSpaceDatabase(spaceId, userId);
  yield* requireMindmap(db, mindmapId);
  yield* dispatch(db, deleteMindmapAction({ id: mindmapId }));
});

export const createMindmapNode = Effect.fn("createMindmapNode")(function* ({
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
}) {
  const db = yield* getSpaceDatabase(spaceId, userId);
  yield* requireMindmap(db, mindmapId);
  if (taskId !== undefined) yield* requireTask(db, taskId);
  if (noteId !== undefined) yield* requireNote(db, noteId);

  const node = yield* dispatch(
    db,
    createMindmapNodeAction({
      mindmapId,
      placement:
        position ??
        (yield* resolvePlacement({
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
  return yield* publicNode(db, node);
});

export const updateMindmapNode = Effect.fn("updateMindmapNode")(function* ({
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
}) {
  const db = yield* getSpaceDatabase(spaceId, userId);
  const node = yield* requireNode(db, nodeId);
  if (title !== undefined && (node.taskId || node.noteId)) {
    return yield* new ConflictError({
      message:
        "A task or note node shows its item's title; update the item instead",
    });
  }

  const updated = yield* dispatch(
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
  return yield* publicNode(db, updated);
});

export const moveMindmapNode = Effect.fn("moveMindmapNode")(function* ({
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
}) {
  const db = yield* getSpaceDatabase(spaceId, userId);
  const node = yield* requireNode(db, nodeId);
  if (isMindmapRoot(node)) {
    return yield* new ConflictError({
      message: "The central topic cannot move",
    });
  }
  const nodes = yield* select(db, {
    selector: mindmapNodes,
    args: { mindmapId: node.mindmapId },
  });
  if (
    parentId !== undefined &&
    isMindmapNodeWithin(
      mindmapParentsOf(node.mindmapId, nodes),
      nodeId,
      parentId,
    )
  ) {
    return yield* new ConflictError({
      message: "A node cannot move into its own subtree",
    });
  }
  if (position && (node.taskId || node.noteId)) {
    return yield* new ConflictError({ message: "Only topics float" });
  }

  const moved = yield* dispatch(
    db,
    moveMindmapNodeAction({
      id: nodeId,
      placement:
        position ??
        (yield* resolvePlacement({
          db,
          mindmapId: node.mindmapId,
          parentId: parentId ?? node.mindmapId,
          placement,
          side,
          movingId: nodeId,
        })),
    }),
  );
  return yield* publicNode(db, moved);
});

export const deleteMindmapNode = Effect.fn("deleteMindmapNode")(function* ({
  spaceId,
  userId,
  nodeId,
}: {
  spaceId: string;
  userId: string;
  nodeId: string;
}) {
  const db = yield* getSpaceDatabase(spaceId, userId);
  const node = yield* requireNode(db, nodeId);
  if (isMindmapRoot(node)) {
    return yield* new ConflictError({
      message:
        "The central topic goes with its mindmap; delete the mindmap instead",
    });
  }
  yield* dispatch(db, deleteMindmapNodes({ ids: [nodeId] }));
});
