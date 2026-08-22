import { insert, selectFrom, v } from "@will-be-done/hyperdb";
import { action, selector } from "../builders";
import { getDMY, orderPositionArg } from "./utils";
import { appById } from "./app";
import {
  addToDailyList,
  dailyEntryChildrenIds,
  doneDailyEntryChildrenIds,
  firstDailyEntryChild,
  lastDailyEntryChild,
} from "./dailyEntries";
import { createProjectTask } from "./projects";
import { deleteStashEntries } from "./stashEntries";
import { taskById, taskByIdOrDefault } from "./tasks";
import { registerModelSlice } from "./maps";
import { genUUIDV5, genUUIDV5Many } from "../traits";
import {
  dailyListType,
  dailyListsTable,
  Task,
  isTask,
  possibleModelType,
  DailyList,
  isDailyEntry,
  isStashEntry,
  tasksTable,
} from "./tables";

export const defaultDailyList: DailyList = {
  type: dailyListType,
  id: "default-daily-list-id",
  date: "",
};

export const dailyListAllIds = selector({
  name: "dailyListAllIds",
  args: {},
  handler: function* dailyListAllIds() {
    const dailyLists = yield* selectFrom(dailyListsTable, "byIds").where(
      (q) => q,
    );

    return dailyLists.map((p) => p.id);
  },
});

export const dailyListById = selector({
  name: "dailyListById",
  args: { id: v.string() },
  handler: function* dailyListById({ id }) {
    const dailyLists = yield* selectFrom(dailyListsTable, "byId")
      .where((q) => q.eq("id", id))
      .limit(1);
    return dailyLists[0] as DailyList | undefined;
  },
});

export const dailyListsByIds = selector({
  name: "dailyListsByIds",
  args: { ids: v.array(v.string()) },
  handler: function* dailyListsByIds({ ids }) {
    if (ids.length === 0) return [];
    const dailyLists = yield* selectFrom(dailyListsTable, "byId").where((q) =>
      ids.map((id) => q.eq("id", id)),
    );
    return dailyLists as DailyList[];
  },
});

export const dailyListByIdOrDefault = selector({
  name: "dailyListByIdOrDefault",
  args: { id: v.string() },
  handler: function* dailyListByIdOrDefault({ id }) {
    return (yield* dailyListById({ id })) || defaultDailyList;
  },
});

export const dailyListByDate = selector({
  name: "dailyListByDate",
  args: { date: v.string() },
  handler: function* dailyListByDate({ date }) {
    const dailyLists = yield* selectFrom(dailyListsTable, "byDate")
      .where((q) => q.eq("date", date))
      .limit(1);
    return dailyLists[0] as DailyList | undefined;
  },
});

export const dailyListsInDateRange = selector({
  name: "dailyListsInDateRange",
  args: {
    from: v.string(),
    to: v.string(),
    cursorDate: v.union(v.string(), v.null()),
    cursorId: v.union(v.string(), v.null()),
    limit: v.number(),
  },
  handler: function* dailyListsInDateRange({
    from,
    to,
    cursorDate,
    cursorId,
    limit,
  }) {
    if (cursorDate !== null && (cursorDate < from || cursorDate > to)) {
      return [] as DailyList[];
    }

    const query = selectFrom(dailyListsTable, "byDateOrdered").order("asc");
    if (cursorDate === null || cursorId === null) {
      return (yield* query
        .where((q) => q.gte("date", from).lte("date", to))
        .limit(limit)) as DailyList[];
    }

    const remainingAtCursor = (yield* query
      .where((q) => q.eq("date", cursorDate).gte("id", cursorId))
      .limit(limit + 1)) as DailyList[];
    const page =
      remainingAtCursor[0]?.id === cursorId
        ? remainingAtCursor.slice(1)
        : remainingAtCursor.slice(0, limit);

    if (page.length < limit) {
      page.push(
        ...((yield* selectFrom(dailyListsTable, "byDateOrdered")
          .where((q) => q.gt("date", cursorDate).lte("date", to))
          .order("asc")
          .limit(limit - page.length)) as DailyList[]),
      );
    }
    return page;
  },
});

export const dailyListChildrenIds = selector({
  name: "dailyListChildrenIds",
  args: { dailyListId: v.string() },
  handler: function* dailyListChildrenIds({
    dailyListId,
  }): Generator<unknown, string[], unknown> {
    return yield* dailyEntryChildrenIds({ dailyListId });
  },
});

export const dailyListDoneChildrenIds = selector({
  name: "dailyListDoneChildrenIds",
  args: { dailyListId: v.string() },
  handler: function* dailyListDoneChildrenIds({
    dailyListId,
  }): Generator<unknown, string[], unknown> {
    return yield* doneDailyEntryChildrenIds({ dailyListId });
  },
});

export const dailyListTaskIds = selector({
  name: "dailyListTaskIds",
  args: { dailyListId: v.string() },
  handler: function* dailyListTaskIds({ dailyListId }) {
    return yield* dailyListChildrenIds({ dailyListId });
  },
});

export const dailyListAllTaskIds = selector({
  name: "dailyListAllTaskIds",
  args: { dailyListIds: v.array(v.string()) },
  handler: function* dailyListAllTaskIds({ dailyListIds }) {
    const result = new Set<string>();

    for (const dailyListId of dailyListIds) {
      const ids = yield* dailyListTaskIds({ dailyListId });
      ids.forEach((id) => result.add(id));
    }

    return result;
  },
});

export const dailyListDateIdsMap = selector({
  name: "dailyListDateIdsMap",
  args: {},
  handler: function* dailyListDateIdsMap() {
    const allDailyLists = yield* selectFrom(dailyListsTable, "byIds");
    return Object.fromEntries(
      allDailyLists.map((d) => [d.date, d.id]),
    ) as Record<string, string>;
  },
});

export const dailyListIdsByDates = selector({
  name: "dailyListIdsByDates",
  args: { dates: v.array(v.number()) },
  handler: function* dailyListIdsByDates({ dates }) {
    const dmyDates = dates.map((timestamp) => getDMY(new Date(timestamp)));
    if (dmyDates.length === 0) return [];

    const dailyLists = (yield* selectFrom(dailyListsTable, "byDate").where(
      (q) => dmyDates.map((date) => q.eq("date", date)),
    )) as DailyList[];
    const idsByDate = new Map(
      dailyLists.map((dailyList) => [dailyList.date, dailyList.id]),
    );

    return dmyDates
      .map((date) => idsByDate.get(date))
      .filter((id) => id !== undefined) as string[];
  },
});

export const dailyListsByDates = selector({
  name: "dailyListsByDates",
  args: { dates: v.array(v.number()) },
  handler: function* dailyListsByDates({ dates }) {
    const ids = yield* dailyListIdsByDates({ dates });
    const dailyLists = yield* dailyListsByIds({ ids });
    const dailyListsById = new Map(
      dailyLists.map((dailyList) => [dailyList.id, dailyList]),
    );
    return ids
      .map((id) => dailyListsById.get(id))
      .filter((dailyList) => dailyList !== undefined) as DailyList[];
  },
});

export const firstDailyListChild = selector({
  name: "firstDailyListChild",
  args: { dailyListId: v.string() },
  handler: function* firstDailyListChild({
    dailyListId,
  }): Generator<unknown, Task | undefined, unknown> {
    return yield* firstDailyEntryChild({ dailyListId });
  },
});

export const lastDailyListChild = selector({
  name: "lastDailyListChild",
  args: { dailyListId: v.string() },
  handler: function* lastDailyListChild({
    dailyListId,
  }): Generator<unknown, Task | undefined, unknown> {
    return yield* lastDailyEntryChild({ dailyListId });
  },
});

export const dailyListCanDrop = selector({
  name: "dailyListCanDrop",
  args: {
    _dailyListId: v.string(),
    dropId: v.string(),
    dropModelType: possibleModelType,
  },
  handler: function* dailyListCanDrop({
    _dailyListId,
    dropId,
    dropModelType,
  }): Generator<unknown, boolean, unknown> {
    const model = yield* appById({
      id: dropId,
      modelType: dropModelType,
    });
    if (!model) return false;

    if (isTask(model)) {
      return model.state === "todo";
    }

    if (isDailyEntry(model)) {
      const task = yield* taskById({ id: model.taskId });
      return task !== undefined && task.state === "todo";
    }

    if (isStashEntry(model)) {
      const task = yield* taskById({ id: model.taskId });
      return task !== undefined && task.state === "todo";
    }

    return false;
  },
});

export const dailyListGetId = selector({
  name: "dailyListGetId",
  args: { date: v.string() },
  handler: function* dailyListGetId({ date }) {
    return yield* genUUIDV5(dailyListType, date);
  },
});

export const dailyListGetIds = selector({
  name: "dailyListGetIds",
  args: { dates: v.array(v.string()) },
  handler: function* dailyListGetIds({ dates }) {
    return yield* genUUIDV5Many(dailyListType, dates);
  },
});

export const createDailyList = action({
  name: "createDailyList",
  args: {
    dailyList: v.required(v.partial(dailyListsTable.v()), ["date"]),
  },
  handler: function* createDailyList({ dailyList }) {
    const id = yield* dailyListGetId({ date: dailyList.date });
    const newDailyList: DailyList = {
      type: dailyListType,
      id,
      date: dailyList.date,
    };

    yield* insert(dailyListsTable, [newDailyList]);
    return newDailyList;
  },
});

export const createDailyListIfNotPresent = action({
  name: "createDailyListIfNotPresent",
  args: { date: v.string() },
  handler: function* createDailyListIfNotPresent({ date }) {
    const existing = yield* dailyListByDate({ date });
    if (existing) {
      return existing;
    }

    return yield* createDailyList({ dailyList: { date } });
  },
});

export const createManyDailyListsIfNotPresent = action({
  name: "createManyDailyListsIfNotPresent",
  args: { dates: v.array(v.number()) },
  handler: function* createManyDailyListsIfNotPresent({ dates }) {
    const results: DailyList[] = [];
    for (const timestamp of dates) {
      const date = new Date(timestamp);
      const dmy = getDMY(date);
      const dailyList = yield* createDailyListIfNotPresent({ date: dmy });
      results.push(dailyList);
    }
    return results;
  },
});

export const deleteDailyLists = action({
  name: "deleteDailyLists",
  args: { ids: v.array(v.string()) },
  // DailyLists are deterministic date scaffolding. Keep the registered model
  // delete command as a no-op so generic deletion cannot create tombstones.
  handler: function* deleteDailyLists() {},
});

export const createTaskInList = action({
  name: "createTaskInList",
  args: {
    dailyListId: v.string(),
    projectId: v.string(),
    listPosition: orderPositionArg,
    sectionPosition: orderPositionArg,
    taskAttrs: v.optional(v.partial(tasksTable.v())),
  },
  handler: function* createTaskInList({
    dailyListId,
    projectId,
    listPosition,
    sectionPosition,
    taskAttrs,
  }): Generator<unknown, Task, unknown> {
    const task = yield* createProjectTask({
      projectId,
      position: sectionPosition,
      taskAttrs,
    });

    yield* addToDailyList({
      taskId: task.id,
      dailyListId,
      position: listPosition,
    });

    return yield* taskByIdOrDefault({ id: task.id });
  },
});

export const dailyListHandleDrop = action({
  name: "dailyListHandleDrop",
  args: {
    dailyListId: v.string(),
    dropId: v.string(),
    dropModelType: possibleModelType,
    edge: v.union(v.literal("top"), v.literal("bottom")),
  },
  handler: function* dailyListHandleDrop({
    dailyListId,
    dropId,
    dropModelType,
    edge,
  }): Generator<unknown, void, unknown> {
    const drop = yield* appById({
      id: dropId,
      modelType: dropModelType,
    });
    if (!drop) return;

    let taskId: string;
    let shouldDeleteStashEntry = false;
    if (isTask(drop)) {
      taskId = drop.id;
    } else if (isDailyEntry(drop)) {
      taskId = drop.taskId;
    } else if (isStashEntry(drop)) {
      taskId = drop.taskId;
      shouldDeleteStashEntry = true;
    } else {
      return;
    }

    yield* addToDailyList({
      taskId,
      dailyListId,
      position: edge === "top" ? "prepend" : "append",
    });

    if (shouldDeleteStashEntry) {
      yield* deleteStashEntries({ ids: [dropId] });
    }
  },
});

const dailyListsSlice = {
  byId: dailyListById,
  delete: deleteDailyLists,
  handleDrop: dailyListHandleDrop,
  canDrop: dailyListCanDrop,
};
registerModelSlice(dailyListsSlice, dailyListsTable, dailyListType);
