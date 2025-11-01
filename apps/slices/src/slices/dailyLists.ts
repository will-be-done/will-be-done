import { isObjectType } from "../utils";
import {
  action,
  deleteRows,
  insert,
  runQuery,
  selectFrom,
  selector,
  table,
  update,
} from "@will-be-done/hyperdb";
import { generateJitteredKeyBetween } from "fractional-indexing-jittered";
import uuidByString from "uuid-by-string";
import type { GenReturn, OrderableItem } from "./utils";
import { generateOrderTokenPositioned, getDMY } from "./utils";
import { appSlice2 } from "./app";
import { isTask, tasksSlice2, type Task } from "./tasks";
import {
  isTaskProjection,
  projectionsSlice2,
  type TaskProjection,
  taskProjectionsTable,
} from "./projections";
import { projectItemsSlice2 } from "./projectItems";

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

// Slice
export const dailyListsSlice2 = {
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
    return (yield* dailyListsSlice2.byId(id)) || defaultDailyList;
  }),
  byDate: selector(function* (date: string): GenReturn<DailyList | undefined> {
    const dailyLists = yield* runQuery(
      selectFrom(dailyListsTable, "byDate")
        .where((q) => q.eq("date", date))
        .limit(1),
    );
    return dailyLists[0];
  }),
  childrenIds: selector(function* (
    dailyListId: string,
    includeOnlyProjectIds: string[] = [],
  ): GenReturn<string[]> {
    const projections = yield* runQuery(
      selectFrom(taskProjectionsTable, "byDailyListIdTokenOrdered").where((q) =>
        q.eq("dailyListId", dailyListId),
      ),
    );

    const todoProjections: TaskProjection[] = [];
    for (const proj of projections) {
      const task = yield* tasksSlice2.byId(proj.taskId);
      if (
        task?.state === "todo" &&
        (includeOnlyProjectIds.length === 0 ||
          includeOnlyProjectIds.includes(task.projectId))
      ) {
        todoProjections.push(proj);
      }
    }

    return todoProjections.map((proj) => proj.id);
  }),
  doneChildrenIds: selector(function* (
    dailyListId: string,
    includeOnlyProjectIds: string[] = [],
  ): GenReturn<string[]> {
    const projections = yield* runQuery(
      selectFrom(taskProjectionsTable, "byDailyListIdTokenOrdered").where((q) =>
        q.eq("dailyListId", dailyListId),
      ),
    );

    const doneProjections: { id: string; lastToggledAt: number }[] = [];
    for (const proj of projections) {
      const task = yield* tasksSlice2.byId(proj.taskId);
      if (
        task?.state === "done" &&
        (includeOnlyProjectIds.length === 0 ||
          includeOnlyProjectIds.includes(task.projectId))
      ) {
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
    const childrenIds = yield* dailyListsSlice2.childrenIds(dailyListId);

    return (yield* projectionsSlice2.byIds(childrenIds)).map((p) => p.taskId);
  }),
  allTaskIds: selector(function* (
    dailyListIds: string[],
  ): GenReturn<Set<string>> {
    const allTaskIds = new Set<string>();

    for (const dailyListId of dailyListIds) {
      const taskIds = yield* dailyListsSlice2.taskIds(dailyListId);
      taskIds.forEach((id) => allTaskIds.add(id));
    }

    return allTaskIds;
  }),
  notDoneTaskIdsExceptDailies: selector(function* (
    projectId: string,
    exceptDailyListIds: string[],
    taskHorizons: Task["horizon"][],
    alwaysIncludeTaskIds: string[] = [],
  ): GenReturn<string[]> {
    const exceptTaskIds =
      yield* dailyListsSlice2.allTaskIds(exceptDailyListIds);

    // Get all tasks from the project that match the horizons
    const notDoneTaskIds = yield* projectItemsSlice2.notDoneTaskIds(
      projectId,
      taskHorizons,
      alwaysIncludeTaskIds,
    );

    return notDoneTaskIds.filter((id) => !exceptTaskIds.has(id));
  }),
  // TODO: use hash index
  dateIdsMap: selector(function* (): GenReturn<Record<string, string>> {
    const allDailyLists = yield* runQuery(selectFrom(dailyListsTable, "byIds"));
    return Object.fromEntries(allDailyLists.map((d) => [d.date, d.id]));
  }),
  idByDate: selector(function* (date: Date): GenReturn<string | undefined> {
    const dateIdsMap = yield* dailyListsSlice2.dateIdsMap();
    const dmy = getDMY(date);
    return dateIdsMap[dmy];
  }),
  idsByDates: selector(function* (dates: Date[]): GenReturn<string[]> {
    const dateIdsMap = yield* dailyListsSlice2.dateIdsMap();
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
    const childrenIds = yield* dailyListsSlice2.childrenIds(dailyListId);
    const firstChildId = childrenIds[0];
    return firstChildId
      ? yield* projectionsSlice2.byId(firstChildId)
      : undefined;
  }),
  lastChild: selector(function* (
    dailyListId: string,
  ): GenReturn<TaskProjection | undefined> {
    const childrenIds = yield* dailyListsSlice2.childrenIds(dailyListId);
    const lastChildId = childrenIds[childrenIds.length - 1];
    return lastChildId ? yield* projectionsSlice2.byId(lastChildId) : undefined;
  }),
  canDrop: selector(function* (
    dailyListId: string,
    dropId: string,
  ): GenReturn<boolean> {
    const model = yield* appSlice2.byId(dropId);
    if (!model) return false;

    if (!isTaskProjection(model) && !isTask(model)) {
      return false;
    }

    if (isTask(model) && model.state === "done") {
      return true;
    }

    if (isTaskProjection(model)) {
      const task = yield* tasksSlice2.byId(model.taskId);
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
    const existing = yield* dailyListsSlice2.byDate(date);
    if (existing) {
      return existing;
    }

    return yield* dailyListsSlice2.create({ date });
  }),
  createManyIfNotPresent: action(function* (
    dates: Date[],
  ): GenReturn<DailyList[]> {
    const results: DailyList[] = [];
    for (const date of dates) {
      const dmy = getDMY(date);
      const dailyList = yield* dailyListsSlice2.createIfNotPresent(dmy);
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
      dailyListsSlice2,
      listPosition,
    );

    return yield* projectionsSlice2.create({
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
    projectPosition:
      | [OrderableItem | undefined, OrderableItem | undefined]
      | "append"
      | "prepend",
  ): GenReturn<TaskProjection> {
    const task = yield* projectItemsSlice2.createTask(
      projectId,
      projectPosition,
    );

    return yield* dailyListsSlice2.createProjection(
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
    const lastChild = yield* dailyListsSlice2.lastChild(dailyListId);
    const between: [string | null, string | null] = [
      lastChild?.orderToken || null,
      null,
    ];

    const orderToken = generateJitteredKeyBetween(
      between[0] || null,
      between[1] || null,
    );

    const dailyList = yield* dailyListsSlice2.byId(dailyListId);
    if (!dailyList) return;

    const drop = yield* appSlice2.byId(dropId);
    if (!drop) return;

    if (isTaskProjection(drop)) {
      yield* projectionsSlice2.update(drop.id, {
        orderToken,
        dailyListId: dailyList.id,
      });
    } else if (isTask(drop)) {
      yield* dailyListsSlice2.createProjection(dailyList.id, drop.id, [
        undefined,
        lastChild,
      ]);
    }
  }),
};
