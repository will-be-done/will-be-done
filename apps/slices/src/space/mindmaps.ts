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
import {
  richTextMarkdownToPlainText,
  richTextNodesToMarkdown,
} from "../common/richText";
import { noteById } from "./notes";
import {
  createNoteInSection,
  createTaskInSection,
  firstProjectSectionChild,
} from "./projectSections";
import { inboxProjectId } from "./projects";
import { insertItemCopies } from "./selection";
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
  type Note,
  notesTable,
  type Project,
  type ProjectSection,
  projectSectionsTable,
  projectsTable,
  type Task,
} from "./tables";

export type MindmapTreeNode = {
  node: MindmapNode;
  // Set for task and note nodes; one whose Task or Note is gone is not in the
  // tree.
  task: Task | undefined;
  note: Note | undefined;
  project: Project | undefined;
  section: ProjectSection | undefined;
  children: MindmapTreeNode[];
};

export type MindmapTree = {
  mindmap: Mindmap;
  // The center topic; its children are the main branches.
  root: MindmapNode;
  branches: MindmapTreeNode[];
  // Roots placed freely on the canvas, each with its own main branches.
  floating: MindmapTreeNode[];
};

/** The center topic is the node whose ID is its map's. */
export const isMindmapRoot = (node: Pick<MindmapNode, "id" | "mindmapId">) =>
  node.id === node.mindmapId;

// Written with the map, but stood in for while its row has not synced yet.
export const mindmapRootNode = (
  mindmap: Pick<Mindmap, "id" | "createdAt">,
): MindmapNode => ({
  type: mindmapNodeType,
  id: mindmap.id,
  mindmapId: mindmap.id,
  parentId: null,
  orderToken: "a0",
  side: "right",
  taskId: null,
  title: "",
  collapsed: false,
  createdAt: mindmap.createdAt,
});

/** A new map's center topic starts as its name, which is plain text. */
export const newMindmapRootNode = (
  mindmap: Pick<Mindmap, "id" | "title" | "createdAt">,
): MindmapNode => ({
  ...mindmapRootNode(mindmap),
  title: richTextNodesToMarkdown(
    [
      {
        type: "paragraph",
        content: mindmap.title ? [{ type: "text", text: mindmap.title }] : [],
      },
    ],
    "title",
  ),
});

/** A map without a name goes by its center topic. */
export const mindmapDisplayTitle = (
  mindmap: Pick<Mindmap, "title">,
  root: Pick<MindmapNode, "title"> | undefined,
) =>
  mindmap.title.trim() ||
  richTextMarkdownToPlainText(root?.title ?? "", "title");

export type MindmapListItem = { mindmap: Mindmap; title: string };

const compareNodes = (a: MindmapNode, b: MindmapNode) => {
  if (a.orderToken !== b.orderToken)
    return a.orderToken < b.orderToken ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
};

// Every replica repairs concurrent edits the same way, so they converge on one
// picture without writing fixes back:
// - the center topic is not part of the result; `branches` are its children;
// - any other node without a parent is a floating root, kept even if its
//   linked item is gone;
// - a node whose parent is gone becomes a main branch;
// - a parent cycle is broken at its smallest node ID, which becomes a main branch;
// - a task or note node whose item is gone is hidden and its children take its
//   place.
export function buildMindmapTree(
  mindmapId: string,
  nodes: readonly MindmapNode[],
  items: {
    tasks?: ReadonlyMap<string, Task>;
    notes?: ReadonlyMap<string, Note>;
  },
  // Where each item lives, by its section ID.
  places: ReadonlyMap<
    string,
    { project: Project; section: ProjectSection }
  > = new Map(),
): { branches: MindmapTreeNode[]; floating: MindmapTreeNode[] } {
  nodes = nodes.filter((node) => node.id !== mindmapId);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const floating = nodes.filter(
    (node) => node.mindmapId === mindmapId && node.parentId === null,
  );
  const parentOf = new Map<string, string>();
  for (const node of nodes) {
    if (node.mindmapId === mindmapId && node.parentId === null) continue;
    parentOf.set(
      node.id,
      node.mindmapId === mindmapId &&
        node.parentId !== null &&
        byId.has(node.parentId)
        ? node.parentId
        : mindmapId,
    );
  }

  const done = new Set<string>();
  for (const node of nodes) {
    const path: string[] = [];
    const onPath = new Set<string>();
    let current = node.id;
    while (parentOf.has(current) && !done.has(current)) {
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
    const parentId = parentOf.get(node.id);
    if (parentId === undefined) continue;
    const siblings = childrenOf.get(parentId);
    if (siblings) siblings.push(node);
    else childrenOf.set(parentId, [node]);
  }

  const treeNode = (
    node: MindmapNode,
    children: MindmapTreeNode[],
  ): MindmapTreeNode => {
    const task = node.taskId ? items.tasks?.get(node.taskId) : undefined;
    const note = node.noteId ? items.notes?.get(node.noteId) : undefined;
    const item = task ?? note;
    const place = item && places.get(item.projectSectionId);
    return {
      node,
      task,
      note,
      project: place?.project,
      section: place?.section,
      children,
    };
  };

  const build = (parentId: string): MindmapTreeNode[] =>
    (childrenOf.get(parentId) ?? []).sort(compareNodes).flatMap((node) => {
      const tree = treeNode(node, build(node.id));
      const isGone = !tree.task && !tree.note && (node.taskId || node.noteId);
      return isGone ? tree.children : [tree];
    });

  return {
    branches: build(mindmapId),
    floating: floating
      .sort(compareNodes)
      .map((node) => treeNode(node, build(node.id))),
  };
}

/** Whether `nodeId` is `ancestorId` or lies under it, following stored parents. */
export function isMindmapNodeWithin(
  nodes: readonly Pick<MindmapNode, "id" | "parentId">[],
  ancestorId: string,
  nodeId: string,
) {
  const parentOf = new Map(nodes.map((node) => [node.id, node.parentId]));
  const seen = new Set<string>();
  let current: string | null | undefined = nodeId;
  while (typeof current === "string" && !seen.has(current)) {
    if (current === ancestorId) return true;
    seen.add(current);
    current = parentOf.get(current);
  }
  return false;
}

export const mindmapPlacement = v.union(
  // A floating root centered on this map point; topics only.
  v.object({ x: v.number(), y: v.number() }),
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

function* withDisplayTitles(
  mindmaps: Mindmap[],
): Generator<unknown, MindmapListItem[], unknown> {
  if (mindmaps.length === 0) return [];
  const roots = (yield* selectFrom(mindmapNodesTable, "byId").where((q) =>
    mindmaps.map((mindmap) => q.eq("id", mindmap.id)),
  )) as MindmapNode[];
  const rootsById = new Map(roots.map((root) => [root.id, root]));
  return mindmaps.map((mindmap) => ({
    mindmap,
    title: mindmapDisplayTitle(mindmap, rootsById.get(mindmap.id)),
  }));
}

export const mindmapsWithTitles = selector({
  name: "mindmapsWithTitles",
  args: {},
  handler: function* mindmapsWithTitles() {
    return yield* withDisplayTitles(yield* mindmapsOrdered({}));
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
  args: { mindmapId: v.string(), parentId: v.union(v.string(), v.null()) },
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

export const mindmapNodesByNoteIds = selector({
  name: "mindmapNodesByNoteIds",
  args: { noteIds: v.array(v.string()) },
  handler: function* mindmapNodesByNoteIds({ noteIds }) {
    if (noteIds.length === 0) return [];
    return (yield* selectFrom(mindmapNodesTable, "byNoteId").where((q) =>
      noteIds.map((noteId) => q.eq("noteId", noteId)),
    )) as MindmapNode[];
  },
});

/** The mindmaps a Task or Note appears on. */
export const mindmapsOfItem = selector({
  name: "mindmapsOfItem",
  args: { id: v.string() },
  handler: function* mindmapsOfItem({ id }) {
    const nodes = [
      ...(yield* mindmapNodesByTaskIds({ taskIds: [id] })),
      ...(yield* mindmapNodesByNoteIds({ noteIds: [id] })),
    ];
    const ids = [...new Set(nodes.map((node) => node.mindmapId))];
    if (ids.length === 0) return [];
    const mindmaps = (yield* selectFrom(mindmapsTable, "byId").where((q) =>
      ids.map((id) => q.eq("id", id)),
    )) as Mindmap[];
    return yield* withDisplayTitles(
      mindmaps.sort((a, b) => (a.orderToken < b.orderToken ? -1 : 1)),
    );
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
    const noteIds = [
      ...new Set(nodes.flatMap((node) => (node.noteId ? [node.noteId] : []))),
    ];
    const notes =
      noteIds.length === 0
        ? []
        : ((yield* selectFrom(notesTable, "byId").where((q) =>
            noteIds.map((id) => q.eq("id", id)),
          )) as Note[]);
    const sectionIds = [
      ...new Set([...tasks, ...notes].map((item) => item.projectSectionId)),
    ];
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
    const places = new Map<
      string,
      { project: Project; section: ProjectSection }
    >();
    for (const section of sections) {
      const project = projectsById.get(section.projectId);
      if (project) places.set(section.id, { project, section });
    }

    return {
      mindmap,
      root:
        nodes.find((node) => node.id === mindmapId) ?? mindmapRootNode(mindmap),
      ...buildMindmapTree(
        mindmapId,
        nodes,
        {
          tasks: new Map(tasks.map((task) => [task.id, task])),
          notes: new Map(notes.map((note) => [note.id, note])),
        },
        places,
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
  {
    parentId: string | null;
    orderTokens: string[];
    side: MindmapNodeSide;
    // Centers for floating roots, one per key.
    points?: { x: number; y: number }[];
  },
  unknown
> {
  const keysBetween = (lower?: MindmapNode, upper?: MindmapNode) =>
    generateNJitteredKeysBetween(
      lower?.orderToken ?? null,
      upper?.orderToken ?? null,
      count,
    );

  if ("x" in placement) {
    // Several floating at once stack downward, so they do not overlap.
    return {
      parentId: null,
      side: "right",
      orderTokens: keysBetween(undefined, undefined),
      points: Array.from({ length: count }, (_, index) => ({
        x: placement.x,
        y: placement.y + index * 56,
      })),
    };
  }

  if ("siblingId" in placement) {
    const sibling = yield* mindmapNodeById({ id: placement.siblingId });
    if (!sibling || sibling.mindmapId !== mindmapId) {
      throw new Error("Mindmap node not found");
    }
    if (sibling.parentId === null) {
      throw new Error("A root has no siblings");
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
  const parent =
    parentId === mindmapId
      ? undefined
      : yield* mindmapNodeById({ id: parentId });
  if (parentId !== mindmapId && (!parent || parent.mindmapId !== mindmapId)) {
    throw new Error("Mindmap node not found");
  }
  let side: MindmapNodeSide;
  // Under any root, a new main branch goes to the emptier side.
  if (!parent || parent.parentId === null) {
    if (placement.side) {
      side = placement.side;
    } else {
      const left = siblings.filter((node) => node.side === "left").length;
      side = siblings.length - left <= left ? "right" : "left";
    }
  } else {
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
  const children = new Map<string | null, MindmapNode[]>();
  for (const node of nodes) {
    children.set(node.parentId, [...(children.get(node.parentId) ?? []), node]);
  }
  const order = new Map<string, number>();
  const visit = (parentId: string | null) => {
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
  visit(null);
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
    yield* insert(mindmapNodesTable, [newMindmapRootNode(mindmap)]);
    return mindmap;
  },
});

export const updateMindmap = action({
  name: "updateMindmap",
  args: {
    id: v.string(),
    mindmap: v.partial(v.object({ title: v.string() })),
  },
  handler: function* updateMindmap({ id, mindmap }) {
    const current = yield* mindmapById({ id });
    if (!current) throw new Error("Mindmap not found");
    const next = { ...current, ...mindmap };
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
    // The center topic stays in the center.
    const selected = nodes.filter(
      (node) => ids.includes(node.id) && !isMindmapRoot(node),
    );
    if (selected.length === 0) return [];
    if ("siblingId" in placement && ids.includes(placement.siblingId)) {
      return selected;
    }

    const target =
      "siblingId" in placement
        ? nodes.find((node) => node.id === placement.siblingId)?.parentId
        : "parentId" in placement
          ? placement.parentId
          : undefined;
    const roots = selected.filter(
      (node) =>
        !selected.some(
          (other) =>
            other.id !== node.id &&
            isMindmapNodeWithin(nodes, other.id, node.id),
        ),
    );
    if (
      typeof target === "string" &&
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
    if ("x" in placement && roots.some((node) => node.taskId || node.noteId)) {
      throw new Error("Only topics float");
    }
    const { parentId, side, orderTokens, points } = yield* resolvePlacement(
      mindmapId,
      placement,
      new Set(roots.map((node) => node.id)),
      roots.length,
    );
    const moved = roots.map(
      ({ x: _x, y: _y, ...node }, index): MindmapNode => ({
        ...node,
        parentId,
        side,
        orderToken: orderTokens[index]!,
        ...points?.[index],
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
    // At most one of taskId and noteId.
    taskId: v.optional(v.string()),
    noteId: v.optional(v.string()),
    title: v.optional(v.string()),
  },
  handler: function* createMindmapNode({
    mindmapId,
    placement,
    id,
    taskId,
    noteId,
    title,
  }): Generator<unknown, MindmapNode, unknown> {
    if (!(yield* mindmapById({ id: mindmapId }))) {
      throw new Error("Mindmap not found");
    }
    if (taskId !== undefined && noteId !== undefined) {
      throw new Error("A mindmap node links a task or a note, not both");
    }
    if (taskId !== undefined && !(yield* taskById({ id: taskId }))) {
      throw new Error("Task not found");
    }
    if (noteId !== undefined && !(yield* noteById({ id: noteId }))) {
      throw new Error("Note not found");
    }
    if (taskId !== undefined || noteId !== undefined) {
      // An item appears once per map; dropping it again moves it.
      const existing = (
        taskId !== undefined
          ? yield* mindmapNodesByTaskIds({ taskIds: [taskId] })
          : yield* mindmapNodesByNoteIds({ noteIds: [noteId!] })
      ).find((node) => node.mindmapId === mindmapId);
      if (existing) {
        return yield* moveMindmapNode({ id: existing.id, placement });
      }
    }

    if ("x" in placement && (taskId !== undefined || noteId !== undefined)) {
      throw new Error("Only topics float");
    }
    const { parentId, side, orderTokens, points } = yield* resolvePlacement(
      mindmapId,
      placement,
    );
    const node: MindmapNode = {
      type: mindmapNodeType,
      id: id ?? uuidv7(),
      mindmapId,
      parentId,
      ...points?.[0],
      side,
      orderToken: orderTokens[0]!,
      taskId: taskId ?? null,
      ...(noteId === undefined ? {} : { noteId }),
      title: taskId === undefined && noteId === undefined ? (title ?? "") : "",
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
    const mindmap = yield* mindmapById({ id });
    const current =
      (yield* mindmapNodeById({ id })) ??
      (mindmap ? mindmapRootNode(mindmap) : undefined);
    if (!current) throw new Error("Mindmap node not found");
    const next = syncItemRichText(current, { ...current, ...node });
    yield* upsert(mindmapNodesTable, [next]);
    return next;
  },
});

/** Removes nodes and everything under them from their map; items stay. */
export const deleteMindmapNodes = action({
  name: "deleteMindmapNodes",
  args: { ids: v.array(v.string()) },
  handler: function* deleteMindmapNodes({ ids }) {
    if (ids.length === 0) return;
    const roots = (
      (yield* selectFrom(mindmapNodesTable, "byId").where((q) =>
        ids.map((id) => q.eq("id", id)),
      )) as MindmapNode[]
    ).filter((node) => !isMindmapRoot(node));
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

const mindmapItemRef = v.object({
  type: v.union(v.literal("task"), v.literal("note")),
  id: v.string(),
});

/** Places tasks and notes in order; one already on the map moves there. */
export const placeMindmapItems = action({
  name: "placeMindmapItems",
  args: {
    mindmapId: v.string(),
    items: v.array(mindmapItemRef),
    placement: mindmapPlacement,
  },
  handler: function* placeMindmapItems({
    mindmapId,
    items,
    placement,
  }): Generator<unknown, MindmapNode[], unknown> {
    const placed: MindmapNode[] = [];
    let next = placement;
    for (const item of items) {
      // One already on the map cannot move into its own subtree.
      const nodes = yield* mindmapNodes({ mindmapId });
      const existing = nodes.find(
        (node) =>
          (item.type === "task" ? node.taskId : node.noteId) === item.id,
      );
      const at = next;
      const target =
        "parentId" in at
          ? at.parentId
          : "siblingId" in at
            ? nodes.find((node) => node.id === at.siblingId)?.parentId
            : undefined;
      if (
        existing &&
        typeof target === "string" &&
        isMindmapNodeWithin(nodes, existing.id, target)
      ) {
        continue;
      }
      const node = yield* createMindmapNode({
        mindmapId,
        placement: next,
        ...(item.type === "task" ? { taskId: item.id } : { noteId: item.id }),
      });
      placed.push(node);
      next = { siblingId: node.id, edge: "after" };
    }
    return placed;
  },
});

/**
 * Pastes nodes with their subtrees at one placement, in map order; the central
 * topic is skipped. A cut within the map moves the nodes. A cut from another
 * map rebuilds them here, linked to the same items, and removes the
 * originals. A copy rebuilds them with copies of their tasks and notes, since
 * an item appears once per map.
 */
export const pasteMindmapNodes = action({
  name: "pasteMindmapNodes",
  args: {
    mindmapId: v.string(),
    ids: v.array(v.string()),
    placement: mindmapPlacement,
    mode: v.union(v.literal("copy"), v.literal("cut")),
  },
  handler: function* pasteMindmapNodes({
    mindmapId,
    ids,
    placement,
    mode,
  }): Generator<unknown, MindmapNode[], unknown> {
    if (!(yield* mindmapById({ id: mindmapId }))) {
      throw new Error("Mindmap not found");
    }
    if (ids.length === 0) return [];
    const picked = (
      (yield* selectFrom(mindmapNodesTable, "byId").where((q) =>
        ids.map((id) => q.eq("id", id)),
      )) as MindmapNode[]
    ).filter((node) => !isMindmapRoot(node));
    const mapNodes = new Map<string, MindmapNode[]>();
    for (const sourceId of new Set(picked.map((node) => node.mindmapId))) {
      mapNodes.set(sourceId, yield* mindmapNodes({ mindmapId: sourceId }));
    }
    const nodesOf = (node: MindmapNode) => mapNodes.get(node.mindmapId)!;
    const orders = new Map(
      [...mapNodes].map(([id, nodes]) => [id, treeOrder(id, nodes)]),
    );
    const roots = picked
      .filter(
        (node) =>
          !picked.some(
            (other) =>
              other.id !== node.id &&
              other.mindmapId === node.mindmapId &&
              isMindmapNodeWithin(nodesOf(node), other.id, node.id),
          ),
      )
      .sort(
        (a, b) =>
          (a.mindmapId < b.mindmapId
            ? -1
            : a.mindmapId > b.mindmapId
              ? 1
              : 0) ||
          (orders.get(a.mindmapId)!.get(a.id) ?? 0) -
            (orders.get(b.mindmapId)!.get(b.id) ?? 0),
      );
    if (roots.length === 0) return [];
    if ("x" in placement && roots.some((node) => node.taskId || node.noteId)) {
      throw new Error("Only topics float");
    }
    if (mode === "cut" && roots.every((node) => node.mindmapId === mindmapId)) {
      return yield* moveMindmapNodes({
        ids: roots.map((node) => node.id),
        placement,
      });
    }

    const childrenOf = (node: MindmapNode) =>
      nodesOf(node)
        .filter((child) => child.parentId === node.id)
        .sort(compareNodes);
    const subtree: MindmapNode[] = [];
    const collect = (node: MindmapNode) => {
      subtree.push(node);
      childrenOf(node).forEach(collect);
    };
    roots.forEach(collect);

    // Copied nodes link copies of their items; cut ones keep theirs.
    const linked = new Map<string, string>();
    if (mode === "copy") {
      const taskIds = subtree.flatMap((node) =>
        node.taskId ? [node.taskId] : [],
      );
      const noteIds = subtree.flatMap((node) =>
        node.noteId ? [node.noteId] : [],
      );
      const items = [
        ...(yield* tasksByIds({ ids: taskIds })),
        ...(noteIds.length === 0
          ? []
          : ((yield* selectFrom(notesTable, "byId").where((q) =>
              noteIds.map((id) => q.eq("id", id)),
            )) as Note[])),
      ];
      for (const [originalId, copy] of yield* insertItemCopies(items)) {
        linked.set(originalId, copy.id);
      }
    } else {
      // An item already on this map stays where it is.
      const onMap = new Set(
        (yield* mindmapNodes({ mindmapId })).flatMap((node) =>
          [node.taskId, node.noteId].filter((id) => typeof id === "string"),
        ),
      );
      for (const node of subtree) {
        for (const itemId of [node.taskId, node.noteId]) {
          if (itemId && !onMap.has(itemId)) linked.set(itemId, itemId);
        }
      }
    }

    const { parentId, side, orderTokens, points } = yield* resolvePlacement(
      mindmapId,
      placement,
      new Set(),
      roots.length,
    );
    const now = Date.now();
    const created: MindmapNode[] = [];
    const rebuild = (
      source: MindmapNode,
      parent: string | null,
      orderToken: string,
      point?: { x: number; y: number },
    ): MindmapNode[] => {
      const itemId = source.taskId ?? source.noteId;
      const linkedId = itemId ? linked.get(itemId) : undefined;
      // A gone item gives its place to its children, as in the tree.
      if (itemId && !linkedId) {
        return childrenOf(source).flatMap((child) =>
          rebuild(child, parent, child.orderToken),
        );
      }
      const {
        x: _x,
        y: _y,
        noteId: _noteId,
        titleDoc: _titleDoc,
        ...rest
      } = source;
      const node: MindmapNode = {
        ...rest,
        id: uuidv7(),
        mindmapId,
        parentId: parent,
        orderToken,
        side,
        taskId: source.taskId ? (linkedId ?? null) : null,
        ...(source.noteId && !source.taskId && linkedId
          ? { noteId: linkedId }
          : {}),
        ...(!itemId && source.titleDoc ? { titleDoc: source.titleDoc } : {}),
        ...point,
        createdAt: now,
      };
      created.push(node);
      for (const child of childrenOf(source)) {
        rebuild(child, node.id, child.orderToken);
      }
      return [node];
    };
    const pasted = roots.flatMap((root, index) =>
      rebuild(root, parentId, orderTokens[index]!, points?.[index]),
    );
    if (created.length > 0) yield* insert(mindmapNodesTable, created);
    if (mode === "cut") {
      yield* deleteMindmapNodes({ ids: roots.map((node) => node.id) });
    }
    return pasted;
  },
});

// New items go to the first section of the chosen project, or of the inbox,
// whose original section can be deleted.
function* sectionForNewItem(
  projectId: string | undefined,
): Generator<unknown, string, unknown> {
  const inboxId = yield* inboxProjectId({});
  const section =
    (yield* firstProjectSectionChild({ projectId: projectId ?? inboxId })) ??
    (yield* firstProjectSectionChild({ projectId: inboxId }));
  if (!section) throw new Error("Inbox has no sections");
  return section.id;
}

// The project new tasks and notes go to; defaults to the inbox.
const newItemProjectId = v.optional(v.string());

export const convertMindmapNodeToTask = action({
  name: "convertMindmapNodeToTask",
  args: { id: v.string(), projectId: newItemProjectId },
  handler: function* convertMindmapNodeToTask({ id, projectId }) {
    const node = yield* mindmapNodeById({ id });
    if (!node) throw new Error("Mindmap node not found");
    // Roots stay topics.
    if (node.taskId || node.noteId || node.parentId === null) {
      throw new Error("Only a topic converts to a task");
    }

    const task = yield* createTaskInSection({
      projectSectionId: yield* sectionForNewItem(projectId),
      position: "prepend",
      taskAttrs: { title: node.title },
    });
    const { titleDoc: _titleDoc, ...rest } = node;
    yield* upsert(mindmapNodesTable, [{ ...rest, taskId: task.id, title: "" }]);
    return task;
  },
});

/** Creates a task in a project's first section and places it on the map. */
export const createMindmapTask = action({
  name: "createMindmapTask",
  args: {
    mindmapId: v.string(),
    placement: mindmapPlacement,
    title: v.optional(v.string()),
    projectId: newItemProjectId,
  },
  handler: function* createMindmapTask({
    mindmapId,
    placement,
    title,
    projectId,
  }): Generator<unknown, MindmapNode, unknown> {
    const task = yield* createTaskInSection({
      projectSectionId: yield* sectionForNewItem(projectId),
      position: "prepend",
      taskAttrs: { title: title ?? "" },
    });
    return yield* createMindmapNode({ mindmapId, placement, taskId: task.id });
  },
});

export const convertMindmapNodeToNote = action({
  name: "convertMindmapNodeToNote",
  args: { id: v.string(), projectId: newItemProjectId },
  handler: function* convertMindmapNodeToNote({ id, projectId }) {
    const node = yield* mindmapNodeById({ id });
    if (!node) throw new Error("Mindmap node not found");
    if (node.taskId || node.noteId || node.parentId === null) {
      throw new Error("Only a topic converts to a note");
    }

    const note = yield* createNoteInSection({
      projectSectionId: yield* sectionForNewItem(projectId),
      position: "prepend",
      noteAttrs: { title: node.title },
    });
    const { titleDoc: _titleDoc, ...rest } = node;
    yield* upsert(mindmapNodesTable, [{ ...rest, noteId: note.id, title: "" }]);
    return note;
  },
});

/** Creates a note in a project's first section and places it on the map. */
export const createMindmapNote = action({
  name: "createMindmapNote",
  args: {
    mindmapId: v.string(),
    placement: mindmapPlacement,
    title: v.optional(v.string()),
    projectId: newItemProjectId,
  },
  handler: function* createMindmapNote({
    mindmapId,
    placement,
    title,
    projectId,
  }): Generator<unknown, MindmapNode, unknown> {
    const note = yield* createNoteInSection({
      projectSectionId: yield* sectionForNewItem(projectId),
      position: "prepend",
      noteAttrs: { title: title ?? "" },
    });
    return yield* createMindmapNode({ mindmapId, placement, noteId: note.id });
  },
});

/** Unlinks a task or note node into a topic with its title; the item stays. */
export const convertMindmapNodeToTopic = action({
  name: "convertMindmapNodeToTopic",
  args: { id: v.string() },
  handler: function* convertMindmapNodeToTopic({ id }) {
    const node = yield* mindmapNodeById({ id });
    if (!node) throw new Error("Mindmap node not found");
    if (!node.taskId && !node.noteId) return node;

    const item = node.taskId
      ? yield* taskById({ id: node.taskId })
      : yield* noteById({ id: node.noteId! });
    const { titleDoc: _titleDoc, noteId: _noteId, ...rest } = node;
    const next: MindmapNode = {
      ...rest,
      taskId: null,
      title: item?.title ?? "",
    };
    yield* upsert(mindmapNodesTable, [next]);
    return next;
  },
});

// Called whenever Tasks or Notes are deleted: their nodes go, and each node's
// children take its place so topics placed under an item are not lost.
export const detachMindmapNodesOfItems = action({
  name: "detachMindmapNodesOfItems",
  args: { ids: v.array(v.string()) },
  handler: function* detachMindmapNodesOfItems({ ids }) {
    const detached = [
      ...(yield* mindmapNodesByTaskIds({ taskIds: ids })),
      ...(yield* mindmapNodesByNoteIds({ noteIds: ids })),
    ];
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

// Task <-> Note conversion replaces the row with a new ID; the map keeps the
// node and its children and links them to the new item.
export const relinkMindmapNodes = action({
  name: "relinkMindmapNodes",
  args: {
    from: v.string(),
    to: v.object({
      type: v.union(v.literal("task"), v.literal("note")),
      id: v.string(),
    }),
  },
  handler: function* relinkMindmapNodes({ from, to }) {
    const nodes = [
      ...(yield* mindmapNodesByTaskIds({ taskIds: [from] })),
      ...(yield* mindmapNodesByNoteIds({ noteIds: [from] })),
    ];
    if (nodes.length === 0) return;
    yield* upsert(
      mindmapNodesTable,
      nodes.map(({ noteId: _noteId, ...node }) =>
        to.type === "task"
          ? { ...node, taskId: to.id }
          : { ...node, taskId: null, noteId: to.id },
      ),
    );
  },
});
