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
import { appSlice } from ".";
import { cardsTasksSlice } from ".";
import { isTask, type Task } from "./cardsTasks";
import { dailyListsProjectionsSlice } from ".";
import { TaskProjection, isTaskProjection } from "./dailyListsProjections";
import { isStashProjection } from "./stashProjections";
import { stashProjectionsSlice } from ".";
import { AnyModelType } from "./maps";
import { registerSpaceSyncableTable } from "./syncMap";
import { registerModelSlice } from "./maps";
import { projectsSlice } from ".";
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
export const allIds = selector(function* allIds() {
  const dailyLists = yield* selectFrom(dailyListsTable, "byIds").where((q) => q);

  return dailyLists.map((p) => p.id);
});

export const byId = selector(function* byId(id: string) {
  const dailyLists = yield* selectFrom(dailyListsTable, "byId")
      .where((q) => q.eq("id", id))
      .limit(1);
  return dailyLists[0] as DailyList | undefined;
});

export const byIds = selector(function* byIds(ids: string[]) {
  const dailyLists = yield* selectFrom(dailyListsTable, "byId").where((q) =>
      ids.map((id) => q.eq("id", id)),
    );
  return dailyLists as DailyList[];
});

export const byIdOrDefault = selector(function* byIdOrDefault(id: string) {
  return (yield* byId(id)) || defaultDailyList;
});

export const byDate = selector(function* byDate(date: string) {
  const dailyLists = yield* selectFrom(dailyListsTable, "byDate")
      .where((q) => q.eq("date", date))
      .limit(1);
  return dailyLists[0] as DailyList | undefined;
});

export const childrenIds = selector(function* childrenIds(
  dailyListId: string,
): Generator<unknown, string[], unknown> {
  return yield* dailyListsProjectionsSlice.childrenIds(dailyListId);
});

export const doneChildrenIds = selector(function* doneChildrenIds(
  dailyListId: string,
): Generator<unknown, string[], unknown> {
  return yield* dailyListsProjectionsSlice.doneChildrenIds(dailyListId);
});

export const taskIds = selector(function* taskIds(dailyListId: string) {
  return yield* childrenIds(dailyListId);
});

export const allTaskIds = selector(function* allTaskIds(dailyListIds: string[]) {
  const result = new Set<string>();

  for (const dailyListId of dailyListIds) {
    const ids = yield* taskIds(dailyListId);
    ids.forEach((id) => result.add(id));
  }

  return result;
});

export const dateIdsMap = selector(function* dateIdsMap() {
  const allDailyLists = yield* selectFrom(dailyListsTable, "byIds");
  return Object.fromEntries(allDailyLists.map((d) => [d.date, d.id])) as Record<
    string,
    string
  >;
});

export const idsByDates = selector(function* idsByDates(dates: Date[]) {
  const map = yield* dateIdsMap();
  return dates
    .map((date) => {
      const dmy = getDMY(date);
      return map[dmy];
    })
    .filter((id) => id !== undefined) as string[];
});

export const firstChild = selector(function* firstChild(
  dailyListId: string,
): Generator<unknown, Task | undefined, unknown> {
  return yield* dailyListsProjectionsSlice.firstChild(dailyListId);
});

export const lastChild = selector(function* lastChild(
  dailyListId: string,
): Generator<unknown, Task | undefined, unknown> {
  return yield* dailyListsProjectionsSlice.lastChild(dailyListId);
});

export const canDrop = selector(function* canDrop(
  _dailyListId: string,
  dropId: string,
  dropModelType: AnyModelType,
): Generator<unknown, boolean, unknown> {
  const model = yield* appSlice.byId(dropId, dropModelType);
  if (!model) return false;

  if (isTask(model)) {
    return model.state === "todo";
  }

  if (isTaskProjection(model)) {
    const task = yield* cardsTasksSlice.byId(model.id);
    return task !== undefined && task.state === "todo";
  }

  if (isStashProjection(model)) {
    const task = yield* cardsTasksSlice.byId(model.id);
    return task !== undefined && task.state === "todo";
  }

  return false;
});

export const getId = selector(function* getId(date: string) {
  return yield* genUUIDV5(dailyListType, date);
});

export const create = action(function* create(dailyList: { date: string }) {
  const id = yield* getId(dailyList.date);
  const newDailyList: DailyList = {
    type: dailyListType,
    id,
    date: dailyList.date,
  };

  yield* insert(dailyListsTable, [newDailyList]);
  return newDailyList;
});

export const createIfNotPresent = action(function* createIfNotPresent(date: string) {
  const existing = yield* byDate(date);
  if (existing) {
    return existing;
  }

  return yield* create({ date });
});

export const createManyIfNotPresent = action(function* createManyIfNotPresent(dates: Date[]) {
  const results: DailyList[] = [];
  for (const date of dates) {
    const dmy = getDMY(date);
    const dailyList = yield* createIfNotPresent(dmy);
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
  const task = yield* projectsSlice.createTask(projectId, categoryPosition);

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

  yield* dailyListsProjectionsSlice.addToDailyList(
    task.id,
    dailyListId,
    position,
  );

  return yield* cardsTasksSlice.byIdOrDefault(task.id);
});

export const handleDrop = action(function* handleDrop(
  dailyListId: string,
  dropId: string,
  dropModelType: AnyModelType,
  edge: "top" | "bottom",
): Generator<unknown, void, unknown> {
  const drop = yield* appSlice.byId(dropId, dropModelType);
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

  yield* dailyListsProjectionsSlice.addToDailyList(
    taskId,
    dailyListId,
    edge === "top" ? "prepend" : "append",
  );

  if (shouldDeleteStashProjection) {
    yield* stashProjectionsSlice.deleteProjections([taskId]);
  }
});

// Local slice object for registerModelSlice (not exported)
const dailyListsSlice = {
  allIds,
  byId,
  byIds,
  byIdOrDefault,
  byDate,
  childrenIds,
  doneChildrenIds,
  taskIds,
  allTaskIds,
  dateIdsMap,
  idsByDates,
  firstChild,
  lastChild,
  canDrop,
  getId,
  create,
  createIfNotPresent,
  createManyIfNotPresent,
  delete: deleteDailyLists,
  createTaskInList,
  handleDrop,
};
registerModelSlice(dailyListsSlice, dailyListsTable, dailyListType);
