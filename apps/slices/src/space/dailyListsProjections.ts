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
import { dailyDateFormat, generateKeyPositionedBetween } from "./utils";
import { registerSpaceSyncableTable } from "./syncMap";
import { registerModelSlice, AnyModelType } from "./maps";
import { appSlice } from ".";
import { cardsTasksSlice } from ".";
import { isTask, type Task } from "./cardsTasks";
import { projectCategoryCardsSlice } from ".";
import { dailyListsSlice } from ".";
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

// Selectors and actions
export const allIds = selector(function* () {
  const projections = yield* runQuery(
    selectFrom(taskProjectionsTable, "byIds").where((q) => q),
  );
  return projections.map((p) => p.id);
});

export const byId = selector(function* (id: string) {
  const projections = yield* runQuery(
    selectFrom(taskProjectionsTable, "byId")
      .where((q) => q.eq("id", id))
      .limit(1),
  );
  return projections[0] as TaskProjection | undefined;
});

export const byIds = selector(function* (ids: string[]) {
  const projections = yield* runQuery(
    selectFrom(taskProjectionsTable, "byId").where((q) =>
      ids.map((id) => q.eq("id", id)),
    ),
  );
  return projections as TaskProjection[];
});

export const byIdOrDefault = selector(function* (id: string) {
  return (yield* byId(id)) || defaultTaskProjection;
});

// Get projection for a task (since id = taskId, this is the same as byId)
export const byTaskId = selector(function* (taskId: string) {
  return yield* byId(taskId);
});

// Check if a task has a projection (is in a daily list)
export const hasProjection = selector(function* (taskId: string) {
  const projection = yield* byId(taskId);
  return projection !== undefined;
});

// Get all projections for a daily list
export const byDailyListId = selector(function* (dailyListId: string) {
  return (yield* runQuery(
    selectFrom(taskProjectionsTable, "byDailyListIdTokenOrdered").where((q) =>
      q.eq("dailyListId", dailyListId),
    ),
  )) as TaskProjection[];
});

// Get all task ids in a specific daily list (non-done, ordered)
export const childrenIds = selector(function* (
  dailyListId: string,
): Generator<unknown, string[], unknown> {
  const projections = yield* byDailyListId(dailyListId);

  const result: string[] = [];
  for (const proj of projections) {
    const task = yield* cardsTasksSlice.byId(proj.id);
    if (task && task.state === "todo") {
      result.push(proj.id);
    }
  }

  return result;
});

export const getDateOfTask = selector(function* (
  taskId: string,
): Generator<unknown, Date | undefined, unknown> {
  const projection = yield* byTaskId(taskId);
  if (!projection) return undefined as Date | undefined;

  const list = yield* dailyListsSlice.byId(projection.dailyListId);
  if (!list) return undefined as Date | undefined;

  return parse(list.date, dailyDateFormat, new Date());
});

// Get all done task ids in a daily list (sorted by lastToggledAt)
export const doneChildrenIds = selector(function* (
  dailyListId: string,
): Generator<unknown, string[], unknown> {
  const projections = yield* byDailyListId(dailyListId);

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
});

// Get first task in daily list
export const firstChild = selector(function* (
  dailyListId: string,
): Generator<unknown, Task | undefined, unknown> {
  const ids = yield* childrenIds(dailyListId);
  const firstChildId = ids[0];
  return firstChildId
    ? yield* cardsTasksSlice.byId(firstChildId)
    : (undefined as Task | undefined);
});

// Get last task in daily list
export const lastChild = selector(function* (
  dailyListId: string,
): Generator<unknown, Task | undefined, unknown> {
  const ids = yield* childrenIds(dailyListId);
  const lastChildId = ids[ids.length - 1];
  return lastChildId
    ? yield* cardsTasksSlice.byId(lastChildId)
    : (undefined as Task | undefined);
});

// Get siblings of a task within its daily list
export const siblings = selector(function* (taskId: string) {
  const projection = yield* byTaskId(taskId);
  if (!projection)
    return [undefined, undefined] as [
      TaskProjection | undefined,
      TaskProjection | undefined,
    ];

  const sortedProjections = yield* byDailyListId(projection.dailyListId);

  const index = sortedProjections.findIndex((p) => p.id === taskId);

  const before = index > 0 ? sortedProjections[index - 1] : undefined;
  const after =
    index < sortedProjections.length - 1
      ? sortedProjections[index + 1]
      : undefined;

  return [before, after] as [
    TaskProjection | undefined,
    TaskProjection | undefined,
  ];
});

// Check if a projection can accept another model being dropped
export const canDrop = selector(function* (
  projectionId: string,
  dropId: string,
  dropModelType: AnyModelType,
): Generator<unknown, boolean, unknown> {
  const model = yield* appSlice.byId(dropId, dropModelType);
  if (!model) return false;

  const projection = yield* byId(projectionId);
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
});

// Handle drop operations
export const handleDrop = action(function* (
  projectionId: string,
  dropId: string,
  dropModelType: AnyModelType,
  edge: "top" | "bottom",
): Generator<unknown, void, unknown> {
  const canDropResult = yield* canDrop(projectionId, dropId, dropModelType);
  if (!canDropResult) return;

  const projection = yield* byId(projectionId);
  if (!projection) return;

  const dropItem = yield* appSlice.byId(dropId, dropModelType);
  if (!dropItem) return;

  const [up, down] = yield* siblings(projection.id);

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
    yield* upsert({
      id: dropItem.id,
      dailyListId: projection.dailyListId,
      orderToken,
    });
  } else if (isTaskProjection(dropItem)) {
    yield* upsert({
      id: dropItem.id, // projection.id is the same as task.id
      dailyListId: projection.dailyListId,
      orderToken,
    });
  } else {
    shouldNeverHappen("unknown drop item type", dropItem);
  }
});

export const deleteProjections = action(function* (ids: string[]) {
  yield* deleteRows(taskProjectionsTable, ids);
});

export const createProjection = action(function* (projection: {
  id: string; // This should be the task.id
  dailyListId: string;
  orderToken: string;
}) {
  const newProjection: TaskProjection = {
    type: projectionType,
    id: projection.id,
    dailyListId: projection.dailyListId,
    orderToken: projection.orderToken,
    createdAt: Date.now(),
  };

  yield* insert(taskProjectionsTable, [newProjection]);
  return newProjection;
});

export const updateProjection = action(function* (
  id: string,
  projection: Partial<TaskProjection>,
): Generator<unknown, void, unknown> {
  const projInState = yield* byId(id);
  if (!projInState) throw new Error("Projection not found");

  yield* update(taskProjectionsTable, [{ ...projInState, ...projection }]);
});

// Create or update projection for a task
export const upsert = action(function* (projection: {
  id: string;
  dailyListId: string;
  orderToken: string;
}) {
  const existing = yield* byId(projection.id);

  if (existing) {
    yield* updateProjection(projection.id, {
      dailyListId: projection.dailyListId,
      orderToken: projection.orderToken,
    });
    return yield* byIdOrDefault(projection.id);
  }

  return yield* createProjection(projection);
});

// Create a sibling task in the daily list
export const createSibling = action(function* (
  taskId: string,
  position: "before" | "after",
  taskParams?: Partial<Task>,
) {
  const task = yield* cardsTasksSlice.byId(taskId);
  if (!task) throw new Error("Task not found");

  const projection = yield* byTaskId(taskId);
  if (!projection) throw new Error("Task not in daily list");

  // Create task in project first
  const newTask = yield* projectCategoryCardsSlice.createSiblingTask(
    taskId,
    position,
    taskParams,
  );

  // Add to daily list with proper ordering
  const sibs = yield* siblings(taskId);
  const dailyListOrderToken = generateKeyPositionedBetween(
    projection,
    sibs,
    position,
  );

  return yield* createProjection({
    id: newTask.id,
    dailyListId: projection.dailyListId,
    orderToken: dailyListOrderToken,
  });
});

// Remove task from daily list
export const removeFromDailyList = action(function* (taskId: string) {
  yield* deleteProjections([taskId]);
});

// Add task to daily list
export const addToDailyList = action(function* (
  taskId: string,
  dailyListId: string,
  position:
    | "append"
    | "prepend"
    | [TaskProjection | undefined, TaskProjection | undefined],
): Generator<unknown, void, unknown> {
  const task = yield* cardsTasksSlice.byId(taskId);
  if (!task) throw new Error("Task not found");

  let orderToken: string;

  if (position === "append") {
    const projections = yield* byDailyListId(dailyListId);
    const lastToken =
      projections.length > 0
        ? projections[projections.length - 1].orderToken
        : null;
    orderToken = generateJitteredKeyBetween(lastToken, null);
  } else if (position === "prepend") {
    const projections = yield* byDailyListId(dailyListId);
    const firstToken =
      projections.length > 0 ? projections[0].orderToken : null;
    orderToken = generateJitteredKeyBetween(null, firstToken);
  } else {
    orderToken = generateJitteredKeyBetween(
      position[0]?.orderToken || null,
      position[1]?.orderToken || null,
    );
  }

  yield* upsert({
    id: taskId,
    dailyListId,
    orderToken,
  });
});

registerModelSlice(
  {
    byId,
    delete: deleteProjections,
    canDrop,
    handleDrop,
  },
  taskProjectionsTable,
  projectionType,
);
