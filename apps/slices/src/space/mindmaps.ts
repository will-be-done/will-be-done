import {
  deleteRows,
  insert,
  selectFrom,
  upsert,
  v,
  type Infer,
} from "@will-be-done/hyperdb";
import {
  generateJitteredKeyBetween,
  generateNJitteredKeysBetween,
} from "fractional-indexing-jittered";
import { uuidv7 } from "uuidv7";
import { action, selector } from "../builders";
import { createTaskInSection, inboxProjectSectionId } from "./projectSections";
import { syncItemRichText } from "./richTextItems";
import { taskById, tasksByIds } from "./tasks";
import {
  type Mindmap,
  type MindmapNode,
  type MindmapNodeSide,
  mindmapNodeSide,
  mindmapNodesTable,
  mindmapNodeType,
  mindmapsTable,
  mindmapType,
  type Project,
  projectSectionsTable,
  projectsTable,
  type Task,
} from "./tables";

export type MindmapTreeNode = {
  node: MindmapNode;
  // Set for task nodes; a task node whose Task is gone is not in the tree.
  task: Task | undefined;
  project: Project | undefined;
  children: MindmapTreeNode[];
};

export type MindmapTree = {
  mindmap: Mindmap;
  branches: MindmapTreeNode[];
};

const compareNodes = (a: MindmapNode, b: MindmapNode) => {
  if (a.orderToken !== b.orderToken)
    return a.orderToken < b.orderToken ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
};

// Every replica repairs concurrent edits the same way, so they converge on one
// picture without writing fixes back:
// - a node whose parent is gone becomes a main branch;
// - a parent cycle is broken at its smallest node ID, which becomes a main branch;
// - a task node whose Task is gone is hidden and its children take its place.
export function buildMindmapTree(
  mindmapId: string,
  nodes: readonly MindmapNode[],
  tasksById: ReadonlyMap<string, Task>,
  projectsBySectionId: ReadonlyMap<string, Project> = new Map(),
): MindmapTreeNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const parentOf = new Map<string, string>();
  for (const node of nodes) {
    parentOf.set(
      node.id,
      node.mindmapId === mindmapId && byId.has(node.parentId)
        ? node.parentId
        : mindmapId,
    );
  }

  const done = new Set<string>();
  for (const node of nodes) {
    const path: string[] = [];
    const onPath = new Set<string>();
    let current = node.id;
    while (current !== mindmapId && !done.has(current)) {
      if (onPath.has(current)) {
        const cycle = path.slice(path.indexOf(current));
        const breaker = cycle.reduce((min, id) => (id < min ? id : min));
        parentOf.set(breaker, mindmapId);
        break;
      }
      onPath.add(current);
      path.push(current);
      current = parentOf.get(current)!;
    }
    for (const id of path) done.add(id);
  }

  const childrenOf = new Map<string, MindmapNode[]>();
  for (const node of nodes) {
    const parentId = parentOf.get(node.id)!;
    const siblings = childrenOf.get(parentId);
    if (siblings) siblings.push(node);
    else childrenOf.set(parentId, [node]);
  }

  const build = (parentId: string): MindmapTreeNode[] => {
    const result: MindmapTreeNode[] = [];
    for (const node of (childrenOf.get(parentId) ?? []).sort(compareNodes)) {
      const children = build(node.id);
      if (node.taskId === null) {
        result.push({ node, task: undefined, project: undefined, children });
        continue;
      }
      const task = tasksById.get(node.taskId);
      if (!task) {
        result.push(...children);
        continue;
      }
      result.push({
        node,
        task,
        project: projectsBySectionId.get(task.projectSectionId),
        children,
      });
    }
    return result;
  };

  return build(mindmapId);
}

/** Whether `nodeId` is `ancestorId` or lies under it, following stored parents. */
export function isMindmapNodeWithin(
  nodes: readonly Pick<MindmapNode, "id" | "parentId">[],
  ancestorId: string,
  nodeId: string,
) {
  const parentOf = new Map(nodes.map((node) => [node.id, node.parentId]));
  const seen = new Set<string>();
  let current: string | undefined = nodeId;
  while (current !== undefined && !seen.has(current)) {
    if (current === ancestorId) return true;
    seen.add(current);
    current = parentOf.get(current);
  }
  return false;
}

export const mindmapPlacement = v.union(
  v.object({
    parentId: v.string(),
    position: v.union(v.literal("first"), v.literal("last")),
    // Main branches only; defaults to the side with fewer branches.
    side: v.optional(mindmapNodeSide),
  }),
  v.object({
    siblingId: v.string(),
    edge: v.union(v.literal("before"), v.literal("after")),
  }),
);
export type MindmapPlacement = Infer<typeof mindmapPlacement>;

export const mindmapById = selector({
  name: "mindmapById",
  args: { id: v.string() },
  handler: function* mindmapById({ id }) {
    return (yield* selectFrom(mindmapsTable, "byId")
      .where((q) => q.eq("id", id))
      .first()) as Mindmap | undefined;
  },
});

// Mindmaps are a small, user-created collection.
export const mindmapsOrdered = selector({
  name: "mindmapsOrdered",
  args: {},
  handler: function* mindmapsOrdered() {
    return (yield* selectFrom(mindmapsTable, "byOrderToken")) as Mindmap[];
  },
});

export const mindmapNodeById = selector({
  name: "mindmapNodeById",
  args: { id: v.string() },
  handler: function* mindmapNodeById({ id }) {
    return (yield* selectFrom(mindmapNodesTable, "byId")
      .where((q) => q.eq("id", id))
      .first()) as MindmapNode | undefined;
  },
});

export const mindmapNodes = selector({
  name: "mindmapNodes",
  args: { mindmapId: v.string() },
  handler: function* mindmapNodes({ mindmapId }) {
    return (yield* selectFrom(mindmapNodesTable, "byMindmapParentOrder").where(
      (q) => q.eq("mindmapId", mindmapId),
    )) as MindmapNode[];
  },
});

const mindmapNodeChildren = selector({
  name: "mindmapNodeChildren",
  args: { mindmapId: v.string(), parentId: v.string() },
  handler: function* mindmapNodeChildren({ mindmapId, parentId }) {
    return (yield* selectFrom(mindmapNodesTable, "byMindmapParentOrder").where(
      (q) => q.eq("mindmapId", mindmapId).eq("parentId", parentId),
    )) as MindmapNode[];
  },
});

export const mindmapNodesByTaskIds = selector({
  name: "mindmapNodesByTaskIds",
  args: { taskIds: v.array(v.string()) },
  handler: function* mindmapNodesByTaskIds({ taskIds }) {
    if (taskIds.length === 0) return [];
    return (yield* selectFrom(mindmapNodesTable, "byTaskId").where((q) =>
      taskIds.map((taskId) => q.eq("taskId", taskId)),
    )) as MindmapNode[];
  },
});

export const mindmapsOfTask = selector({
  name: "mindmapsOfTask",
  args: { taskId: v.string() },
  handler: function* mindmapsOfTask({ taskId }) {
    const ids = [
      ...new Set(
        (yield* mindmapNodesByTaskIds({ taskIds: [taskId] })).map(
          (node) => node.mindmapId,
        ),
      ),
    ];
    if (ids.length === 0) return [];
    const mindmaps = (yield* selectFrom(mindmapsTable, "byId").where((q) =>
      ids.map((id) => q.eq("id", id)),
    )) as Mindmap[];
    return mindmaps.sort((a, b) => (a.orderToken < b.orderToken ? -1 : 1));
  },
});

export const mindmapTree = selector({
  name: "mindmapTree",
  args: { mindmapId: v.string() },
  handler: function* mindmapTree({
    mindmapId,
  }): Generator<unknown, MindmapTree | undefined, unknown> {
    const mindmap = yield* mindmapById({ id: mindmapId });
    if (!mindmap) return undefined;

    const nodes = yield* mindmapNodes({ mindmapId });
    const taskIds = [
      ...new Set(
        nodes.flatMap((node) => (node.taskId === null ? [] : [node.taskId])),
      ),
    ];
    const tasks = yield* tasksByIds({ ids: taskIds });
    const sectionIds = [...new Set(tasks.map((task) => task.projectSectionId))];
    const sections =
      sectionIds.length === 0
        ? []
        : yield* selectFrom(projectSectionsTable, "byId").where((q) =>
            sectionIds.map((id) => q.eq("id", id)),
          );
    const projectIds = [
      ...new Set(sections.map((section) => section.projectId)),
    ];
    const projects =
      projectIds.length === 0
        ? []
        : yield* selectFrom(projectsTable, "byId").where((q) =>
            projectIds.map((id) => q.eq("id", id)),
          );
    const projectsById = new Map(
      projects.map((project) => [project.id, project]),
    );
    const projectsBySectionId = new Map<string, Project>();
    for (const section of sections) {
      const project = projectsById.get(section.projectId);
      if (project) projectsBySectionId.set(section.id, project);
    }

    return {
      mindmap,
      branches: buildMindmapTree(
        mindmapId,
        nodes,
        new Map(tasks.map((task) => [task.id, task])),
        projectsBySectionId,
      ),
    };
  },
});

function* resolvePlacement(
  mindmapId: string,
  placement: MindmapPlacement,
  movingIds: ReadonlySet<string> = new Set(),
  count = 1,
): Generator<
  unknown,
  { parentId: string; orderTokens: string[]; side: MindmapNodeSide },
  unknown
> {
  const keysBetween = (lower?: MindmapNode, upper?: MindmapNode) =>
    generateNJitteredKeysBetween(
      lower?.orderToken ?? null,
      upper?.orderToken ?? null,
      count,
    );

  if ("siblingId" in placement) {
    const sibling = yield* mindmapNodeById({ id: placement.siblingId });
    if (!sibling || sibling.mindmapId !== mindmapId) {
      throw new Error("Mindmap node not found");
    }
    const siblings = (yield* mindmapNodeChildren({
      mindmapId,
      parentId: sibling.parentId,
    })).filter((node) => !movingIds.has(node.id));
    const index = siblings.findIndex((node) => node.id === sibling.id);
    const [lower, upper] =
      placement.edge === "before"
        ? [siblings[index - 1], sibling]
        : [sibling, siblings[index + 1]];
    return {
      parentId: sibling.parentId,
      side: sibling.side,
      orderTokens: keysBetween(lower, upper),
    };
  }

  const { parentId } = placement;
  const siblings = (yield* mindmapNodeChildren({ mindmapId, parentId })).filter(
    (node) => !movingIds.has(node.id),
  );
  let side: MindmapNodeSide;
  if (parentId === mindmapId) {
    if (placement.side) {
      side = placement.side;
    } else {
      const left = siblings.filter((node) => node.side === "left").length;
      side = siblings.length - left <= left ? "right" : "left";
    }
  } else {
    const parent = yield* mindmapNodeById({ id: parentId });
    if (!parent || parent.mindmapId !== mindmapId) {
      throw new Error("Mindmap node not found");
    }
    side = parent.side;
  }

  return {
    parentId,
    side,
    orderTokens:
      placement.position === "first"
        ? keysBetween(undefined, siblings[0])
        : keysBetween(siblings.at(-1), undefined),
  };
}

// Depth-first map order, so a moved selection keeps its on-screen order.
function treeOrder(mindmapId: string, nodes: readonly MindmapNode[]) {
  const children = new Map<string, MindmapNode[]>();
  for (const node of nodes) {
    children.set(node.parentId, [...(children.get(node.parentId) ?? []), node]);
  }
  const order = new Map<string, number>();
  const visit = (parentId: string) => {
    const sorted = (children.get(parentId) ?? []).sort((a, b) =>
      a.orderToken < b.orderToken ? -1 : a.orderToken > b.orderToken ? 1 : 0,
    );
    for (const node of sorted) {
      if (order.has(node.id)) continue;
      order.set(node.id, order.size);
      visit(node.id);
    }
  };
  visit(mindmapId);
  return order;
}

export const createMindmap = action({
  name: "createMindmap",
  args: { id: v.optional(v.string()), title: v.optional(v.string()) },
  handler: function* createMindmap({ id, title }) {
    const last = yield* selectFrom(mindmapsTable, "byOrderToken")
      .order("desc")
      .first();
    const mindmap: Mindmap = {
      type: mindmapType,
      id: id ?? uuidv7(),
      title: title ?? "",
      orderToken: generateJitteredKeyBetween(last?.orderToken ?? null, null),
      createdAt: Date.now(),
    };
    yield* insert(mindmapsTable, [mindmap]);
    return mindmap;
  },
});

export const updateMindmap = action({
  name: "updateMindmap",
  args: {
    id: v.string(),
    mindmap: v.partial(v.object({ title: v.string(), titleDoc: v.string() })),
  },
  handler: function* updateMindmap({ id, mindmap }) {
    const current = yield* mindmapById({ id });
    if (!current) throw new Error("Mindmap not found");
    const next = syncItemRichText(current, { ...current, ...mindmap });
    yield* upsert(mindmapsTable, [next]);
    return next;
  },
});

export const deleteMindmap = action({
  name: "deleteMindmap",
  args: { id: v.string() },
  handler: function* deleteMindmap({ id }) {
    const nodes = yield* mindmapNodes({ mindmapId: id });
    yield* deleteRows(
      mindmapNodesTable,
      nodes.map((node) => node.id),
    );
    yield* deleteRows(mindmapsTable, [id]);
  },
});

export const moveMindmapNode = action({
  name: "moveMindmapNode",
  args: { id: v.string(), placement: mindmapPlacement },
  handler: function* moveMindmapNode({
    id,
    placement,
  }): Generator<unknown, MindmapNode, unknown> {
    const [moved] = yield* moveMindmapNodes({ ids: [id], placement });
    if (!moved) throw new Error("Mindmap node not found");
    return moved;
  },
});

/**
 * Moves nodes, with their subtrees, to one placement in map order. A node
 * under another moved node travels with it.
 */
export const moveMindmapNodes = action({
  name: "moveMindmapNodes",
  args: { ids: v.array(v.string()), placement: mindmapPlacement },
  handler: function* moveMindmapNodes({
    ids,
    placement,
  }): Generator<unknown, MindmapNode[], unknown> {
    const first =
      ids[0] === undefined ? undefined : yield* mindmapNodeById({ id: ids[0] });
    if (!first) return [];
    const { mindmapId } = first;
    const nodes = yield* mindmapNodes({ mindmapId });
    const selected = nodes.filter((node) => ids.includes(node.id));
    if ("siblingId" in placement && ids.includes(placement.siblingId)) {
      return selected;
    }

    const target =
      "siblingId" in placement
        ? nodes.find((node) => node.id === placement.siblingId)?.parentId
        : placement.parentId;
    const roots = selected.filter(
      (node) =>
        !selected.some(
          (other) =>
            other.id !== node.id &&
            isMindmapNodeWithin(nodes, other.id, node.id),
        ),
    );
    if (
      target !== undefined &&
      roots.some((node) => isMindmapNodeWithin(nodes, node.id, target))
    ) {
      throw new Error("Cannot move a mindmap node into itself");
    }

    const order = treeOrder(mindmapId, nodes);
    roots.sort(
      (a, b) =>
        (order.get(a.id) ?? order.size) - (order.get(b.id) ?? order.size) ||
        (a.id < b.id ? -1 : 1),
    );
    const { parentId, side, orderTokens } = yield* resolvePlacement(
      mindmapId,
      placement,
      new Set(roots.map((node) => node.id)),
      roots.length,
    );
    const moved = roots.map(
      (node, index): MindmapNode => ({
        ...node,
        parentId,
        side,
        orderToken: orderTokens[index]!,
      }),
    );
    yield* upsert(mindmapNodesTable, moved);
    return moved;
  },
});

export const createMindmapNode = action({
  name: "createMindmapNode",
  args: {
    mindmapId: v.string(),
    placement: mindmapPlacement,
    id: v.optional(v.string()),
    taskId: v.optional(v.string()),
    title: v.optional(v.string()),
  },
  handler: function* createMindmapNode({
    mindmapId,
    placement,
    id,
    taskId,
    title,
  }): Generator<unknown, MindmapNode, unknown> {
    if (!(yield* mindmapById({ id: mindmapId }))) {
      throw new Error("Mindmap not found");
    }
    if (taskId !== undefined) {
      if (!(yield* taskById({ id: taskId }))) throw new Error("Task not found");
      // A task appears once per map; dropping it again moves it.
      const existing = (yield* mindmapNodesByTaskIds({
        taskIds: [taskId],
      })).find((node) => node.mindmapId === mindmapId);
      if (existing) {
        return yield* moveMindmapNode({ id: existing.id, placement });
      }
    }

    const { parentId, side, orderTokens } = yield* resolvePlacement(
      mindmapId,
      placement,
    );
    const node: MindmapNode = {
      type: mindmapNodeType,
      id: id ?? uuidv7(),
      mindmapId,
      parentId,
      side,
      orderToken: orderTokens[0]!,
      taskId: taskId ?? null,
      title: taskId === undefined ? (title ?? "") : "",
      collapsed: false,
      createdAt: Date.now(),
    };
    yield* insert(mindmapNodesTable, [node]);
    return node;
  },
});

export const updateMindmapNode = action({
  name: "updateMindmapNode",
  args: {
    id: v.string(),
    node: v.partial(
      v.object({
        title: v.string(),
        titleDoc: v.string(),
        collapsed: v.boolean(),
        side: mindmapNodeSide,
      }),
    ),
  },
  handler: function* updateMindmapNode({ id, node }) {
    const current = yield* mindmapNodeById({ id });
    if (!current) throw new Error("Mindmap node not found");
    const next = syncItemRichText(current, { ...current, ...node });
    yield* upsert(mindmapNodesTable, [next]);
    return next;
  },
});

/** Removes nodes and everything under them from their map; Tasks stay. */
export const deleteMindmapNodes = action({
  name: "deleteMindmapNodes",
  args: { ids: v.array(v.string()) },
  handler: function* deleteMindmapNodes({ ids }) {
    if (ids.length === 0) return;
    const roots = (yield* selectFrom(mindmapNodesTable, "byId").where((q) =>
      ids.map((id) => q.eq("id", id)),
    )) as MindmapNode[];
    const toDelete = new Set<string>();
    for (const mindmapId of new Set(roots.map((node) => node.mindmapId))) {
      const nodes = yield* mindmapNodes({ mindmapId });
      for (const node of nodes) {
        if (
          roots.some((root) => isMindmapNodeWithin(nodes, root.id, node.id))
        ) {
          toDelete.add(node.id);
        }
      }
    }
    yield* deleteRows(mindmapNodesTable, [...toDelete]);
  },
});

export const convertMindmapNodeToTask = action({
  name: "convertMindmapNodeToTask",
  args: { id: v.string() },
  handler: function* convertMindmapNodeToTask({ id }) {
    const node = yield* mindmapNodeById({ id });
    if (!node) throw new Error("Mindmap node not found");
    if (node.taskId !== null) throw new Error("Mindmap node is already a task");

    const task = yield* createTaskInSection({
      projectSectionId: yield* inboxProjectSectionId({}),
      position: "prepend",
      taskAttrs: { title: node.title },
    });
    const { titleDoc: _titleDoc, ...rest } = node;
    yield* upsert(mindmapNodesTable, [{ ...rest, taskId: task.id, title: "" }]);
    return task;
  },
});

/** Creates an inbox task and places it on the map. */
export const createMindmapTask = action({
  name: "createMindmapTask",
  args: {
    mindmapId: v.string(),
    placement: mindmapPlacement,
    title: v.optional(v.string()),
  },
  handler: function* createMindmapTask({
    mindmapId,
    placement,
    title,
  }): Generator<unknown, MindmapNode, unknown> {
    const task = yield* createTaskInSection({
      projectSectionId: yield* inboxProjectSectionId({}),
      position: "prepend",
      taskAttrs: { title: title ?? "" },
    });
    return yield* createMindmapNode({ mindmapId, placement, taskId: task.id });
  },
});

/** Unlinks a task node into a topic with the task's title; the Task stays. */
export const convertMindmapNodeToTopic = action({
  name: "convertMindmapNodeToTopic",
  args: { id: v.string() },
  handler: function* convertMindmapNodeToTopic({ id }) {
    const node = yield* mindmapNodeById({ id });
    if (!node) throw new Error("Mindmap node not found");
    if (node.taskId === null) return node;

    const task = yield* taskById({ id: node.taskId });
    const { titleDoc: _titleDoc, ...rest } = node;
    const next: MindmapNode = {
      ...rest,
      taskId: null,
      title: task?.title ?? "",
    };
    yield* upsert(mindmapNodesTable, [next]);
    return next;
  },
});

// Called whenever Tasks are deleted: their nodes go, and each node's children
// take its place so topics placed under a task are not lost.
export const detachMindmapNodesOfTasks = action({
  name: "detachMindmapNodesOfTasks",
  args: { taskIds: v.array(v.string()) },
  handler: function* detachMindmapNodesOfTasks({ taskIds }) {
    const detached = yield* mindmapNodesByTaskIds({ taskIds });
    for (const { id } of detached) {
      // Re-read: an earlier iteration may have moved this node.
      const node = yield* mindmapNodeById({ id });
      if (!node) continue;
      const siblings = yield* mindmapNodeChildren({
        mindmapId: node.mindmapId,
        parentId: node.parentId,
      });
      const next = siblings[siblings.findIndex((s) => s.id === id) + 1];
      const children = yield* mindmapNodeChildren({
        mindmapId: node.mindmapId,
        parentId: node.id,
      });
      yield* deleteRows(mindmapNodesTable, [id]);
      if (children.length === 0) continue;
      const tokens = generateNJitteredKeysBetween(
        node.orderToken,
        next?.orderToken ?? null,
        children.length,
      );
      yield* upsert(
        mindmapNodesTable,
        children.map((child, index) => ({
          ...child,
          parentId: node.parentId,
          orderToken: tokens[index]!,
          side: node.side,
        })),
      );
    }
    return detached;
  },
});
