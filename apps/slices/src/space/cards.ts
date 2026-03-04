import { action, selector } from "@will-be-done/hyperdb";
import { assertUnreachable } from "./utils";
import { cardsTasksSlice, type Task, defaultTask, isTask } from "./cardsTasks";
import {
  cardsTaskTemplatesSlice,
  type TaskTemplate,
  isTaskTemplate,
} from "./cardsTaskTemplates";
import { AnyModel, appTypeSlicesMap } from "./maps";
import { projectCategoryCardsSlice } from "./projectsCategoriesCards";
import {
  dailyListsProjectionsSlice,
  isTaskProjection,
  TaskProjection,
} from "./dailyListsProjections";

export type CardWrapper = Task | TaskTemplate | TaskProjection;
export type CardWrapperType = CardWrapper["type"];

const byId = selector(function* (id: string) {
  const tasks = yield* cardsTasksSlice.byId(id);
  if (tasks) return tasks;

  const templates = yield* cardsTaskTemplatesSlice.byId(id);
  if (templates) return templates;

  return undefined as CardWrapper | undefined;
});

const exists = selector(function* (id: string) {
  return !!(yield* byId(id));
});

const createSiblingCard = action(function* (
  taskBox: Task | TaskTemplate | TaskProjection,
  position: "before" | "after",
  taskParams?: Partial<Task>,
) {
  if (isTaskProjection(taskBox)) {
    return yield* dailyListsProjectionsSlice.createSibling(
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

const cardWrapperId = selector(function* (
  id: string,
  modelType: CardWrapperType,
) {
  const slice = appTypeSlicesMap[modelType];
  if (!slice) throw new Error(`Unknown model type: ${modelType}`);

  return (yield* slice.byId(id)) as CardWrapper;
});

const cardWrapperIdOrDefault = selector(function* (
  id: string,
  modelType: CardWrapperType,
) {
  const entity = yield* cardWrapperId(id, modelType);
  if (!entity) {
    return defaultTask as CardWrapper;
  }

  return entity;
});

const taskOfModel = selector(function* (model: AnyModel) {
  if (isTaskProjection(model)) {
    return yield* cardsTasksSlice.byId(model.id);
  }

  if (isTask(model)) {
    return model as Task;
  }

  return undefined as Task | undefined;
});

const deleteByIds = action(function* (ids: string[]) {
  yield* cardsTasksSlice.deleteByIds(ids);
  yield* cardsTaskTemplatesSlice.delete(ids);
  yield* dailyListsProjectionsSlice.delete(ids);
});

export const cardsSlice = {
  byId,
  exists,
  createSiblingCard,
  cardWrapperId,
  cardWrapperIdOrDefault,
  taskOfModel,
  deleteByIds,
};
