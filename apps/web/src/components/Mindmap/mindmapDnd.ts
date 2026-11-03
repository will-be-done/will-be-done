import { isModelDNDData } from "@/lib/dnd/models";

type MindmapNodeDragData = {
  mindmapNodeDrag: { mindmapId: string; nodeIds: string[] };
};

export const mindmapNodeDragData = (
  mindmapId: string,
  nodeIds: string[],
): MindmapNodeDragData => ({ mindmapNodeDrag: { mindmapId, nodeIds } });

const isRecord = (data: unknown): data is Record<string, unknown> =>
  typeof data === "object" && data !== null;

export type MindmapDragSource =
  | { kind: "task"; taskId: string }
  | { kind: "nodes"; nodeIds: string[] };

// Tasks, daily entries and stash entries all carry their task; node drags only
// count inside their own map. Other drop targets ignore node drags because
// they are not model data.
export function mindmapDragSource(
  data: unknown,
  mindmapId: string,
): MindmapDragSource | null {
  if (isModelDNDData(data)) {
    return "task" in data && !("role" in data)
      ? { kind: "task", taskId: data.task.id }
      : null;
  }
  if (!isRecord(data) || !isRecord(data.mindmapNodeDrag)) return null;
  const { mindmapId: sourceMindmapId, nodeIds } = data.mindmapNodeDrag;
  return sourceMindmapId === mindmapId &&
    Array.isArray(nodeIds) &&
    nodeIds.every((id) => typeof id === "string")
    ? { kind: "nodes", nodeIds }
    : null;
}
