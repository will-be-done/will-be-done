import { action, selector } from "@will-be-done/hyperdb";
import type { GenReturn } from "./utils";
import { assertUnreachable } from "./utils";
import { tasksSlice2, type Task, defaultTask } from "./tasks";
import { projectionsSlice2, type TaskProjection } from "./projections";
import {
  taskTemplatesSlice2,
  type TaskTemplate,
  isTaskTemplate,
} from "./taskTemplates";
import { isTask } from "./tasks";
import { isTaskProjection } from "./projections";
import { projectCategoryCardsSlice2 } from "./projectCategoryCards";
import { AnyModel } from "./maps";

export const cardsSlice = {
  createSiblingCard: action(function* (
    taskBox: Task | TaskProjection | TaskTemplate,
    position: "before" | "after",
    taskParams?: Partial<Task>,
  ) {
    if (isTask(taskBox) || isTaskTemplate(taskBox)) {
      return yield* projectCategoryCardsSlice2.createSiblingTask(
        taskBox.id,
        position,
        taskParams,
      );
    } else if (isTaskProjection(taskBox)) {
      return yield* projectionsSlice2.createSibling(taskBox.id, position);
    } else {
      assertUnreachable(taskBox);
    }
  }),

  cardWrapperId: selector(function* (
    id: string,
  ): GenReturn<Task | TaskTemplate | TaskProjection | undefined> {
    const slices = [tasksSlice2, projectionsSlice2, taskTemplatesSlice2];
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
      return yield* tasksSlice2.byId(model.taskId);
    }
    return undefined;
  }),
};
