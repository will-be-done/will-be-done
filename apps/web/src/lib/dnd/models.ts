import { canDropModel, type DropModelData } from "@will-be-done/slices/space";
import type { DropTargetRecord } from "@atlaskit/pragmatic-drag-and-drop/types";
import type { ElementDropTargetEventBasePayload } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";

export type DndModelData = DropModelData;

export function isModelDNDData(data: unknown): data is DndModelData {
  if (
    typeof data !== "object" ||
    data === null ||
    !("modelId" in data) ||
    typeof data.modelId !== "string" ||
    !("modelType" in data) ||
    ("role" in data && data.role !== undefined && data.role !== "checklist")
  ) {
    return false;
  }
  switch (data.modelType) {
    case "task":
    case "dailyEntry":
    case "stashEntry": {
      if (!("task" in data)) return false;
      const task = data.task;
      return (
        typeof task === "object" &&
        task !== null &&
        "id" in task &&
        typeof task.id === "string" &&
        "state" in task &&
        (task.state === "todo" || task.state === "done") &&
        (data.modelType !== "task" || data.modelId === task.id)
      );
    }
    case "template":
    case "project":
    case "projectSection":
    case "dailyList":
    case "stash":
    case "checklistItem":
      return true;
    default:
      return false;
  }
}

export function canDropModelData(source: unknown, target: DndModelData) {
  return isModelDNDData(source) && canDropModel(source, target);
}

/** The library supplies targets from innermost to outermost. */
export function getModelDropTarget(
  source: unknown,
  targets: readonly DropTargetRecord[],
) {
  return targets.find(
    (target) =>
      isModelDNDData(target.data) && canDropModelData(source, target.data),
  );
}

export function isActiveDropTarget({
  source,
  location,
  self,
}: ElementDropTargetEventBasePayload) {
  return (
    getModelDropTarget(source.data, location.current.dropTargets)?.element ===
    self.element
  );
}

export function getDropIndicatorEdge(args: ElementDropTargetEventBasePayload) {
  return isActiveDropTarget(args) ? extractClosestEdge(args.self.data) : null;
}
