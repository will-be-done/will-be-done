import { action, selector } from "@will-be-done/hyperdb";
import type { GenReturn } from "./utils";
import { assertUnreachable } from "./utils";
import { cardsTasksSlice, type Task, defaultTask } from "./cardsTasks";
import {
  dailyListsProjections,
  type TaskProjection,
} from "./dailyListsProjections";
import {
  cardsTaskTemplatesSlice,
  type TaskTemplate,
  isTaskTemplate,
} from "./cardsTaskTemplates";
import { isTask } from "./cardsTasks";
import { isTaskProjection } from "./dailyListsProjections";
import { AnyModel } from "./maps";
import { projectCategoryCardsSlice } from "./projectsCategoriesCards";

export const cardsSlice = {
  createSiblingCard: action(function* (
    taskBox: Task | TaskProjection | TaskTemplate,
    position: "before" | "after",
    taskParams?: Partial<Task>,
  ) {
    if (isTask(taskBox) || isTaskTemplate(taskBox)) {
      return yield* projectCategoryCardsSlice.createSiblingTask(
        taskBox.id,
        position,
        taskParams,
      );
    } else if (isTaskProjection(taskBox)) {
      return yield* dailyListsProjections.createSibling(taskBox.id, position);
    } else {
      assertUnreachable(taskBox);
    }
  }),

  cardWrapperId: selector(function* (
    id: string,
  ): GenReturn<Task | TaskTemplate | TaskProjection | undefined> {
    const slices = [
      cardsTasksSlice,
      dailyListsProjections,
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
  ): GenReturn<Task | TaskTemplate | TaskProjection> {
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
    } else if (isTaskProjection(model)) {
      return yield* cardsTasksSlice.byId(model.taskId);
    }
    return undefined;
  }),
};
