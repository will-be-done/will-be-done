import { selectFrom, v } from "@will-be-done/hyperdb";
import { action, selector } from "../builders";
import { dailyDateFormat, generateKeyPositionedBetween } from "./utils";
import { generateJitteredKeyBetween } from "fractional-indexing-jittered";
import { createTask, taskById, defaultTask } from "./tasks";
import { taskTemplateById } from "./taskTemplates";
import { parse } from "date-fns";
import {
  tasksTable,
  taskTemplatesTable,
  dailyEntriesTable,
  projectSectionsTable,
  projectsTable,
  dailyListsTable,
  checklistItemsTable,
  listItem,
  dailyEntryType,
  stashEntryType,
  isDailyEntry,
  isStashEntry,
  type ListItem,
  type Task,
  type TaskTemplate,
  type Project,
  type ProjectSection,
  type DailyList,
  type DailyEntry,
  Item,
} from "./tables";

export type ItemForDisplay = {
  item: Item;
  section: ProjectSection;
  listItem: ListItem;
  project: Project;
  dailyList: DailyList | undefined;
  dateOfTask: Date | undefined;
  lastScheduleTime: Date | undefined;
  hasChecklist: boolean;
};

// TODO: check if all items renamed to item

export const firstProjectSectionItem = selector({
  name: "firstProjectSectionItem",
  args: { projectSectionId: v.string() },
  handler: function* firstProjectSectionItem({
    projectSectionId,
  }): Generator<unknown, Item, unknown> {
    const ids = yield* projectSectionItemIds({ projectSectionId });
    if (ids.length === 0) return defaultTask;

    return yield* projectSectionItemByIdOrDefault({ id: ids[0] });
  },
});

export const lastProjectSectionItem = selector({
  name: "lastProjectSectionItem",
  args: { projectSectionId: v.string() },
  handler: function* lastProjectSectionItem({
    projectSectionId,
  }): Generator<unknown, Item, unknown> {
    const ids = yield* projectSectionItemIds({ projectSectionId });
    if (ids.length === 0) return defaultTask;

    return yield* projectSectionItemByIdOrDefault({ id: ids[ids.length - 1] });
  },
});

export const projectSectionItems = selector({
  name: "projectSectionItems",
  args: { projectSectionId: v.string() },
  memoization: { selfChild: true },
  handler: function* ({ projectSectionId }) {
    // TODO: make separate table that will maintain list
    // of all items in a project section
    // or you merge sort
    const tasks = yield* selectFrom(
      tasksTable,
      "byProjectSectionIdOrderStates",
    ).where((q) =>
      q.eq("projectSectionId", projectSectionId).eq("state", "todo"),
    );

    const templates = yield* selectFrom(
      taskTemplatesTable,
      "byProjectSectionIdOrderStates",
    ).where((q) => q.eq("projectSectionId", projectSectionId));

    const allItems = [...tasks, ...templates];

    return allItems.sort((a, b) => {
      if (a.orderToken > b.orderToken) {
        return 1;
      }
      if (a.orderToken < b.orderToken) {
        return -1;
      }

      return 0;
    }) as (Task | TaskTemplate)[];
  },
});

export const projectSectionItemsForDisplay = selector({
  name: "projectSectionItemsForDisplay",
  args: {
    items: v.array(v.union(tasksTable.v(), taskTemplatesTable.v())),
    listItems: v.array(listItem),
  },
  handler: function* projectSectionItemsForDisplay({
    items,
    listItems,
  }): Generator<unknown, ItemForDisplay[], unknown> {
    const projectSectionIds = [
      ...new Set(items.map((item) => item.projectSectionId)),
    ];
    const sections = projectSectionIds.length
      ? yield* selectFrom(projectSectionsTable, "byId").where((q) =>
          projectSectionIds.map((id) => q.eq("id", id)),
        )
      : [];
    const sectionMap = new Map(
      (sections as ProjectSection[]).map((section) => [section.id, section]),
    );

    const projectIds = [
      ...new Set((sections as ProjectSection[]).map((c) => c.projectId)),
    ];
    const projects = projectIds.length
      ? yield* selectFrom(projectsTable, "byId").where((q) =>
          projectIds.map((id) => q.eq("id", id)),
        )
      : [];
    const projectMap = new Map(
      (projects as Project[]).map((project) => [project.id, project]),
    );

    const itemIds = items.map((item) => item.id);
    const entries = itemIds.length
      ? yield* selectFrom(dailyEntriesTable, "byTaskId").where((q) =>
          itemIds.map((id) => q.eq("taskId", id)),
        )
      : [];
    const dailyEntryMap = new Map(
      (entries as DailyEntry[]).map((entry) => [entry.taskId, entry]),
    );

    const dailyListIds = [
      ...new Set((entries as DailyEntry[]).map((entry) => entry.dailyListId)),
    ];
    const dailyLists = dailyListIds.length
      ? yield* selectFrom(dailyListsTable, "byId").where((q) =>
          dailyListIds.map((id) => q.eq("id", id)),
        )
      : [];
    const dailyListMap = new Map(
      (dailyLists as DailyList[]).map((dailyList) => [dailyList.id, dailyList]),
    );
    const listItemMap = new Map(
      listItems.map((listItem) => [
        `${listItem.type}:${
          isDailyEntry(listItem) || isStashEntry(listItem)
            ? listItem.taskId
            : listItem.id
        }`,
        listItem,
      ]),
    );

    const checklistItems = items.length
      ? yield* selectFrom(checklistItemsTable, "byParentOrder").where((q) =>
          items.map((item) =>
            q.eq("parentType", item.type).eq("parentId", item.id),
          ),
        )
      : [];
    const hasChecklistMap = new Map(
      checklistItems.map((item) => [
        `${item.parentId}:${item.parentType}`,
        true,
      ]),
    );

    return items
      .map((item) => {
        const section = sectionMap.get(item.projectSectionId);
        if (!section) return;

        const project = projectMap.get(section.projectId);
        if (!project) return;

        const listItem =
          listItemMap.get(`${item.type}:${item.id}`) ||
          listItemMap.get(`${dailyEntryType}:${item.id}`) ||
          listItemMap.get(`${stashEntryType}:${item.id}`);
        if (!listItem) return;

        const entry = dailyEntryMap.get(item.id);
        const dailyList = entry
          ? dailyListMap.get(entry.dailyListId)
          : undefined;
        const dateOfTask = dailyList
          ? parse(dailyList.date, dailyDateFormat, new Date())
          : undefined;

        return {
          item,
          section,
          project,
          listItem,
          dailyList,
          dateOfTask,
          lastScheduleTime: dateOfTask,
          hasChecklist: hasChecklistMap.get(`${item.id}:${item.type}`) ?? false,
        };
      })
      .filter((item) => !!item);
  },
});

export const projectSectionItemsForDisplayChildren = selector({
  name: "projectSectionItemsForDisplayChildren",
  args: { projectSectionId: v.string() },
  handler: function* projectSectionItemsForDisplayChildren({
    projectSectionId,
  }) {
    const items = yield* projectSectionItems({ projectSectionId });
    return yield* projectSectionItemsForDisplay({
      items,
      listItems: items,
    });
  },
});

export const projectSectionItemIds = selector({
  name: "projectSectionItemIds",
  args: { projectSectionId: v.string() },
  handler: function* projectSectionItemIds({ projectSectionId }) {
    return (yield* projectSectionItems({ projectSectionId })).map(
      (item) => item.id,
    );
  },
});

export const doneProjectSectionItemsForDisplay = selector({
  name: "doneProjectSectionItemsForDisplay",
  args: { projectSectionId: v.string(), limited: v.boolean() },
  handler: function* doneProjectSectionItemsForDisplay({
    projectSectionId,
    limited,
  }) {
    const tasks = yield* selectFrom(
      tasksTable,
      "byProjectSectionIdStatesToggledAt",
    )
      .where((q) =>
        q.eq("projectSectionId", projectSectionId).eq("state", "done"),
      )
      // fetch one more, so UI will show "Show more" button and limit to show only 5 items
      .limit(limited ? 6 : 9999)
      .order("desc");

    return yield* projectSectionItemsForDisplay({
      items: tasks,
      listItems: tasks,
    });
  },
});

export const projectSectionItemById = selector({
  name: "projectSectionItemById",
  args: { id: v.string() },
  handler: function* projectSectionItemById({
    id,
  }): Generator<unknown, Item | undefined, unknown> {
    const task = yield* taskById({ id });
    if (task) return task;

    const template = yield* taskTemplateById({ id });
    if (template) return template;

    return undefined;
  },
});

export const projectSectionItemByIdOrDefault = selector({
  name: "projectSectionItemByIdOrDefault",
  args: { id: v.string() },
  handler: function* projectSectionItemByIdOrDefault({
    id,
  }): Generator<unknown, Item, unknown> {
    return (yield* projectSectionItemById({ id })) || defaultTask;
  },
});

export const projectSectionItemSiblings = selector({
  name: "projectSectionItemSiblings",
  args: { itemId: v.string() },
  handler: function* projectSectionItemSiblings({
    itemId,
  }): Generator<unknown, [Item | undefined, Item | undefined], unknown> {
    const item = yield* projectSectionItemByIdOrDefault({ id: itemId });
    if (!item) return [undefined, undefined];

    const ids = yield* projectSectionItemIds({
      projectSectionId: item.projectSectionId,
    });
    const index = ids.findIndex((id) => id === itemId);

    const beforeId = index > 0 ? ids[index - 1] : undefined;
    const afterId = index < ids.length - 1 ? ids[index + 1] : undefined;

    const before = beforeId
      ? yield* projectSectionItemByIdOrDefault({ id: beforeId })
      : undefined;
    const after = afterId
      ? yield* projectSectionItemByIdOrDefault({ id: afterId })
      : undefined;

    return [before, after];
  },
});

export const createTaskNextToSectionItem = action({
  name: "createTaskNextToSectionItem",
  args: {
    itemId: v.string(),
    position: v.union(v.literal("before"), v.literal("after")),
    taskParams: v.optional(v.partial(tasksTable.v())),
  },
  handler: function* createTaskNextToSectionItem({
    itemId,
    position,
    taskParams,
  }) {
    const item = yield* projectSectionItemById({ id: itemId });
    if (!item) throw new Error("Item not found");

    return yield* createTask({
      task: {
        ...taskParams,
        projectSectionId: item.projectSectionId,
        orderToken: generateKeyPositionedBetween(
          item,
          yield* projectSectionItemSiblings({ itemId }),
          position,
        ),
      },
    });
  },
});

export const createTaskAfterSectionItem = action({
  name: "createTaskAfterSectionItem",
  args: {
    itemId: v.string(),
    taskParams: v.optional(v.partial(tasksTable.v())),
  },
  handler: function* createTaskAfterSectionItem({ itemId, taskParams }) {
    const item = yield* projectSectionItemById({ id: itemId });
    if (!item) throw new Error("Item not found");

    const [, after] = yield* projectSectionItemSiblings({ itemId });
    const orderToken = generateJitteredKeyBetween(
      item.orderToken,
      after?.orderToken || null,
    );

    return yield* createTask({
      task: {
        ...taskParams,
        projectSectionId: item.projectSectionId,
        orderToken,
      },
    });
  },
});
