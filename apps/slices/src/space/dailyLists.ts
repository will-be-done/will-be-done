import { isObjectType } from "../utils";
import {
  action,
  deleteRows,
  defineTable,
  type ExtractSchema,
  insert,
  selectFrom,
  selector,
  v,
} from "@will-be-done/hyperdb-lib";
import type { OrderableItem } from "./utils";
import { getDMY } from "./utils";
import { appById } from "./app";
import {
  addToDailyList,
  dailyProjectionChildrenIds,
  doneDailyProjectionChildrenIds,
  firstDailyProjectionChild,
  lastDailyProjectionChild,
} from "./dailyListsProjections";
import { createProjectTask } from "./projects";
import { deleteStashProjections } from "./stashProjections";
import {
  taskById,
  taskByIdOrDefault,
} from "./cardsTasks";

import { isTask, type Task } from "./cardsTasks";

import { TaskProjection, isTaskProjection } from "./dailyListsProjections";
import { isStashProjection } from "./stashProjections";

import { AnyModelType } from "./maps";
import { registerSpaceSyncableTable } from "./syncMap";
import { registerModelSlice } from "./maps";

import { genUUIDV5 } from "../traits";

// Type definitions
export const dailyListType = "dailyList";

export const dailyListsTable = defineTable("daily_lists", {
  type: v.literal(dailyListType),
  id: v.string(),
  date: v.string(),
})
  .index("byIds", ["id"])
  .index("byDate", ["date"], { type: "hash" });
export type DailyList = ExtractSchema<typeof dailyListsTable>;

export const isDailyList = isObjectType<DailyList>(dailyListType);

export const defaultDailyList: DailyList = {
  type: dailyListType,
  id: "default-daily-list-id",
  date: "",
};

registerSpaceSyncableTable(dailyListsTable, dailyListType);

// Selectors and actions
export const dailyListAllIds = selector(function* dailyListAllIds() {
  const dailyLists = yield* selectFrom(dailyListsTable, "byIds").where((q) => q);

  return dailyLists.map((p) => p.id);
});

export const dailyListById = selector(function* dailyListById(id: string) {
  const dailyLists = yield* selectFrom(dailyListsTable, "byId")
      .where((q) => q.eq("id", id))
      .limit(1);
  return dailyLists[0] as DailyList | undefined;
});

export const dailyListsByIds = selector(function* dailyListsByIds(ids: string[]) {
  const dailyLists = yield* selectFrom(dailyListsTable, "byId").where((q) =>
      ids.map((id) => q.eq("id", id)),
    );
  return dailyLists as DailyList[];
});

export const dailyListByIdOrDefault = selector(function* dailyListByIdOrDefault(id: string) {
  return (yield* dailyListById(id)) || defaultDailyList;
});

export const dailyListByDate = selector(function* dailyListByDate(date: string) {
  const dailyLists = yield* selectFrom(dailyListsTable, "byDate")
      .where((q) => q.eq("date", date))
      .limit(1);
  return dailyLists[0] as DailyList | undefined;
});

export const dailyListChildrenIds = selector(function* dailyListChildrenIds(
  dailyListId: string,
): Generator<unknown, string[], unknown> {
  return yield* dailyProjectionChildrenIds(dailyListId);
});

export const dailyListDoneChildrenIds = selector(function* dailyListDoneChildrenIds(
  dailyListId: string,
): Generator<unknown, string[], unknown> {
  return yield* doneDailyProjectionChildrenIds(dailyListId);
});

export const dailyListTaskIds = selector(function* dailyListTaskIds(dailyListId: string) {
  return yield* dailyListChildrenIds(dailyListId);
});

export const dailyListAllTaskIds = selector(function* dailyListAllTaskIds(dailyListIds: string[]) {
  const result = new Set<string>();

  for (const dailyListId of dailyListIds) {
    const ids = yield* dailyListTaskIds(dailyListId);
    ids.forEach((id) => result.add(id));
  }

  return result;
});

export const dailyListDateIdsMap = selector(function* dailyListDateIdsMap() {
  const allDailyLists = yield* selectFrom(dailyListsTable, "byIds");
  return Object.fromEntries(allDailyLists.map((d) => [d.date, d.id])) as Record<
    string,
    string
  >;
});

export const dailyListIdsByDates = selector(function* dailyListIdsByDates(dates: Date[]) {
  const map = yield* dailyListDateIdsMap();
  return dates
    .map((date) => {
      const dmy = getDMY(date);
      return map[dmy];
    })
    .filter((id) => id !== undefined) as string[];
});

export const firstDailyListChild = selector(function* firstDailyListChild(
  dailyListId: string,
): Generator<unknown, Task | undefined, unknown> {
  return yield* firstDailyProjectionChild(dailyListId);
});

export const lastDailyListChild = selector(function* lastDailyListChild(
  dailyListId: string,
): Generator<unknown, Task | undefined, unknown> {
  return yield* lastDailyProjectionChild(dailyListId);
});

export const dailyListCanDrop = selector(function* dailyListCanDrop(
  _dailyListId: string,
  dropId: string,
  dropModelType: AnyModelType,
): Generator<unknown, boolean, unknown> {
  const model = yield* appById(dropId, dropModelType);
  if (!model) return false;

  if (isTask(model)) {
    return model.state === "todo";
  }

  if (isTaskProjection(model)) {
    const task = yield* taskById(model.id);
    return task !== undefined && task.state === "todo";
  }

  if (isStashProjection(model)) {
    const task = yield* taskById(model.id);
    return task !== undefined && task.state === "todo";
  }

  return false;
});

export const dailyListGetId = selector(function* dailyListGetId(date: string) {
  return yield* genUUIDV5(dailyListType, date);
});

export const createDailyList = action(function* createDailyList(dailyList: { date: string }) {
  const id = yield* dailyListGetId(dailyList.date);
  const newDailyList: DailyList = {
    type: dailyListType,
    id,
    date: dailyList.date,
  };

  yield* insert(dailyListsTable, [newDailyList]);
  return newDailyList;
});

export const createDailyListIfNotPresent = action(function* createDailyListIfNotPresent(date: string) {
  const existing = yield* dailyListByDate(date);
  if (existing) {
    return existing;
  }

  return yield* createDailyList({ date });
});

export const createManyDailyListsIfNotPresent = action(function* createManyDailyListsIfNotPresent(dates: Date[]) {
  const results: DailyList[] = [];
  for (const date of dates) {
    const dmy = getDMY(date);
    const dailyList = yield* createDailyListIfNotPresent(dmy);
    results.push(dailyList);
  }
  return results;
});

export const deleteDailyLists = action(function* deleteDailyLists(ids: string[]) {
  yield* deleteRows(dailyListsTable, ids);
});

export const createTaskInList = action(function* createTaskInList(
  dailyListId: string,
  projectId: string,
  listPosition:
    | [OrderableItem | undefined, OrderableItem | undefined]
    | "append"
    | "prepend",
  categoryPosition:
    | [OrderableItem | undefined, OrderableItem | undefined]
    | "append"
    | "prepend",
): Generator<unknown, Task, unknown> {
  const task = yield* createProjectTask(projectId, categoryPosition);

  let position:
    | "append"
    | "prepend"
    | [TaskProjection | undefined, TaskProjection | undefined];
  if (listPosition === "append" || listPosition === "prepend") {
    position = listPosition;
  } else {
    position = [
      listPosition[0] as TaskProjection | undefined,
      listPosition[1] as TaskProjection | undefined,
    ];
  }

  yield* addToDailyList(
    task.id,
    dailyListId,
    position,
  );

  return yield* taskByIdOrDefault(task.id);
});

export const dailyListHandleDrop = action(function* dailyListHandleDrop(
  dailyListId: string,
  dropId: string,
  dropModelType: AnyModelType,
  edge: "top" | "bottom",
): Generator<unknown, void, unknown> {
  const drop = yield* appById(dropId, dropModelType);
  if (!drop) return;

  let taskId: string;
  let shouldDeleteStashProjection = false;
  if (isTask(drop)) {
    taskId = drop.id;
  } else if (isTaskProjection(drop)) {
    taskId = drop.id; // projection.id is the same as task.id
  } else if (isStashProjection(drop)) {
    taskId = drop.id;
    shouldDeleteStashProjection = true;
  } else {
    return;
  }

  yield* addToDailyList(
    taskId,
    dailyListId,
    edge === "top" ? "prepend" : "append",
  );

  if (shouldDeleteStashProjection) {
    yield* deleteStashProjections([taskId]);
  }
});

// Local slice object for registerModelSlice (not exported)
const dailyListsSlice = {
  dailyListAllIds,
  byId: dailyListById,
  dailyListsByIds,
  dailyListByIdOrDefault,
  dailyListByDate,
  dailyListChildrenIds,
  dailyListDoneChildrenIds,
  dailyListTaskIds,
  dailyListAllTaskIds,
  dailyListDateIdsMap,
  dailyListIdsByDates,
  firstDailyListChild,
  lastDailyListChild,
  canDrop: dailyListCanDrop,
  dailyListGetId,
  createDailyList,
  createDailyListIfNotPresent,
  createManyDailyListsIfNotPresent,
  delete: deleteDailyLists,
  createTaskInList,
  handleDrop: dailyListHandleDrop,
};
registerModelSlice(dailyListsSlice, dailyListsTable, dailyListType);
