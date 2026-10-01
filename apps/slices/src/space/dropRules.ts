import type { AnyModel, AnyModelType, Task } from "./tables";

type TaskDropType = "task" | "dailyEntry" | "stashEntry";

/** The facts needed to decide a drop, available from the rendered models. */
export type DropModelData = {
  modelId: string;
  role?: "checklist";
} & (
  | { modelType: TaskDropType; task: Pick<Task, "id" | "state"> }
  | { modelType: Exclude<AnyModelType, TaskDropType> }
);

export function getDropModelData(
  model: AnyModel,
  task?: Pick<Task, "id" | "state">,
): DropModelData | undefined {
  if (model.type === "task") {
    return {
      modelId: model.id,
      modelType: model.type,
      task: { id: model.id, state: model.state },
    };
  }
  if (model.type === "dailyEntry" || model.type === "stashEntry") {
    if (!task || task.id !== model.taskId) return undefined;
    return {
      modelId: model.id,
      modelType: model.type,
      task: { id: task.id, state: task.state },
    };
  }
  return { modelId: model.id, modelType: model.type };
}

export function shouldMoveOutOfStash(
  targetModelType: AnyModelType,
  sourceModelType: AnyModelType,
) {
  return (
    sourceModelType === "stashEntry" &&
    targetModelType !== "stashEntry" &&
    targetModelType !== "stash"
  );
}

/** Shared by synchronous drag feedback and transactional drop validation. */
export function canDropModel(
  source: DropModelData,
  target: DropModelData,
): boolean {
  if (
    source.modelId === target.modelId &&
    source.modelType === target.modelType
  ) {
    return false;
  }
  if (
    "task" in source &&
    "task" in target &&
    source.task.id === target.task.id
  ) {
    return false;
  }
  if (target.role === "checklist" && source.modelType !== "checklistItem") {
    return false;
  }

  // Leaving the stash moves the underlying task, then removes its stash entry.
  const dropped =
    source.modelType === "stashEntry" &&
    shouldMoveOutOfStash(target.modelType, source.modelType)
      ? { ...source, modelId: source.task.id, modelType: "task" as const }
      : source;
  const isTodoTask =
    (dropped.modelType === "task" ||
      dropped.modelType === "dailyEntry" ||
      dropped.modelType === "stashEntry") &&
    dropped.task.state === "todo";

  switch (target.modelType) {
    case "task":
      return (
        target.task.state === "todo" &&
        (isTodoTask ||
          dropped.modelType === "template" ||
          dropped.modelType === "checklistItem")
      );
    case "template":
      return (
        isTodoTask ||
        dropped.modelType === "template" ||
        dropped.modelType === "checklistItem"
      );
    case "dailyEntry":
    case "stashEntry":
      return target.task.state === "todo" && isTodoTask;
    case "dailyList":
    case "stash":
      return isTodoTask;
    case "project":
    case "projectSection":
      return (
        dropped.modelType === "task" ||
        dropped.modelType === "template" ||
        (dropped.modelType === "dailyEntry" && isTodoTask) ||
        (target.modelType === "project" && dropped.modelType === "project")
      );
    case "checklistItem":
      return dropped.modelType === "checklistItem";
  }
}
