import { v } from "@will-be-done/hyperdb";
import { action, selector } from "../builders";
import { assertUnreachable } from "./utils";
import {
  createDailyProjectionSibling,
  deleteDailyProjections,
} from "./dailyListsProjections";
import { createSiblingTask } from "./projectSectionCards";
import {
  createStashProjectionSibling,
  deleteStashProjections,
} from "./stashProjections";
import { deleteTasksByIds, taskById, defaultTask } from "./cardsTasks";
import { deleteTemplates, taskTemplateById } from "./cardsTaskTemplates";
import { appTypeSlicesMap } from "./maps";
import {
  tasksTable,
  taskTemplatesTable,
  taskProjectionsTable,
  stashProjectionsTable,
  cardWrapperType,
  possibleModel,
  CardWrapper,
  Task,
  isTaskProjection,
  isStashProjection,
  isTask,
  isTaskTemplate,
} from "./tables";

export const cardById = selector({
  name: "cardById",
  args: { id: v.string() },
  handler: function* cardById({ id }) {
    const tasks = yield* taskById({ id });
    if (tasks) return tasks;

    const templates = yield* taskTemplateById({ id });
    if (templates) return templates;

    return undefined as CardWrapper | undefined;
  },
});

export const cardExists = selector({
  name: "cardExists",
  args: { id: v.string() },
  handler: function* cardExists({ id }) {
    return !!(yield* cardById({ id }));
  },
});

export const createSiblingCard = action({
  name: "createSiblingCard",
  args: {
    taskBox: v.union(
      tasksTable.v(),
      taskTemplatesTable.v(),
      taskProjectionsTable.v(),
      stashProjectionsTable.v(),
    ),
    position: v.union(v.literal("before"), v.literal("after")),
    taskParams: v.optional(v.partial(tasksTable.v())),
  },
  handler: function* createSiblingCard({ taskBox, position, taskParams }) {
    if (isTaskProjection(taskBox)) {
      return yield* createDailyProjectionSibling({
        taskId: taskBox.id,
        position,
        taskParams,
      });
    } else if (isStashProjection(taskBox)) {
      return yield* createStashProjectionSibling({
        taskId: taskBox.id,
        position,
        taskParams,
      });
    } else if (isTask(taskBox) || isTaskTemplate(taskBox)) {
      return yield* createSiblingTask({
        cardId: taskBox.id,
        position,
        taskParams,
      });
    } else {
      assertUnreachable(taskBox);
    }
  },
});

export const cardWrapperId = selector({
  name: "cardWrapperId",
  args: {
    id: v.string(),
    modelType: cardWrapperType,
  },
  handler: function* cardWrapperId({ id, modelType }) {
    const slice = appTypeSlicesMap[modelType];
    if (!slice) throw new Error(`Unknown model type: ${modelType}`);

    return (yield* slice.byId(id)) as CardWrapper;
  },
});

export const cardWrapperIdOrDefault = selector({
  name: "cardWrapperIdOrDefault",
  args: {
    id: v.string(),
    modelType: cardWrapperType,
  },
  handler: function* cardWrapperIdOrDefault({ id, modelType }) {
    const entity = yield* cardWrapperId({
      id,
      modelType,
    });
    if (!entity) {
      return defaultTask as CardWrapper;
    }

    return entity;
  },
});

export const taskOfModel = selector({
  name: "taskOfModel",
  args: {
    model: possibleModel,
  },
  handler: function* taskOfModel({ model }) {
    if (isTaskProjection(model)) {
      return yield* taskById({ id: model.id });
    }

    if (isStashProjection(model)) {
      return yield* taskById({ id: model.id });
    }

    if (isTask(model)) {
      return model as Task;
    }

    return undefined as Task | undefined;
  },
});

export const deleteCardsByIds = action({
  name: "deleteCardsByIds",
  args: { ids: v.array(v.string()) },
  handler: function* deleteCardsByIds({ ids }) {
    yield* deleteTasksByIds({ ids });
    yield* deleteTemplates({ taskTemplateIds: ids });
    yield* deleteDailyProjections({ ids });
    yield* deleteStashProjections({ ids });
  },
});
