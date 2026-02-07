import { isObjectType } from "../utils";
import {
  action,
  deleteRows,
  insert,
  runQuery,
  selectFrom,
  selector,
  table,
} from "@will-be-done/hyperdb";
import uuidByString from "uuid-by-string";
import type { GenReturn, OrderableItem } from "./utils";
import { getDMY } from "./utils";
import { appSlice } from "./app";
import { isTask, cardsTasksSlice, type Task } from "./cardsTasks";
import {
  dailyListsProjectionsSlice,
  TaskProjection,
  isTaskProjection,
} from "./dailyListsProjections";
import { AnyModelType } from "./maps";
import { registerSpaceSyncableTable } from "./syncMap";
import { registerModelSlice } from "./maps";
import { projectsSlice } from "./projects";

// Type definitions
export const dailyListType = "dailyList";

export type DailyList = {
  type: typeof dailyListType;
  id: string;
  date: string;
};

export const isDailyList = isObjectType<DailyList>(dailyListType);

export const defaultDailyList: DailyList = {
  type: dailyListType,
  id: "default-daily-list-id",
  date: "",
};

// Table definition
export const dailyListsTable = table<DailyList>("daily_lists").withIndexes({
  byId: { cols: ["id"], type: "hash" },
  byIds: { cols: ["id"], type: "btree" },
  byDate: { cols: ["date"], type: "hash" },
});
registerSpaceSyncableTable(dailyListsTable, dailyListType);

// Slice
export const dailyListsSlice = {
  // selectors
  allIds: selector(function* (): GenReturn<string[]> {
    const dailyLists = yield* runQuery(
      selectFrom(dailyListsTable, "byIds").where((q) => q),
    );

    return dailyLists.map((p) => p.id);
  }),
  byId: selector(function* (id: string): GenReturn<DailyList | undefined> {
    const dailyLists = yield* runQuery(
      selectFrom(dailyListsTable, "byId")
        .where((q) => q.eq("id", id))
        .limit(1),
    );
    return dailyLists[0];
  }),
  byIds: selector(function* (ids: string[]): GenReturn<DailyList[]> {
    const dailyLists = yield* runQuery(
      selectFrom(dailyListsTable, "byId").where((q) =>
        ids.map((id) => q.eq("id", id)),
      ),
    );
    return dailyLists;
  }),
  byIdOrDefault: selector(function* (id: string): GenReturn<DailyList> {
    return (yield* dailyListsSlice.byId(id)) || defaultDailyList;
  }),
  byDate: selector(function* (date: string): GenReturn<DailyList | undefined> {
    const dailyLists = yield* runQuery(
      selectFrom(dailyListsTable, "byDate")
        .where((q) => q.eq("date", date))
        .limit(1),
    );
    return dailyLists[0];
  }),
  childrenIds: selector(function* (dailyListId: string): GenReturn<string[]> {
    return yield* dailyListsProjectionsSlice.childrenIds(dailyListId);
  }),
  doneChildrenIds: selector(function* (
    dailyListId: string,
  ): GenReturn<string[]> {
    return yield* dailyListsProjectionsSlice.doneChildrenIds(dailyListId);
  }),
  taskIds: selector(function* (dailyListId: string): GenReturn<string[]> {
    return yield* dailyListsSlice.childrenIds(dailyListId);
  }),
  allTaskIds: selector(function* (
    dailyListIds: string[],
  ): GenReturn<Set<string>> {
    const allTaskIds = new Set<string>();

    for (const dailyListId of dailyListIds) {
      const taskIds = yield* dailyListsSlice.taskIds(dailyListId);
      taskIds.forEach((id) => allTaskIds.add(id));
    }

    return allTaskIds;
  }),
  // TODO: use hash index
  dateIdsMap: selector(function* (): GenReturn<Record<string, string>> {
    const allDailyLists = yield* runQuery(selectFrom(dailyListsTable, "byIds"));
    return Object.fromEntries(allDailyLists.map((d) => [d.date, d.id]));
  }),
  idsByDates: selector(function* (dates: Date[]): GenReturn<string[]> {
    const dateIdsMap = yield* dailyListsSlice.dateIdsMap();
    return dates
      .map((date) => {
        const dmy = getDMY(date);
        return dateIdsMap[dmy];
      })
      .filter((id) => id !== undefined);
  }),
  firstChild: selector(function* (
    dailyListId: string,
  ): GenReturn<Task | undefined> {
    return yield* dailyListsProjectionsSlice.firstChild(dailyListId);
  }),
  lastChild: selector(function* (
    dailyListId: string,
  ): GenReturn<Task | undefined> {
    return yield* dailyListsProjectionsSlice.lastChild(dailyListId);
  }),
  canDrop: selector(function* (
    dailyListId: string,
    dropId: string,
    dropModelType: AnyModelType,
  ): GenReturn<boolean> {
    const model = yield* appSlice.byId(dropId, dropModelType);
    if (!model) return false;

    if (isTask(model)) {
      return model.state === "todo";
    }

    if (isTaskProjection(model)) {
      const task = yield* cardsTasksSlice.byId(model.id);
      return task !== undefined && task.state === "todo";
    }

    return false;
  }),

  // actions
  create: action(function* (dailyList: { date: string }): GenReturn<DailyList> {
    const id = uuidByString(dailyList.date);
    const newDailyList: DailyList = {
      type: dailyListType,
      id,
      date: dailyList.date,
    };

    yield* insert(dailyListsTable, [newDailyList]);
    return newDailyList;
  }),
  createIfNotPresent: action(function* (date: string): GenReturn<DailyList> {
    const existing = yield* dailyListsSlice.byDate(date);
    if (existing) {
      return existing;
    }

    return yield* dailyListsSlice.create({ date });
  }),
  createManyIfNotPresent: action(function* (
    dates: Date[],
  ): GenReturn<DailyList[]> {
    const results: DailyList[] = [];
    for (const date of dates) {
      const dmy = getDMY(date);
      const dailyList = yield* dailyListsSlice.createIfNotPresent(dmy);
      results.push(dailyList);
    }
    return results;
  }),
  delete: action(function* (ids: string[]): GenReturn<void> {
    yield* deleteRows(dailyListsTable, ids);
  }),
  createTaskInList: action(function* (
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
  ): GenReturn<Task> {
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
  }),
  handleDrop: action(function* (
    dailyListId: string,
    dropId: string,
    dropModelType: AnyModelType,
    edge: "top" | "bottom",
  ): GenReturn<void> {
    const drop = yield* appSlice.byId(dropId, dropModelType);
    if (!drop) return;

    let taskId: string;
    if (isTask(drop)) {
      taskId = drop.id;
    } else if (isTaskProjection(drop)) {
      taskId = drop.id; // projection.id is the same as task.id
    } else {
      return;
    }

    yield* dailyListsProjectionsSlice.addToDailyList(
      taskId,
      dailyListId,
      edge === "top" ? "prepend" : "append",
    );
  }),
};
registerModelSlice(dailyListsSlice, dailyListsTable, dailyListType);
