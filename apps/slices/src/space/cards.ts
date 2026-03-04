import { action, selector } from "@will-be-done/hyperdb";
import type { GenReturn } from "./utils";
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

export const cardsSlice = {
  byId: selector(function* (id: string): GenReturn<CardWrapper | undefined> {
    const tasks = yield* cardsTasksSlice.byId(id);
    if (tasks) return tasks;

    const templates = yield* cardsTaskTemplatesSlice.byId(id);
    if (templates) return templates;

    return undefined;
  }),
  exists: selector(function* (id: string): GenReturn<boolean> {
    return !!(yield* cardsSlice.byId(id));
  }),

  createSiblingCard: action(function* (
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
  }),

  cardWrapperId: selector(function* (
    id: string,
    modelType: CardWrapperType,
  ): GenReturn<CardWrapper | undefined> {
    const slice = appTypeSlicesMap[modelType];
    if (!slice) throw new Error(`Unknown model type: ${modelType}`);

    return (yield* slice.byId(id)) as CardWrapper;
  }),
  cardWrapperIdOrDefault: selector(function* (
    id: string,
    modelType: CardWrapperType,
  ): GenReturn<CardWrapper> {
    const entity = yield* cardsSlice.cardWrapperId(id, modelType);
    if (!entity) {
      return defaultTask;
    }

    return entity;
  }),

  taskOfModel: selector(function* (
    model: AnyModel,
  ): GenReturn<Task | undefined> {
    if (isTaskProjection(model)) {
      return yield* cardsTasksSlice.byId(model.id);
    }

    if (isTask(model)) {
      return model;
    }

    return undefined;
  }),

  deleteByIds: action(function* (ids: string[]): GenReturn<void> {
    yield* cardsTasksSlice.deleteByIds(ids);
    yield* cardsTaskTemplatesSlice.delete(ids);
    yield* dailyListsProjectionsSlice.delete(ids);
  }),
};
