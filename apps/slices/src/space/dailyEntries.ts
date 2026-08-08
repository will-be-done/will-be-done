import { shouldNeverHappen } from "../utils";
import {
  deleteRows,
  insert,
  selectFrom,
  upsert as upsertRows,
  v,
} from "@will-be-done/hyperdb";
import { action, selector } from "../builders";
import { generateJitteredKeyBetween } from "fractional-indexing-jittered";
import {
  dailyDateFormat,
  generateKeyPositionedBetween,
  normalizeOrderPosition,
  type OrderableItem,
  orderPositionArg,
} from "./utils";
import { registerModelSlice } from "./maps";
import { appById } from "./app";
import { dailyListById, createDailyListIfNotPresent } from "./dailyLists";
import {
  createTaskNextToSectionItem,
  projectSectionItemsForDisplay,
  type ItemForDisplay,
} from "./projectSectionItems";
import { deleteStashEntries } from "./stashEntries";
import { taskById } from "./tasks";
import { parse } from "date-fns";
import { uuidv7 } from "uuidv7";
import {
  dailyEntryType,
  dailyEntriesTable,
  tasksTable,
  Task,
  isTask,
  possibleModelType,
  DailyEntry,
  isDailyEntry,
  isStashEntry,
} from "./tables";

export const defaultDailyEntry: DailyEntry = {
  type: dailyEntryType,
  id: "default-entry-id",
  taskId: "default-task-id",
  orderToken: "",
  dailyListId: "",
  createdAt: 0,
};

export const dailyEntryAllIds = selector({
  name: "dailyEntryAllIds",
  args: {},
  handler: function* dailyEntryAllIds() {
    const entries = yield* selectFrom(dailyEntriesTable, "byIds").where(
      (q) => q,
    );
    return entries.map((p) => p.id);
  },
});

export const dailyEntryById = selector({
  name: "dailyEntryById",
  args: { id: v.string() },
  handler: function* dailyEntryById({ id }) {
    const entries = yield* selectFrom(dailyEntriesTable, "byId")
      .where((q) => q.eq("id", id))
      .limit(1);
    return entries[0] as DailyEntry | undefined;
  },
});

export const dailyEntriesByIds = selector({
  name: "dailyEntriesByIds",
  args: { ids: v.array(v.string()) },
  handler: function* dailyEntriesByIds({ ids }) {
    const entries = yield* selectFrom(dailyEntriesTable, "byId").where((q) =>
      ids.map((id) => q.eq("id", id)),
    );
    return entries as DailyEntry[];
  },
});

export const dailyEntriesByTaskIds = selector({
  name: "dailyEntriesByTaskIds",
  args: { taskIds: v.array(v.string()) },
  handler: function* dailyEntriesByTaskIds({ taskIds }) {
    if (taskIds.length === 0) return [];
    return (yield* selectFrom(dailyEntriesTable, "byTaskId").where((q) =>
      taskIds.map((taskId) => q.eq("taskId", taskId)),
    )) as DailyEntry[];
  },
});

export const dailyEntryByIdOrDefault = selector({
  name: "dailyEntryByIdOrDefault",
  args: { id: v.string() },
  handler: function* dailyEntryByIdOrDefault({ id }) {
    return (yield* dailyEntryById({ id })) || defaultDailyEntry;
  },
});

export const dailyEntryByTaskId = selector({
  name: "dailyEntryByTaskId",
  args: { taskId: v.string() },
  handler: function* dailyEntryByTaskId({ taskId }) {
    return (yield* selectFrom(dailyEntriesTable, "byTaskId")
      .where((q) => q.eq("taskId", taskId))
      .first()) as DailyEntry | undefined;
  },
});

export const dailyListHasEntry = selector({
  name: "dailyListHasEntry",
  args: { taskId: v.string() },
  handler: function* dailyListHasEntry({ taskId }) {
    const entry = yield* dailyEntryByTaskId({ taskId });
    return entry !== undefined;
  },
});

export const dailyEntriesByDailyListId = selector({
  name: "dailyEntriesByDailyListId",
  args: { dailyListId: v.string() },
  handler: function* dailyEntriesByDailyListId({ dailyListId }) {
    return (yield* selectFrom(
      dailyEntriesTable,
      "byDailyListIdTokenOrdered",
    ).where((q) => q.eq("dailyListId", dailyListId))) as DailyEntry[];
  },
});

export const dailyEntriesByDailyListIds = selector({
  name: "dailyEntriesByDailyListIds",
  args: { dailyListIds: v.array(v.string()) },
  handler: function* dailyEntriesByDailyListIds({ dailyListIds }) {
    if (dailyListIds.length === 0) return [];

    return (yield* selectFrom(
      dailyEntriesTable,
      "byDailyListIdTokenOrdered",
    ).where((q) =>
      dailyListIds.map((dailyListId) => q.eq("dailyListId", dailyListId)),
    )) as DailyEntry[];
  },
});

export const dailyListTasksByState = selector({
  name: "dailyListTasksByState",
  args: {
    dailyListId: v.string(),
    state: v.union(v.literal("todo"), v.literal("done")),
  },
  handler: function* dailyListTasksByState({ dailyListId, state }) {
    const entries = yield* dailyEntriesByDailyListId({ dailyListId });
    if (entries.length === 0) return [] as Task[];

    const tasks = (yield* selectFrom(tasksTable, "byId").where((q) =>
      entries.map((entry) => q.eq("id", entry.taskId)),
    )) as Task[];
    const matchingTasks = tasks.filter((task) => task.state === state);

    if (state === "done") {
      return matchingTasks.sort((a, b) => b.lastToggledAt - a.lastToggledAt);
    }

    const taskById = new Map(matchingTasks.map((task) => [task.id, task]));
    return entries
      .map((entry) => taskById.get(entry.taskId))
      .filter((task): task is Task => task !== undefined);
  },
});

export const dailyEntryChildrenIds = selector({
  name: "dailyEntryChildrenIds",
  args: { dailyListId: v.string() },
  handler: function* dailyEntryChildrenIds({
    dailyListId,
  }): Generator<unknown, string[], unknown> {
    const entries = yield* dailyEntriesByDailyListId({ dailyListId });

    const result: string[] = [];
    for (const entry of entries) {
      const task = yield* taskById({ id: entry.taskId });
      if (task && task.state === "todo") {
        result.push(entry.taskId);
      }
    }

    return result;
  },
});

export const dailyEntryChildrenForDisplay = selector({
  name: "dailyEntryChildrenForDisplay",
  args: { dailyListId: v.string() },
  handler: function* dailyEntryChildrenForDisplay({
    dailyListId,
  }): Generator<unknown, ItemForDisplay[], unknown> {
    const entries = yield* dailyEntriesByDailyListId({ dailyListId });
    const taskIds = entries.map((entry) => entry.taskId);
    const tasks = taskIds.length
      ? yield* selectFrom(tasksTable, "byId").where((q) =>
          taskIds.map((id) => q.eq("id", id)),
        )
      : [];
    const taskMap = new Map((tasks as Task[]).map((task) => [task.id, task]));

    const items: Task[] = [];
    const listItems: DailyEntry[] = [];
    for (const entry of entries) {
      const task = taskMap.get(entry.taskId);
      if (task && task.state === "todo") {
        items.push(task);
        listItems.push(entry);
      }
    }

    return yield* projectSectionItemsForDisplay({ items, listItems });
  },
});

export const dailyEntryDateOfTask = selector({
  name: "dailyEntryDateOfTask",
  args: { taskId: v.string() },
  handler: function* dailyEntryDateOfTask({
    taskId,
  }): Generator<unknown, Date | undefined, unknown> {
    const entry = yield* dailyEntryByTaskId({ taskId });
    if (!entry) return undefined as Date | undefined;

    const list = yield* dailyListById({ id: entry.dailyListId });
    if (!list) return undefined as Date | undefined;

    return parse(list.date, dailyDateFormat, new Date());
  },
});

export const doneDailyEntryChildrenIds = selector({
  name: "doneDailyEntryChildrenIds",
  args: { dailyListId: v.string() },
  handler: function* doneDailyEntryChildrenIds({
    dailyListId,
  }): Generator<unknown, string[], unknown> {
    const entries = yield* dailyEntriesByDailyListId({ dailyListId });

    const doneTasks: { id: string; lastToggledAt: number }[] = [];
    for (const entry of entries) {
      const task = yield* taskById({ id: entry.taskId });
      if (task && task.state === "done") {
        doneTasks.push({ id: entry.taskId, lastToggledAt: task.lastToggledAt });
      }
    }

    return doneTasks
      .sort((a, b) => b.lastToggledAt - a.lastToggledAt)
      .map((t) => t.id);
  },
});

export const doneDailyEntryChildrenForDisplay = selector({
  name: "doneDailyEntryChildrenForDisplay",
  args: { dailyListId: v.string() },
  handler: function* doneDailyEntryChildrenForDisplay({
    dailyListId,
  }): Generator<unknown, ItemForDisplay[], unknown> {
    const entries = yield* dailyEntriesByDailyListId({ dailyListId });
    const taskIds = entries.map((entry) => entry.taskId);
    const tasks = taskIds.length
      ? yield* selectFrom(tasksTable, "byId").where((q) =>
          taskIds.map((id) => q.eq("id", id)),
        )
      : [];
    const taskMap = new Map((tasks as Task[]).map((task) => [task.id, task]));

    const itemsWithEntries: { item: Task; listItem: DailyEntry }[] = [];
    for (const entry of entries) {
      const task = taskMap.get(entry.taskId);
      if (task && task.state === "done") {
        itemsWithEntries.push({ item: task, listItem: entry });
      }
    }

    itemsWithEntries.sort(
      (a, b) => b.item.lastToggledAt - a.item.lastToggledAt,
    );

    return yield* projectSectionItemsForDisplay({
      items: itemsWithEntries.map(({ item }) => item),
      listItems: itemsWithEntries.map(({ listItem }) => listItem),
    });
  },
});

export const firstDailyEntryChild = selector({
  name: "firstDailyEntryChild",
  args: { dailyListId: v.string() },
  handler: function* firstDailyEntryChild({
    dailyListId,
  }): Generator<unknown, Task | undefined, unknown> {
    const ids = yield* dailyEntryChildrenIds({ dailyListId });
    const firstChildId = ids[0];
    return firstChildId
      ? yield* taskById({ id: firstChildId })
      : (undefined as Task | undefined);
  },
});

export const lastDailyEntryChild = selector({
  name: "lastDailyEntryChild",
  args: { dailyListId: v.string() },
  handler: function* lastDailyEntryChild({
    dailyListId,
  }): Generator<unknown, Task | undefined, unknown> {
    const ids = yield* dailyEntryChildrenIds({ dailyListId });
    const lastChildId = ids[ids.length - 1];
    return lastChildId
      ? yield* taskById({ id: lastChildId })
      : (undefined as Task | undefined);
  },
});

export const dailyEntrySiblings = selector({
  name: "dailyEntrySiblings",
  args: { taskId: v.string() },
  handler: function* dailyEntrySiblings({ taskId }) {
    const entry = yield* dailyEntryByTaskId({ taskId });
    if (!entry)
      return [undefined, undefined] as [
        DailyEntry | undefined,
        DailyEntry | undefined,
      ];

    const sortedEntries = yield* dailyEntriesByDailyListId({
      dailyListId: entry.dailyListId,
    });

    const index = sortedEntries.findIndex((p) => p.id === entry.id);
    if (index === -1) {
      return [undefined, undefined] as [
        DailyEntry | undefined,
        DailyEntry | undefined,
      ];
    }

    const before = index > 0 ? sortedEntries[index - 1] : undefined;
    const after =
      index < sortedEntries.length - 1 ? sortedEntries[index + 1] : undefined;

    return [before, after] as [DailyEntry | undefined, DailyEntry | undefined];
  },
});

export const dailyEntryCanDrop = selector({
  name: "dailyEntryCanDrop",
  args: {
    entryId: v.string(),
    dropId: v.string(),
    dropModelType: possibleModelType,
  },
  handler: function* dailyEntryCanDrop({
    entryId,
    dropId,
    dropModelType,
  }): Generator<unknown, boolean, unknown> {
    const model = yield* appById({ id: dropId, modelType: dropModelType });
    if (!model) return false;

    const entry = yield* dailyEntryById({ id: entryId });
    if (!entry) return false;

    const task = yield* taskById({ id: entry.taskId });
    if (!task) return false;

    if (task.state === "done") return false;

    if (isTask(model)) {
      return model.state === "todo";
    }

    if (isDailyEntry(model)) {
      const droppedTask = yield* taskById({ id: model.taskId });
      return droppedTask !== undefined && droppedTask.state === "todo";
    }

    if (isStashEntry(model)) {
      const droppedTask = yield* taskById({ id: model.taskId });
      return droppedTask !== undefined && droppedTask.state === "todo";
    }

    return false;
  },
});

export const dailyEntryHandleDrop = action({
  name: "dailyEntryHandleDrop",
  args: {
    entryId: v.string(),
    dropId: v.string(),
    dropModelType: possibleModelType,
    edge: v.union(v.literal("top"), v.literal("bottom")),
  },
  handler: function* dailyEntryHandleDrop({
    entryId,
    dropId,
    dropModelType,
    edge,
  }): Generator<unknown, void, unknown> {
    const canDropResult = yield* dailyEntryCanDrop({
      entryId,
      dropId,
      dropModelType,
    });
    if (!canDropResult) return;

    const entry = yield* dailyEntryById({ id: entryId });
    if (!entry) return;

    const dropItem = yield* appById({ id: dropId, modelType: dropModelType });
    if (!dropItem) return;

    const [up, down] = yield* dailyEntrySiblings({
      taskId: entry.taskId,
    });

    let between: [string | undefined, string | undefined] = [
      entry.orderToken,
      down?.orderToken,
    ];

    if (edge === "top") {
      between = [up?.orderToken, entry.orderToken];
    }

    const orderToken = generateJitteredKeyBetween(
      between[0] || null,
      between[1] || null,
    );

    if (isTask(dropItem) || isDailyEntry(dropItem)) {
      yield* upsertDailyEntry({
        entry: {
          taskId: isTask(dropItem) ? dropItem.id : dropItem.taskId,
          dailyListId: entry.dailyListId,
          orderToken,
        },
      });
    } else if (isStashEntry(dropItem)) {
      yield* upsertDailyEntry({
        entry: {
          taskId: dropItem.taskId,
          dailyListId: entry.dailyListId,
          orderToken,
        },
      });
      yield* deleteStashEntries({ ids: [dropItem.id] });
    } else {
      shouldNeverHappen("unknown drop item type", dropItem);
    }
  },
});

export const deleteDailyEntries = action({
  name: "deleteDailyEntries",
  args: { ids: v.array(v.string()) },
  handler: function* deleteDailyEntries({ ids }) {
    yield* deleteRows(dailyEntriesTable, ids);
  },
});

export const deleteDailyEntriesByTaskIds = action({
  name: "deleteDailyEntriesByTaskIds",
  args: { taskIds: v.array(v.string()) },
  handler: function* deleteDailyEntriesByTaskIds({ taskIds }) {
    const entries = yield* dailyEntriesByTaskIds({ taskIds });
    if (entries.length > 0) {
      yield* deleteRows(
        dailyEntriesTable,
        entries.map((entry) => entry.id),
      );
    }
  },
});

export const createDailyEntry = action({
  name: "createDailyEntry",
  args: {
    entry: v.required(v.partial(dailyEntriesTable.v()), [
      "taskId",
      "dailyListId",
      "orderToken",
    ]),
  },
  handler: function* createDailyEntry({ entry }) {
    const newEntry: DailyEntry = {
      type: dailyEntryType,
      id: uuidv7(),
      taskId: entry.taskId,
      dailyListId: entry.dailyListId,
      orderToken: entry.orderToken,
      createdAt: Date.now(),
    };

    yield* insert(dailyEntriesTable, [newEntry]);
    return newEntry;
  },
});

export const updateDailyEntry = action({
  name: "updateDailyEntry",
  args: {
    id: v.string(),
    entry: v.partial(dailyEntriesTable.v()),
  },
  handler: function* updateDailyEntry({ id, entry }) {
    const entryInState = yield* dailyEntryById({ id });
    if (!entryInState) throw new Error("Entry not found");
    if (entry.taskId !== undefined && entry.taskId !== entryInState.taskId) {
      throw new Error("Cannot change a daily entry taskId");
    }

    yield* upsertRows(dailyEntriesTable, [
      {
        ...entryInState,
        ...entry,
        id: entryInState.id,
        taskId: entryInState.taskId,
      },
    ]);
  },
});

export const upsertDailyEntry = action({
  name: "upsertDailyEntry",
  args: {
    entry: v.required(v.partial(dailyEntriesTable.v()), [
      "taskId",
      "dailyListId",
      "orderToken",
    ]),
  },
  handler: function* upsertDailyEntry({ entry }) {
    const existing = yield* dailyEntryByTaskId({ taskId: entry.taskId });

    if (existing) {
      yield* updateDailyEntry({
        id: existing.id,
        entry: {
          dailyListId: entry.dailyListId,
          orderToken: entry.orderToken,
        },
      });
      return yield* dailyEntryByIdOrDefault({ id: existing.id });
    }

    return yield* createDailyEntry({ entry });
  },
});

export const createDailyEntrySibling = action({
  name: "createDailyEntrySibling",
  args: {
    taskId: v.string(),
    position: v.union(v.literal("before"), v.literal("after")),
    taskParams: v.optional(v.partial(tasksTable.v())),
  },
  handler: function* createDailyEntrySibling({ taskId, position, taskParams }) {
    const task = yield* taskById({ id: taskId });
    if (!task) throw new Error("Task not found");

    const entry = yield* dailyEntryByTaskId({ taskId });
    if (!entry) throw new Error("Task not in daily list");

    const newTask = yield* createTaskNextToSectionItem({
      itemId: taskId,
      position,
      taskParams,
    });

    const sibs = yield* dailyEntrySiblings({ taskId });
    const dailyListOrderToken = generateKeyPositionedBetween(
      entry,
      sibs,
      position,
    );

    return yield* createDailyEntry({
      entry: {
        taskId: newTask.id,
        dailyListId: entry.dailyListId,
        orderToken: dailyListOrderToken,
      },
    });
  },
});

export const removeFromDailyList = action({
  name: "removeFromDailyList",
  args: { taskId: v.string() },
  handler: function* removeFromDailyList({ taskId }) {
    yield* deleteDailyEntriesByTaskIds({ taskIds: [taskId] });
  },
});

export const createEntryInDailyList = action({
  name: "createEntryInDailyList",
  args: {
    taskId: v.string(),
    date: v.string(),
  },
  handler: function* createEntryInDailyList({ taskId, date }) {
    const dailyList = yield* createDailyListIfNotPresent({ date });

    const entries = yield* dailyEntriesByDailyListId({
      dailyListId: dailyList.id,
    });
    const firstToken = entries.length > 0 ? entries[0].orderToken : null;
    const orderToken = generateJitteredKeyBetween(null, firstToken);

    return yield* createDailyEntry({
      entry: {
        taskId,
        dailyListId: dailyList.id,
        orderToken,
      },
    });
  },
});

export const addToDailyList = action({
  name: "addToDailyList",
  args: {
    taskId: v.string(),
    dailyListId: v.string(),
    position: orderPositionArg,
  },
  handler: function* addToDailyList({
    taskId,
    dailyListId,
    position,
  }): Generator<unknown, void, unknown> {
    const task = yield* taskById({ id: taskId });
    if (!task) throw new Error("Task not found");

    let orderToken: string;

    if (position === "append") {
      const entries = yield* selectFrom(
        dailyEntriesTable,
        "byDailyListIdTokenOrdered",
      )
        .where((q) => q.eq("dailyListId", dailyListId))
        .order("desc")
        .limit(1);
      const lastToken = entries[0]?.orderToken ?? null;
      orderToken = generateJitteredKeyBetween(lastToken, null);
    } else if (position === "prepend") {
      const entries = yield* selectFrom(
        dailyEntriesTable,
        "byDailyListIdTokenOrdered",
      )
        .where((q) => q.eq("dailyListId", dailyListId))
        .limit(1);
      const firstToken = entries[0]?.orderToken ?? null;
      orderToken = generateJitteredKeyBetween(null, firstToken);
    } else {
      const siblings = normalizeOrderPosition(position) as [
        OrderableItem | undefined,
        OrderableItem | undefined,
      ];
      orderToken = generateJitteredKeyBetween(
        siblings[0]?.orderToken || null,
        siblings[1]?.orderToken || null,
      );
    }

    yield* upsertDailyEntry({
      entry: { taskId, dailyListId, orderToken },
    });
  },
});

export const scheduleTask = action({
  name: "scheduleTask",
  args: {
    taskId: v.string(),
    date: v.string(),
    position: orderPositionArg,
  },
  handler: function* scheduleTask({ taskId, date, position }) {
    const dailyList = yield* createDailyListIfNotPresent({ date });
    yield* addToDailyList({
      taskId,
      dailyListId: dailyList.id,
      position,
    });
    return yield* dailyEntryByTaskId({ taskId });
  },
});

registerModelSlice(
  {
    byId: dailyEntryById,
    delete: deleteDailyEntries,
    canDrop: dailyEntryCanDrop,
    handleDrop: dailyEntryHandleDrop,
  },
  dailyEntriesTable,
  dailyEntryType,
);
