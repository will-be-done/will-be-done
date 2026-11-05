import { insert, selectFrom, upsert, v } from "@will-be-done/hyperdb";
import { generateJitteredKeyBetween } from "fractional-indexing-jittered";
import { uuidv7 } from "uuidv7";
import { action, selector } from "../builders";
import { appDeleteModel, appDropModelData, appHandleDropMany } from "./app";
import {
  dailyEntriesByIds,
  deleteDailyEntriesByTaskIds,
  scheduleTask,
} from "./dailyEntries";
import { canDropModel, getDropModelData } from "./dropRules";
import { projectSectionItems } from "./projectSectionItems";
import { STASH_ID, stashEntriesByIds, stashType } from "./stashEntries";
import {
  checklistItemsTable,
  dailyEntryType,
  isChecklistParentType,
  isNote,
  isTask,
  isTaskTemplate,
  listItemType,
  noteType,
  notesTable,
  possibleModelType,
  stashEntryType,
  tasksTable,
  taskTemplatesTable,
  taskTemplateType,
  taskType,
  type Item,
  type ListItemType,
} from "./tables";
import { tasksByIds, trashTasks } from "./tasks";

// Actions over a user's multi-selection. The refs come in display order, and
// several refs may point at the same item (a task and its daily entry).
const listItemRefs = v.array(
  v.object({ id: v.string(), modelType: listItemType }),
);

// The item behind each ref, aligned with the refs.
export const itemsByListItemRefs = selector({
  name: "itemsByListItemRefs",
  args: { listItems: listItemRefs },
  handler: function* itemsByListItemRefs({ listItems }) {
    const idsOf = (modelType: ListItemType) => [
      ...new Set(
        listItems
          .filter((ref) => ref.modelType === modelType)
          .map((ref) => ref.id),
      ),
    ];
    const dailyEntryIds = idsOf(dailyEntryType);
    const stashEntryIds = idsOf(stashEntryType);
    const templateIds = idsOf(taskTemplateType);
    const noteIds = idsOf(noteType);

    const entries = [
      ...(dailyEntryIds.length > 0
        ? yield* dailyEntriesByIds({ ids: dailyEntryIds })
        : []),
      ...(stashEntryIds.length > 0
        ? yield* stashEntriesByIds({ ids: stashEntryIds })
        : []),
    ];
    const tasks = yield* tasksByIds({
      ids: [...idsOf(taskType), ...entries.map((entry) => entry.taskId)],
    });
    const templates =
      templateIds.length > 0
        ? yield* selectFrom(taskTemplatesTable, "byId").where((q) =>
            templateIds.map((id) => q.eq("id", id)),
          )
        : [];
    const notes =
      noteIds.length > 0
        ? yield* selectFrom(notesTable, "byId").where((q) =>
            noteIds.map((id) => q.eq("id", id)),
          )
        : [];

    const items = new Map<string, Item>(
      [...tasks, ...templates, ...notes].map((item) => [item.id, item]),
    );
    const entryTaskIds = new Map(
      entries.map((entry) => [entry.id, entry.taskId]),
    );
    return listItems.map((ref) => {
      const itemId =
        ref.modelType === dailyEntryType || ref.modelType === stashEntryType
          ? entryTaskIds.get(ref.id)
          : ref.id;
      return itemId === undefined ? undefined : items.get(itemId);
    });
  },
});

export const itemsOfListItems = selector({
  name: "itemsOfListItems",
  args: { listItems: listItemRefs },
  handler: function* itemsOfListItems({ listItems }) {
    const items = new Map<string, Item>();
    for (const item of yield* itemsByListItemRefs({ listItems })) {
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

// Unsaved copies of the items, each ordered right after its original.
function* copiesOf(
  items: Item[],
): Generator<unknown, { original: Item; copy: Item }[], unknown> {
  const nextTokens = new Map<string, string>();
  for (const projectSectionId of new Set(
    items.map((item) => item.projectSectionId),
  )) {
    const sectionItems = yield* projectSectionItems({ projectSectionId });
    for (const item of items) {
      if (item.projectSectionId !== projectSectionId) continue;
      const next = sectionItems.find(
        (sectionItem) => sectionItem.orderToken > item.orderToken,
      );
      if (next) nextTokens.set(item.id, next.orderToken);
    }
  }

  const now = Date.now();
  return items.map((original) => {
    const fields = {
      id: uuidv7(),
      orderToken: generateJitteredKeyBetween(
        original.orderToken,
        nextTokens.get(original.id) ?? null,
      ),
      createdAt: now,
    };
    const copy: Item = isTask(original)
      ? {
          ...original,
          ...fields,
          state: "todo",
          lastToggledAt: now,
          templateId: null,
          templateDate: null,
        }
      : isTaskTemplate(original)
        ? { ...original, ...fields, lastGeneratedAt: now }
        : { ...original, ...fields };
    return { original, copy };
  });
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
    const target = yield* appDropModelData({ id, modelType });
    if (!target) return [];

    const placed = (yield* copiesOf(
      yield* itemsOfListItems({ listItems }),
    )).filter(({ copy }) => canDropModel(getDropModelData(copy), target));
    const copies = placed.map(({ copy }) => copy);
    if (copies.length === 0) return [];

    const tasks = copies.filter(isTask);
    const templates = copies.filter(isTaskTemplate);
    const notes = copies.filter(isNote);
    if (tasks.length > 0) yield* insert(tasksTable, tasks);
    if (templates.length > 0) yield* insert(taskTemplatesTable, templates);
    if (notes.length > 0) yield* insert(notesTable, notes);

    const parents = placed.flatMap(({ original, copy }) =>
      isChecklistParentType(original.type)
        ? [
            {
              parentType: original.type,
              parentId: original.id,
              copyId: copy.id,
            },
          ]
        : [],
    );
    if (parents.length > 0) {
      const copyIds = new Map(
        parents.map((parent) => [parent.parentId, parent.copyId]),
      );
      const checklist = yield* selectFrom(
        checklistItemsTable,
        "byParentOrder",
      ).where((q) =>
        parents.map((parent) =>
          q.eq("parentType", parent.parentType).eq("parentId", parent.parentId),
        ),
      );
      const now = Date.now();
      const checklistCopies = checklist.flatMap((checklistItem) => {
        const parentId = copyIds.get(checklistItem.parentId);
        return parentId
          ? [{ ...checklistItem, id: uuidv7(), parentId, createdAt: now }]
          : [];
      });
      if (checklistCopies.length > 0) {
        yield* insert(checklistItemsTable, checklistCopies);
      }
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
