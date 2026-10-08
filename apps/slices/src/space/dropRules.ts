import type { AnyModel, AnyModelType, Item, Task } from "./tables";

type DropTask = Pick<Task, "id" | "state" | "projectSectionId">;

export type TaskDropModelData = {
  modelId: string;
  modelType: "task";
  task: DropTask;
  dailyListId?: string;
};

export type DailyEntryDropModelData = {
  modelId: string;
  modelType: "dailyEntry";
  task: DropTask;
  dailyListId: string;
};

export type StashEntryDropModelData = {
  modelId: string;
  modelType: "stashEntry";
  task: DropTask;
  dailyListId?: string;
};

export type TaskTemplateDropModelData = {
  modelId: string;
  modelType: "template";
  projectSectionId: string;
};

export type ProjectDropModelData = {
  modelId: string;
  modelType: "project";
};

export type ProjectSectionDropModelData = {
  modelId: string;
  modelType: "projectSection";
};

export type DailyListDropModelData = {
  modelId: string;
  modelType: "dailyList";
};

export type StashDropModelData = {
  modelId: string;
  modelType: "stash";
};

export type ChecklistItemDropModelData = {
  modelId: string;
  modelType: "checklistItem";
};

export type TaskChecklistDropModelData = {
  modelId: string;
  modelType: "task";
  role: "checklist";
  task: DropTask;
};

export type TaskTemplateChecklistDropModelData = {
  modelId: string;
  modelType: "template";
  role: "checklist";
  projectSectionId: string;
};

/** The facts needed to decide a drop, available from the rendered models. */
export type DropModelData =
  | TaskDropModelData
  | DailyEntryDropModelData
  | StashEntryDropModelData
  | TaskTemplateDropModelData
  | ProjectDropModelData
  | ProjectSectionDropModelData
  | DailyListDropModelData
  | StashDropModelData
  | ChecklistItemDropModelData
  | TaskChecklistDropModelData
  | TaskTemplateChecklistDropModelData;

export function getDropModelData(
  model: Item,
  task?: DropTask,
  dailyListId?: string,
): TaskDropModelData | TaskTemplateDropModelData;
export function getDropModelData(
  model: AnyModel,
  task?: DropTask,
  dailyListId?: string,
): DropModelData | undefined;
export function getDropModelData(
  model: AnyModel,
  task?: DropTask,
  dailyListId?: string,
): DropModelData | undefined {
  if (model.type === "task") {
    return {
      modelId: model.id,
      modelType: model.type,
      task: {
        id: model.id,
        state: model.state,
        projectSectionId: model.projectSectionId,
      },
      dailyListId,
    };
  }
  if (model.type === "dailyEntry") {
    if (!task || task.id !== model.taskId) return undefined;
    return {
      modelId: model.id,
      modelType: model.type,
      task: {
        id: task.id,
        state: task.state,
        projectSectionId: task.projectSectionId,
      },
      dailyListId: model.dailyListId,
    };
  }
  if (model.type === "stashEntry") {
    if (!task || task.id !== model.taskId) return undefined;
    return {
      modelId: model.id,
      modelType: model.type,
      task: {
        id: task.id,
        state: task.state,
        projectSectionId: task.projectSectionId,
      },
      dailyListId,
    };
  }
  if (model.type === "template") {
    return {
      modelId: model.id,
      modelType: model.type,
      projectSectionId: model.projectSectionId,
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
  if (
    "role" in target &&
    target.role === "checklist" &&
    source.modelType !== "checklistItem"
  ) {
    return false;
  }
  if (
    target.modelType === "dailyList" &&
    "task" in source &&
    "dailyListId" in source &&
    source.dailyListId === target.modelId
  ) {
    return false;
  }
  if (target.modelType === "projectSection") {
    const sectionId =
      "task" in source
        ? source.task.projectSectionId
        : source.modelType === "template"
          ? source.projectSectionId
          : undefined;
    if (sectionId === target.modelId) return false;
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
