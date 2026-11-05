import { insert, upsert, v } from "@will-be-done/hyperdb";
import { uuidv7 } from "uuidv7";
import { action, selector } from "../builders";
import { appDeleteModel, appHandleDropMany } from "./app";
import { checklistItemChildren } from "./checklistItems";
import { deleteDailyEntriesByTaskIds, scheduleTask } from "./dailyEntries";
import { itemByListItemId } from "./items";
import { projectSectionItemSiblings } from "./projectSectionItems";
import { STASH_ID, stashType } from "./stashEntries";
import {
  checklistItemsTable,
  isChecklistParentType,
  isTask,
  isTaskTemplate,
  listItemType,
  notesTable,
  possibleModelType,
  tasksTable,
  taskTemplatesTable,
  type Item,
} from "./tables";
import { trashTasks } from "./tasks";
import { generateKeyPositionedBetween } from "./utils";

// Actions over a user's multi-selection. The refs come in display order, and
// several refs may point at the same item (a task and its daily entry).
const listItemRefs = v.array(
  v.object({ id: v.string(), modelType: listItemType }),
);

export const itemsOfListItems = selector({
  name: "itemsOfListItems",
  args: { listItems: listItemRefs },
  handler: function* itemsOfListItems({ listItems }) {
    const items = new Map<string, Item>();
    for (const ref of listItems) {
      const item = yield* itemByListItemId(ref);
      if (item && !items.has(item.id)) items.set(item.id, item);
    }
    return [...items.values()];
  },
});

export const setListItemsTaskState = action({
  name: "setListItemsTaskState",
  args: {
    listItems: listItemRefs,
    state: v.union(v.literal("todo"), v.literal("done")),
  },
  handler: function* setListItemsTaskState({ listItems, state }) {
    const tasks = (yield* itemsOfListItems({ listItems })).filter(isTask);
    const lastToggledAt = Date.now();
    const changed = tasks
      .filter((task) => task.state !== state)
      .map((task) => ({ ...task, state, lastToggledAt }));
    if (changed.length > 0) yield* upsert(tasksTable, changed);
  },
});

export const setListItemsNature = action({
  name: "setListItemsNature",
  args: {
    listItems: listItemRefs,
    nature: v.union(v.literal("red"), v.literal("green"), v.literal("unknown")),
  },
  handler: function* setListItemsNature({ listItems, nature }) {
    const items = yield* itemsOfListItems({ listItems });
    const tasks = items.filter(isTask);
    const templates = items.filter(isTaskTemplate);
    if (tasks.length > 0) {
      yield* upsert(
        tasksTable,
        tasks.map((task) => ({ ...task, nature })),
      );
    }
    if (templates.length > 0) {
      yield* upsert(
        taskTemplatesTable,
        templates.map((template) => ({ ...template, nature })),
      );
    }
  },
});

export const deleteListItems = action({
  name: "deleteListItems",
  args: { listItems: listItemRefs },
  handler: function* deleteListItems({ listItems }) {
    for (const ref of listItems) {
      yield* appDeleteModel(ref);
    }
  },
});

export const trashListItemTasks = action({
  name: "trashListItemTasks",
  args: { listItems: listItemRefs },
  handler: function* trashListItemTasks({ listItems }) {
    const tasks = (yield* itemsOfListItems({ listItems })).filter(isTask);
    if (tasks.length > 0) {
      yield* trashTasks({ ids: tasks.map((task) => task.id) });
    }
  },
});

export const scheduleListItems = action({
  name: "scheduleListItems",
  args: { listItems: listItemRefs, date: v.string() },
  handler: function* scheduleListItems({ listItems, date }) {
    for (const task of (yield* itemsOfListItems({ listItems })).filter(
      isTask,
    )) {
      yield* scheduleTask({ taskId: task.id, date, position: "append" });
    }
  },
});

export const unscheduleListItems = action({
  name: "unscheduleListItems",
  args: { listItems: listItemRefs },
  handler: function* unscheduleListItems({ listItems }) {
    const tasks = (yield* itemsOfListItems({ listItems })).filter(isTask);
    if (tasks.length > 0) {
      yield* deleteDailyEntriesByTaskIds({
        taskIds: tasks.map((task) => task.id),
      });
    }
  },
});

export const stashListItems = action({
  name: "stashListItems",
  args: { listItems: listItemRefs },
  handler: function* stashListItems({ listItems }) {
    yield* appHandleDropMany({
      id: STASH_ID,
      modelType: stashType,
      drops: listItems.filter((ref) => ref.modelType !== "stashEntry"),
      edge: "top",
    });
  },
});

export const moveListItemsToProject = action({
  name: "moveListItemsToProject",
  args: { listItems: listItemRefs, projectId: v.string() },
  handler: function* moveListItemsToProject({ listItems, projectId }) {
    // Move the items themselves so stash and daily entries stay put.
    const items = yield* itemsOfListItems({ listItems });
    yield* appHandleDropMany({
      id: projectId,
      modelType: "project",
      drops: items.map((item) => ({ id: item.id, modelType: item.type })),
      edge: "bottom",
    });
  },
});

// Inserts a copy right after the item in its section, checklist included.
function* duplicateItem(item: Item): Generator<unknown, Item, unknown> {
  const now = Date.now();
  const fields = {
    id: uuidv7(),
    orderToken: generateKeyPositionedBetween(
      item,
      yield* projectSectionItemSiblings({ itemId: item.id }),
      "after",
    ),
    createdAt: now,
  };

  let copy: Item;
  if (isTask(item)) {
    copy = {
      ...item,
      ...fields,
      lastToggledAt: now,
      templateId: null,
      templateDate: null,
    };
    yield* insert(tasksTable, [copy]);
  } else if (isTaskTemplate(item)) {
    copy = { ...item, ...fields, lastGeneratedAt: now };
    yield* insert(taskTemplatesTable, [copy]);
  } else {
    copy = { ...item, ...fields };
    yield* insert(notesTable, [copy]);
  }

  if (isChecklistParentType(item.type)) {
    const checklist = yield* checklistItemChildren({
      parentId: item.id,
      parentType: item.type,
    });
    if (checklist.length > 0) {
      yield* insert(
        checklistItemsTable,
        checklist.map((checklistItem) => ({
          ...checklistItem,
          id: uuidv7(),
          parentId: copy.id,
          createdAt: now,
        })),
      );
    }
  }

  return copy;
}

export const pasteListItemCopies = action({
  name: "pasteListItemCopies",
  args: {
    listItems: listItemRefs,
    id: v.string(),
    modelType: possibleModelType,
    edge: v.union(v.literal("top"), v.literal("bottom")),
  },
  handler: function* pasteListItemCopies({ listItems, id, modelType, edge }) {
    const copies: Item[] = [];
    for (const item of yield* itemsOfListItems({ listItems })) {
      copies.push(yield* duplicateItem(item));
    }
    yield* appHandleDropMany({
      id,
      modelType,
      drops: copies.map((copy) => ({ id: copy.id, modelType: copy.type })),
      edge,
    });
    return copies;
  },
});
