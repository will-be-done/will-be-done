import { isObjectType } from "../utils";
import { shouldNeverHappen } from "../utils";
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
import type { GenReturn } from "./utils";
import { dailyDateFormat, generateKeyPositionedBetween } from "./utils";
import { registerSpaceSyncableTable } from "./syncMap";
import { registerModelSlice, AnyModelType } from "./maps";
import { appSlice } from "./app";
import { isTask, cardsTasksSlice, type Task } from "./cardsTasks";
import { projectCategoryCardsSlice } from "./projectsCategoriesCards";
import { dailyListsSlice } from "./dailyLists";
import { parse } from "date-fns";

// Type definitions
// projection.id = task.id (1:1 relationship)
export const projectionType = "projection";

export type TaskProjection = {
  type: typeof projectionType;
  id: string; // Same as task.id
  orderToken: string;
  dailyListId: string;
  createdAt: number;
};

export const isTaskProjection = isObjectType<TaskProjection>(projectionType);

export const defaultTaskProjection: TaskProjection = {
  type: projectionType,
  id: "default-projection-id",
  orderToken: "",
  dailyListId: "",
  createdAt: 0,
};

// Table definition
export const taskProjectionsTable = table<TaskProjection>(
  "task_projections",
).withIndexes({
  byId: { cols: ["id"], type: "hash" },
  byIds: { cols: ["id"], type: "btree" },
  byDailyListId: { cols: ["dailyListId"], type: "hash" },
  byDailyListIdTokenOrdered: {
    cols: ["dailyListId", "orderToken"],
    type: "btree",
  },
});
registerSpaceSyncableTable(taskProjectionsTable, projectionType);

// Slice
export const dailyListsProjectionsSlice = {
  // SELECTORS
  allIds: selector(function* (): GenReturn<string[]> {
    const projections = yield* runQuery(
      selectFrom(taskProjectionsTable, "byIds").where((q) => q),
    );
    return projections.map((p) => p.id);
  }),

  byId: selector(function* (id: string): GenReturn<TaskProjection | undefined> {
    const projections = yield* runQuery(
      selectFrom(taskProjectionsTable, "byId")
        .where((q) => q.eq("id", id))
        .limit(1),
    );
    return projections[0];
  }),

  byIds: selector(function* (ids: string[]): GenReturn<TaskProjection[]> {
    const projections = yield* runQuery(
      selectFrom(taskProjectionsTable, "byId").where((q) =>
        ids.map((id) => q.eq("id", id)),
      ),
    );
    return projections;
  }),

  byIdOrDefault: selector(function* (id: string): GenReturn<TaskProjection> {
    return (
      (yield* dailyListsProjectionsSlice.byId(id)) || defaultTaskProjection
    );
  }),

  // Get projection for a task (since id = taskId, this is the same as byId)
  byTaskId: selector(function* (
    taskId: string,
  ): GenReturn<TaskProjection | undefined> {
    return yield* dailyListsProjectionsSlice.byId(taskId);
  }),

  // Check if a task has a projection (is in a daily list)
  hasProjection: selector(function* (taskId: string): GenReturn<boolean> {
    const projection = yield* dailyListsProjectionsSlice.byId(taskId);
    return projection !== undefined;
  }),

  // Get all projections for a daily list
  byDailyListId: selector(function* (
    dailyListId: string,
  ): GenReturn<TaskProjection[]> {
    return yield* runQuery(
      selectFrom(taskProjectionsTable, "byDailyListIdTokenOrdered").where((q) =>
        q.eq("dailyListId", dailyListId),
      ),
    );
  }),

  // Get all task ids in a specific daily list (non-done, ordered)
  childrenIds: selector(function* (dailyListId: string): GenReturn<string[]> {
    const projections =
      yield* dailyListsProjectionsSlice.byDailyListId(dailyListId);

    const result: string[] = [];
    for (const proj of projections) {
      const task = yield* cardsTasksSlice.byId(proj.id);
      if (task && task.state === "todo") {
        result.push(proj.id);
      }
    }

    return result;
  }),

  getDateOfTask: selector(function* (
    taskId: string,
  ): GenReturn<Date | undefined> {
    const projection = yield* dailyListsProjectionsSlice.byTaskId(taskId);
    if (!projection) return undefined;

    const list = yield* dailyListsSlice.byId(projection.dailyListId);
    if (!list) return undefined;

    return parse(list.date, dailyDateFormat, new Date());
  }),

  // Get all done task ids in a daily list (sorted by lastToggledAt)
  doneChildrenIds: selector(function* (
    dailyListId: string,
  ): GenReturn<string[]> {
    const projections =
      yield* dailyListsProjectionsSlice.byDailyListId(dailyListId);

    const doneTasks: { id: string; lastToggledAt: number }[] = [];
    for (const proj of projections) {
      const task = yield* cardsTasksSlice.byId(proj.id);
      if (task && task.state === "done") {
        doneTasks.push({ id: proj.id, lastToggledAt: task.lastToggledAt });
      }
    }

    return doneTasks
      .sort((a, b) => b.lastToggledAt - a.lastToggledAt)
      .map((t) => t.id);
  }),

  // Get first task in daily list
  firstChild: selector(function* (
    dailyListId: string,
  ): GenReturn<Task | undefined> {
    const childrenIds =
      yield* dailyListsProjectionsSlice.childrenIds(dailyListId);
    const firstChildId = childrenIds[0];
    return firstChildId ? yield* cardsTasksSlice.byId(firstChildId) : undefined;
  }),

  // Get last task in daily list
  lastChild: selector(function* (
    dailyListId: string,
  ): GenReturn<Task | undefined> {
    const childrenIds =
      yield* dailyListsProjectionsSlice.childrenIds(dailyListId);
    const lastChildId = childrenIds[childrenIds.length - 1];
    return lastChildId ? yield* cardsTasksSlice.byId(lastChildId) : undefined;
  }),

  // Get siblings of a task within its daily list
  siblings: selector(function* (
    taskId: string,
  ): GenReturn<[TaskProjection | undefined, TaskProjection | undefined]> {
    const projection = yield* dailyListsProjectionsSlice.byTaskId(taskId);
    if (!projection) return [undefined, undefined];

    const sortedProjections = yield* dailyListsProjectionsSlice.byDailyListId(
      projection.dailyListId,
    );

    const index = sortedProjections.findIndex((p) => p.id === taskId);

    const before = index > 0 ? sortedProjections[index - 1] : undefined;
    const after =
      index < sortedProjections.length - 1
        ? sortedProjections[index + 1]
        : undefined;

    return [before, after];
  }),

  // Check if a projection can accept another model being dropped
  canDrop: selector(function* (
    projectionId: string,
    dropId: string,
    dropModelType: AnyModelType,
  ): GenReturn<boolean> {
    const model = yield* appSlice.byId(dropId, dropModelType);
    if (!model) return false;

    const projection = yield* dailyListsProjectionsSlice.byId(projectionId);
    if (!projection) return false;

    const task = yield* cardsTasksSlice.byId(projection.id);
    if (!task) return false;

    // Only allow dropping todo tasks
    if (task.state === "done") return false;

    // Check if dropping a task directly
    if (isTask(model)) {
      return model.state === "todo";
    }

    // Check if dropping a projection (task in daily list)
    if (isTaskProjection(model)) {
      const droppedTask = yield* cardsTasksSlice.byId(model.id);
      return droppedTask !== undefined && droppedTask.state === "todo";
    }

    return false;
  }),

  // ACTIONS

  // Handle drop operations
  handleDrop: action(function* (
    projectionId: string,
    dropId: string,
    dropModelType: AnyModelType,
    edge: "top" | "bottom",
  ): GenReturn<void> {
    const canDrop = yield* dailyListsProjectionsSlice.canDrop(
      projectionId,
      dropId,
      dropModelType,
    );
    if (!canDrop) return;

    const projection = yield* dailyListsProjectionsSlice.byId(projectionId);
    if (!projection) return;

    const dropItem = yield* appSlice.byId(dropId, dropModelType);
    if (!dropItem) return;

    const [up, down] = yield* dailyListsProjectionsSlice.siblings(
      projection.id,
    );

    let between: [string | undefined, string | undefined] = [
      projection.orderToken,
      down?.orderToken,
    ];

    if (edge === "top") {
      between = [up?.orderToken, projection.orderToken];
    }

    const orderToken = generateJitteredKeyBetween(
      between[0] || null,
      between[1] || null,
    );

    if (isTask(dropItem)) {
      yield* dailyListsProjectionsSlice.upsert({
        id: dropItem.id,
        dailyListId: projection.dailyListId,
        orderToken,
      });
    } else if (isTaskProjection(dropItem)) {
      yield* dailyListsProjectionsSlice.upsert({
        id: dropItem.id, // projection.id is the same as task.id
        dailyListId: projection.dailyListId,
        orderToken,
      });
    } else {
      shouldNeverHappen("unknown drop item type", dropItem);
    }
  }),

  delete: action(function* (ids: string[]): GenReturn<void> {
    yield* deleteRows(taskProjectionsTable, ids);
  }),

  create: action(function* (projection: {
    id: string; // This should be the task.id
    dailyListId: string;
    orderToken: string;
  }): GenReturn<TaskProjection> {
    const newProjection: TaskProjection = {
      type: projectionType,
      id: projection.id,
      dailyListId: projection.dailyListId,
      orderToken: projection.orderToken,
      createdAt: Date.now(),
    };

    yield* insert(taskProjectionsTable, [newProjection]);
    return newProjection;
  }),

  update: action(function* (
    id: string,
    projection: Partial<TaskProjection>,
  ): GenReturn<void> {
    const projInState = yield* dailyListsProjectionsSlice.byId(id);
    if (!projInState) throw new Error("Projection not found");

    yield* update(taskProjectionsTable, [{ ...projInState, ...projection }]);
  }),

  // Create or update projection for a task
  upsert: action(function* (projection: {
    id: string;
    dailyListId: string;
    orderToken: string;
  }): GenReturn<TaskProjection> {
    const existing = yield* dailyListsProjectionsSlice.byId(projection.id);

    if (existing) {
      yield* dailyListsProjectionsSlice.update(projection.id, {
        dailyListId: projection.dailyListId,
        orderToken: projection.orderToken,
      });
      return yield* dailyListsProjectionsSlice.byIdOrDefault(projection.id);
    }

    return yield* dailyListsProjectionsSlice.create(projection);
  }),

  // Create a sibling task in the daily list
  createSibling: action(function* (
    taskId: string,
    position: "before" | "after",
    taskParams?: Partial<Task>,
  ): GenReturn<TaskProjection> {
    const task = yield* cardsTasksSlice.byId(taskId);
    if (!task) throw new Error("Task not found");

    const projection = yield* dailyListsProjectionsSlice.byTaskId(taskId);
    if (!projection) throw new Error("Task not in daily list");

    // Create task in project first
    const newTask = yield* projectCategoryCardsSlice.createSiblingTask(
      taskId,
      position,
      taskParams,
    );

    // Add to daily list with proper ordering
    const siblings = yield* dailyListsProjectionsSlice.siblings(taskId);
    const dailyListOrderToken = generateKeyPositionedBetween(
      projection,
      siblings,
      position,
    );

    return yield* dailyListsProjectionsSlice.create({
      id: newTask.id,
      dailyListId: projection.dailyListId,
      orderToken: dailyListOrderToken,
    });
  }),

  // Remove task from daily list
  removeFromDailyList: action(function* (taskId: string): GenReturn<void> {
    yield* dailyListsProjectionsSlice.delete([taskId]);
  }),

  // Add task to daily list
  addToDailyList: action(function* (
    taskId: string,
    dailyListId: string,
    position:
      | "append"
      | "prepend"
      | [TaskProjection | undefined, TaskProjection | undefined],
  ): GenReturn<void> {
    const task = yield* cardsTasksSlice.byId(taskId);
    if (!task) throw new Error("Task not found");

    let orderToken: string;

    if (position === "append") {
      const projections =
        yield* dailyListsProjectionsSlice.byDailyListId(dailyListId);
      const lastToken =
        projections.length > 0
          ? projections[projections.length - 1].orderToken
          : null;
      orderToken = generateJitteredKeyBetween(lastToken, null);
    } else if (position === "prepend") {
      const projections =
        yield* dailyListsProjectionsSlice.byDailyListId(dailyListId);
      const firstToken =
        projections.length > 0 ? projections[0].orderToken : null;
      orderToken = generateJitteredKeyBetween(null, firstToken);
    } else {
      orderToken = generateJitteredKeyBetween(
        position[0]?.orderToken || null,
        position[1]?.orderToken || null,
      );
    }

    yield* dailyListsProjectionsSlice.upsert({
      id: taskId,
      dailyListId,
      orderToken,
    });
  }),
};

registerModelSlice(
  dailyListsProjectionsSlice,
  taskProjectionsTable,
  projectionType,
);
