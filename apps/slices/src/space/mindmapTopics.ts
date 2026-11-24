import { selectFrom, v } from "@will-be-done/hyperdb";
import { selector } from "../builders";
import {
  type Mindmap,
  type MindmapNode,
  mindmapNodesTable,
  mindmapNodeType,
  mindmapsTable,
} from "./tables";

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

/** A node by ID, or the central topic's stand-in while its row is missing. */
export const mindmapNodeOrRootById = selector({
  name: "mindmapNodeOrRootById",
  args: { id: v.string() },
  handler: function* mindmapNodeOrRootById({ id }) {
    const node = yield* selectFrom(mindmapNodesTable, "byId")
      .where((q) => q.eq("id", id))
      .first();
    if (node) return node as MindmapNode;
    const mindmap = yield* selectFrom(mindmapsTable, "byId")
      .where((q) => q.eq("id", id))
      .first();
    return mindmap ? mindmapRootNode(mindmap) : undefined;
  },
});
