import { action, selector } from "@will-be-done/hyperdb";
import type { GenReturn } from "./utils";
import { assertUnreachable } from "./utils";
import { cardsTasksSlice, type Task, defaultTask, isTask } from "./cardsTasks";
import {
  cardsTaskTemplatesSlice,
  type TaskTemplate,
  isTaskTemplate,
} from "./cardsTaskTemplates";
import { AnyModel } from "./maps";
import { projectCategoryCardsSlice } from "./projectsCategoriesCards";

export const cardsSlice = {
  createSiblingCard: action(function* (
    taskBox: Task | TaskTemplate,
    position: "before" | "after",
    taskParams?: Partial<Task>,
  ) {
    if (isTask(taskBox) || isTaskTemplate(taskBox)) {
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
  ): GenReturn<Task | TaskTemplate | undefined> {
    const slices = [
      cardsTasksSlice,
      cardsTaskTemplatesSlice,
    ];
    for (const slice of slices) {
      const res = yield* slice.byId(id);

      if (res) {
        return res;
      }
    }

    return undefined;
  }),
  cardWrapperIdOrDefault: selector(function* (
    id: string,
  ): GenReturn<Task | TaskTemplate> {
    const entity = yield* cardsSlice.cardWrapperId(id);
    if (!entity) {
      return defaultTask;
    }

    return entity;
  }),

  taskOfModel: selector(function* (
    model: AnyModel,
  ): GenReturn<Task | undefined> {
    if (isTask(model)) {
      return model;
    }
    return undefined;
  }),

  deleteByIds: action(function* (ids: string[]): GenReturn<void> {
    yield* cardsTasksSlice.deleteByIds(ids);
    yield* cardsTaskTemplatesSlice.delete(ids);
  }),
};
