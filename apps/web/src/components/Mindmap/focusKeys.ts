import {
  type MindmapNode,
  mindmapNodeType,
  mindmapType,
  noteType,
  taskType,
} from "@will-be-done/slices/space";
import { buildFocusKey, type FocusKey } from "@/store/focusSlice.ts";

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

/** The node of a focused topic; the central topic's key names its map, whose ID it shares. */
export const mindmapTopicIdOfKey = (key: FocusKey) => {
  const [type, id] = key.split("^^");
  return type === mindmapNodeType || type === mindmapType ? id : undefined;
};

/** A task or note shown on a map, as opposed to in a list. */
export const isMindmapItemFocusKey = (key: FocusKey) => {
  const [type, , nodeId] = key.split("^^");
  return (type === taskType || type === noteType) && nodeId !== undefined;
};
