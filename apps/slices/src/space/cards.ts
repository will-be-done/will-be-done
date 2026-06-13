import { action, selector } from "@will-be-done/hyperdb-lib";
import { assertUnreachable } from "./utils";
import {
  createDailyProjectionSibling,
  deleteDailyProjections,
} from "./dailyListsProjections";
import { createSiblingTask } from "./projectsCategoriesCards";
import {
  createStashProjectionSibling,
  deleteStashProjections,
} from "./stashProjections";
import { deleteTasksByIds, taskById, type Task, defaultTask, isTask } from "./cardsTasks";
import { deleteTemplates, taskTemplateById } from "./cardsTaskTemplates";

import { type TaskTemplate, isTaskTemplate } from "./cardsTaskTemplates";
import { AnyModel, appTypeSlicesMap } from "./maps";


import { isTaskProjection, TaskProjection } from "./dailyListsProjections";
import { isStashProjection, StashProjection } from "./stashProjections";


export type CardWrapper = Task | TaskTemplate | TaskProjection | StashProjection;
export type CardWrapperType = CardWrapper["type"];

export const cardById = selector(function* cardById(id: string) {
  const tasks = yield* taskById(id);
  if (tasks) return tasks;

  const templates = yield* taskTemplateById(id);
  if (templates) return templates;

  return undefined as CardWrapper | undefined;
});

export const cardExists = selector(function* cardExists(id: string) {
  return !!(yield* cardById(id));
});

export const createSiblingCard = action(function* createSiblingCard(
  taskBox: Task | TaskTemplate | TaskProjection | StashProjection,
  position: "before" | "after",
  taskParams?: Partial<Task>,
) {
  if (isTaskProjection(taskBox)) {
    return yield* createDailyProjectionSibling(
      taskBox.id,
      position,
      taskParams,
    );
  } else if (isStashProjection(taskBox)) {
    return yield* createStashProjectionSibling(
      taskBox.id,
      position,
      taskParams,
    );
  } else if (isTask(taskBox) || isTaskTemplate(taskBox)) {
    return yield* createSiblingTask(
      taskBox.id,
      position,
      taskParams,
    );
  } else {
    assertUnreachable(taskBox);
  }
});

export const cardWrapperId = selector(function* cardWrapperId(
  id: string,
  modelType: CardWrapperType,
) {
  const slice = appTypeSlicesMap[modelType];
  if (!slice) throw new Error(`Unknown model type: ${modelType}`);

  return (yield* slice.byId(id)) as CardWrapper;
});

export const cardWrapperIdOrDefault = selector(function* cardWrapperIdOrDefault(
  id: string,
  modelType: CardWrapperType,
) {
  const entity = yield* cardWrapperId(id, modelType);
  if (!entity) {
    return defaultTask as CardWrapper;
  }

  return entity;
});

export const taskOfModel = selector(function* taskOfModel(model: AnyModel) {
  if (isTaskProjection(model)) {
    return yield* taskById(model.id);
  }

  if (isStashProjection(model)) {
    return yield* taskById(model.id);
  }

  if (isTask(model)) {
    return model as Task;
  }

  return undefined as Task | undefined;
});

export const deleteCardsByIds = action(function* deleteCardsByIds(ids: string[]) {
  yield* deleteTasksByIds(ids);
  yield* deleteTemplates(ids);
  yield* deleteDailyProjections(ids);
  yield* deleteStashProjections(ids);
});
