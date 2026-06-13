import { action, selector } from "@will-be-done/hyperdb-lib";
import { assertUnreachable } from "./utils";
import { cardsTasksSlice } from ".";
import { type Task, defaultTask, isTask } from "./cardsTasks";
import { cardsTaskTemplatesSlice } from ".";
import { type TaskTemplate, isTaskTemplate } from "./cardsTaskTemplates";
import { AnyModel, appTypeSlicesMap } from "./maps";
import { projectCategoryCardsSlice } from ".";
import { dailyListsProjectionsSlice } from ".";
import { isTaskProjection, TaskProjection } from "./dailyListsProjections";
import { isStashProjection, StashProjection } from "./stashProjections";
import { stashProjectionsSlice } from ".";

export type CardWrapper = Task | TaskTemplate | TaskProjection | StashProjection;
export type CardWrapperType = CardWrapper["type"];

export const byId = selector(function* byId(id: string) {
  const tasks = yield* cardsTasksSlice.byId(id);
  if (tasks) return tasks;

  const templates = yield* cardsTaskTemplatesSlice.byId(id);
  if (templates) return templates;

  return undefined as CardWrapper | undefined;
});

export const exists = selector(function* exists(id: string) {
  return !!(yield* byId(id));
});

export const createSiblingCard = action(function* createSiblingCard(
  taskBox: Task | TaskTemplate | TaskProjection | StashProjection,
  position: "before" | "after",
  taskParams?: Partial<Task>,
) {
  if (isTaskProjection(taskBox)) {
    return yield* dailyListsProjectionsSlice.createSibling(
      taskBox.id,
      position,
      taskParams,
    );
  } else if (isStashProjection(taskBox)) {
    return yield* stashProjectionsSlice.createSibling(
      taskBox.id,
      position,
      taskParams,
    );
  } else if (isTask(taskBox) || isTaskTemplate(taskBox)) {
    return yield* projectCategoryCardsSlice.createSiblingTask(
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
    return yield* cardsTasksSlice.byId(model.id);
  }

  if (isStashProjection(model)) {
    return yield* cardsTasksSlice.byId(model.id);
  }

  if (isTask(model)) {
    return model as Task;
  }

  return undefined as Task | undefined;
});

export const deleteByIds = action(function* deleteByIds(ids: string[]) {
  yield* cardsTasksSlice.deleteByIds(ids);
  yield* cardsTaskTemplatesSlice.deleteTemplates(ids);
  yield* dailyListsProjectionsSlice.deleteProjections(ids);
  yield* stashProjectionsSlice.deleteProjections(ids);
});
