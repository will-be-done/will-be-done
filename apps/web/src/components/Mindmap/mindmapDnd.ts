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

export type MindmapItem = { type: "task" | "note"; id: string };

export type MindmapDragSource =
  | { kind: "item"; item: MindmapItem }
  | { kind: "nodes"; nodeIds: string[] };

// Tasks, daily entries and stash entries all carry their task; node drags only
// count inside their own map. Other drop targets ignore node drags because
// they are not model data.
export function mindmapDragSource(
  data: unknown,
  mindmapId: string,
): MindmapDragSource | null {
  if (isModelDNDData(data)) {
    if ("role" in data) return null;
    if ("task" in data) {
      return { kind: "item", item: { type: "task", id: data.task.id } };
    }
    return data.modelType === "note"
      ? { kind: "item", item: { type: "note", id: data.modelId } }
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
