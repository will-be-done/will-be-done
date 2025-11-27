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
import { generateJitteredKeyBetween } from "fractional-indexing-jittered";
import uuidByString from "uuid-by-string";
import type { GenReturn, OrderableItem } from "./utils";
import { generateOrderTokenPositioned, getDMY } from "./utils";
import { appSlice } from "./app";
import { isTask, cardsTasksSlice, type Task } from "./cardsTasks";
import {
  isTaskProjection,
  dailyListsProjections,
  type TaskProjection,
  taskProjectionsTable,
} from "./dailyListsProjections";
import { registerSyncableTable } from "./syncMap";
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
registerSyncableTable(dailyListsTable, dailyListType);

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
    const projections = yield* runQuery(
      selectFrom(taskProjectionsTable, "byDailyListIdTokenOrdered").where((q) =>
        q.eq("dailyListId", dailyListId),
      ),
    );

    return projections.map((proj) => proj.id);
  }),
  doneChildrenIds: selector(function* (
    dailyListId: string,
  ): GenReturn<string[]> {
    const projections = yield* runQuery(
      selectFrom(taskProjectionsTable, "byDailyListIdTokenOrdered").where((q) =>
        q.eq("dailyListId", dailyListId),
      ),
    );

    const doneProjections: { id: string; lastToggledAt: number }[] = [];
    for (const proj of projections) {
      const task = yield* cardsTasksSlice.byId(proj.taskId);
      if (task?.state === "done") {
        doneProjections.push({
          id: proj.id,
          lastToggledAt: task.lastToggledAt,
        });
      }
    }

    return doneProjections
      .sort((a, b) => b.lastToggledAt - a.lastToggledAt)
      .map((proj) => proj.id);
  }),
  taskIds: selector(function* (dailyListId: string): GenReturn<string[]> {
    const childrenIds = yield* dailyListsSlice.childrenIds(dailyListId);

    return (yield* dailyListsProjections.byIds(childrenIds)).map(
      (p) => p.taskId,
    );
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
  ): GenReturn<TaskProjection | undefined> {
    const childrenIds = yield* dailyListsSlice.childrenIds(dailyListId);
    const firstChildId = childrenIds[0];
    return firstChildId
      ? yield* dailyListsProjections.byId(firstChildId)
      : undefined;
  }),
  lastChild: selector(function* (
    dailyListId: string,
  ): GenReturn<TaskProjection | undefined> {
    const childrenIds = yield* dailyListsSlice.childrenIds(dailyListId);
    const lastChildId = childrenIds[childrenIds.length - 1];
    return lastChildId
      ? yield* dailyListsProjections.byId(lastChildId)
      : undefined;
  }),
  canDrop: selector(function* (
    dailyListId: string,
    dropId: string,
  ): GenReturn<boolean> {
    const model = yield* appSlice.byId(dropId);
    if (!model) return false;

    if (!isTaskProjection(model) && !isTask(model)) {
      return false;
    }

    if (isTask(model) && model.state === "done") {
      return true;
    }

    if (isTaskProjection(model)) {
      const task = yield* cardsTasksSlice.byId(model.taskId);
      if (!task) return false;
      if (task.state === "done") {
        return true;
      }
    }

    return true;
    // const childrenIds = yield* dailyListsSlice2.childrenIds(dailyListId);
    // return childrenIds.length === 0;
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
  createProjection: action(function* (
    dailyListId: string,
    taskId: string,
    listPosition:
      | [OrderableItem | undefined, OrderableItem | undefined]
      | "append"
      | "prepend",
  ): GenReturn<TaskProjection> {
    const orderToken = yield* generateOrderTokenPositioned(
      dailyListId,
      dailyListsSlice,
      listPosition,
    );

    return yield* dailyListsProjections.create({
      taskId: taskId,
      dailyListId: dailyListId,
      orderToken: orderToken,
    });
  }),
  createProjectionWithTask: action(function* (
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
  ): GenReturn<TaskProjection> {
    const task = yield* projectsSlice.createTask(projectId, categoryPosition);

    return yield* dailyListsSlice.createProjection(
      dailyListId,
      task.id,
      listPosition,
    );
  }),
  handleDrop: action(function* (
    dailyListId: string,
    dropId: string,
    _edge: "top" | "bottom",
  ): GenReturn<void> {
    const lastChild = yield* dailyListsSlice.lastChild(dailyListId);
    const between: [string | null, string | null] = [
      lastChild?.orderToken || null,
      null,
    ];

    const orderToken = generateJitteredKeyBetween(
      between[0] || null,
      between[1] || null,
    );

    const dailyList = yield* dailyListsSlice.byId(dailyListId);
    if (!dailyList) return;

    const drop = yield* appSlice.byId(dropId);
    if (!drop) return;

    if (isTaskProjection(drop)) {
      yield* dailyListsProjections.update(drop.id, {
        orderToken,
        dailyListId: dailyList.id,
      });
    } else if (isTask(drop)) {
      yield* dailyListsSlice.createProjection(dailyList.id, drop.id, [
        undefined,
        lastChild,
      ]);
    }
  }),
};
registerModelSlice(dailyListsSlice, dailyListsTable, dailyListType);
