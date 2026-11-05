import {
  type MindmapNode,
  mindmapNodeType,
  mindmapType,
  noteType,
  taskType,
} from "@will-be-done/slices/space";
import { buildFocusKey } from "@/store/focusSlice.ts";

export const mindmapRootFocusKey = (mindmapId: string) =>
  buildFocusKey(mindmapId, mindmapType);

// Task and note nodes use their item's key so the details panel opens it; the
// node ID keeps it distinct from the same item shown in the projects view.
export const mindmapNodeFocusKey = (
  node: Pick<MindmapNode, "id" | "taskId" | "noteId">,
) =>
  node.taskId
    ? buildFocusKey(node.taskId, taskType, node.id)
    : node.noteId
      ? buildFocusKey(node.noteId, noteType, node.id)
      : buildFocusKey(node.id, mindmapNodeType);
