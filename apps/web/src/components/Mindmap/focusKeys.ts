import {
  type MindmapNode,
  mindmapNodeType,
  mindmapType,
  taskType,
} from "@will-be-done/slices/space";
import { buildFocusKey } from "@/store/focusSlice.ts";

export const mindmapRootFocusKey = (mindmapId: string) =>
  buildFocusKey(mindmapId, mindmapType);

// Task nodes use the task's key so the details panel opens it; the node ID
// keeps it distinct from the same task shown in the projects view.
export const mindmapNodeFocusKey = (
  node: Pick<MindmapNode, "id" | "taskId">,
) =>
  node.taskId === null
    ? buildFocusKey(node.id, mindmapNodeType)
    : buildFocusKey(node.taskId, taskType, node.id);
