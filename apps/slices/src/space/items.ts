import { v } from "@will-be-done/hyperdb";
import { action, selector } from "../builders";
import { assertUnreachable } from "./utils";
import { createDailyEntrySibling } from "./dailyEntries";
import { createTaskNextToSectionItem } from "./projectSectionItems";
import { createStashEntrySibling } from "./stashEntries";
import { deleteTasksByIds, taskById, defaultTask } from "./tasks";
import { deleteTemplates, taskTemplateById } from "./taskTemplates";
import { appTypeSlicesMap } from "./maps";
import {
  listItem,
  listItemType,
  possibleModel,
  tasksTable,
  Item,
  ListItem,
  Task,
  isDailyEntry,
  isStashEntry,
  isTask,
  isTaskTemplate,
} from "./tables";

export const itemById = selector({
  name: "itemById",
  args: { id: v.string() },
  handler: function* itemById({ id }) {
    const tasks = yield* taskById({ id });
    if (tasks) return tasks;

    const templates = yield* taskTemplateById({ id });
    if (templates) return templates;

    return undefined as Item | undefined;
  },
});

export const itemExists = selector({
  name: "itemExists",
  args: { id: v.string() },
  handler: function* itemExists({ id }) {
    return !!(yield* itemById({ id }));
  },
});

export const createTaskNextToListItem = action({
  name: "createTaskNextToListItem",
  args: {
    listItem,
    position: v.union(v.literal("before"), v.literal("after")),
    taskParams: v.optional(v.partial(tasksTable.v())),
  },
  handler: function* createTaskNextToListItem({
    listItem,
    position,
    taskParams,
  }) {
    if (isDailyEntry(listItem)) {
      return yield* createDailyEntrySibling({
        taskId: listItem.taskId,
        position,
        taskParams,
      });
    } else if (isStashEntry(listItem)) {
      return yield* createStashEntrySibling({
        taskId: listItem.taskId,
        position,
        taskParams,
      });
    } else if (isTask(listItem) || isTaskTemplate(listItem)) {
      return yield* createTaskNextToSectionItem({
        itemId: listItem.id,
        position,
        taskParams,
      });
    } else {
      assertUnreachable(listItem);
    }
  },
});

export const listItemById = selector({
  name: "listItemById",
  args: {
    id: v.string(),
    modelType: listItemType,
  },
  handler: function* listItemById({ id, modelType }) {
    const slice = appTypeSlicesMap[modelType];
    if (!slice) throw new Error(`Unknown model type: ${modelType}`);

    return (yield* slice.byId(id)) as ListItem;
  },
});

export const listItemByIdOrDefault = selector({
  name: "listItemByIdOrDefault",
  args: {
    id: v.string(),
    modelType: listItemType,
  },
  handler: function* listItemByIdOrDefault({ id, modelType }) {
    const entity = yield* listItemById({
      id,
      modelType,
    });
    if (!entity) {
      return defaultTask as ListItem;
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
    if (isDailyEntry(model)) {
      return yield* taskById({ id: model.taskId });
    }

    if (isStashEntry(model)) {
      return yield* taskById({ id: model.taskId });
    }

    if (isTask(model)) {
      return model as Task;
    }

    return undefined as Task | undefined;
  },
});

export const deleteItemsByIds = action({
  name: "deleteItemsByIds",
  args: { ids: v.array(v.string()) },
  handler: function* deleteItemsByIds({ ids }) {
    yield* deleteTasksByIds({ ids });
    yield* deleteTemplates({ taskTemplateIds: ids });
  },
});
