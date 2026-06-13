import { isObjectType } from "../utils";
import { shouldNeverHappen } from "../utils";
import {
  action,
  deleteRows,
  defineTable,
  type ExtractSchema,
  insert,
  selectFrom,
  selector,
  upsert as upsertRows,
  v,
} from "@will-be-done/hyperdb-lib";
import { generateJitteredKeyBetween } from "fractional-indexing-jittered";
import { dailyDateFormat, generateKeyPositionedBetween } from "./utils";
import { registerSpaceSyncableTable } from "./syncMap";
import { registerModelSlice, AnyModelType } from "./maps";
import { appById } from "./app";
import { dailyListById, createDailyListIfNotPresent } from "./dailyLists";
import {
  createSiblingTask,
  projectCategoryCardsForDisplay,
  type CardForDisplay,
} from "./projectsCategoriesCards";
import { deleteStashProjections } from "./stashProjections";
import { taskById } from "./cardsTasks";

import { isTask, type Task, tasksTable } from "./cardsTasks";


import { isStashProjection } from "./stashProjections";

import { parse } from "date-fns";

// Type definitions
// projection.id = task.id (1:1 relationship)
export const projectionType = "projection";

export const taskProjectionsTable = defineTable("task_projections", {
  type: v.literal(projectionType),
  id: v.string(),
  orderToken: v.string(),
  dailyListId: v.string(),
  createdAt: v.number(),
})
  .index("byIds", ["id"])
  .index("byDailyListId", ["dailyListId"], { type: "hash" })
  .index("byDailyListIdTokenOrdered", ["dailyListId", "orderToken"]);
export type TaskProjection = ExtractSchema<typeof taskProjectionsTable>;

export const isTaskProjection = isObjectType<TaskProjection>(projectionType);

export const defaultTaskProjection: TaskProjection = {
  type: projectionType,
  id: "default-projection-id",
  orderToken: "",
  dailyListId: "",
  createdAt: 0,
};

registerSpaceSyncableTable(taskProjectionsTable, projectionType);

// Selectors and actions
export const dailyProjectionAllIds = selector(function* dailyProjectionAllIds() {
  const projections = yield* selectFrom(taskProjectionsTable, "byIds").where((q) => q);
  return projections.map((p) => p.id);
});

export const dailyProjectionById = selector(function* dailyProjectionById(id: string) {
  const projections = yield* selectFrom(taskProjectionsTable, "byId")
      .where((q) => q.eq("id", id))
      .limit(1);
  return projections[0] as TaskProjection | undefined;
});

export const dailyProjectionsByIds = selector(function* dailyProjectionsByIds(ids: string[]) {
  const projections = yield* selectFrom(taskProjectionsTable, "byId").where((q) =>
      ids.map((id) => q.eq("id", id)),
    );
  return projections as TaskProjection[];
});

export const dailyProjectionByIdOrDefault = selector(function* dailyProjectionByIdOrDefault(id: string) {
  return (yield* dailyProjectionById(id)) || defaultTaskProjection;
});

// Get projection for a task (since id = taskId, this is the same as byId)
export const dailyProjectionByTaskId = selector(function* dailyProjectionByTaskId(taskId: string) {
  return yield* dailyProjectionById(taskId);
});

// Check if a task has a projection (is in a daily list)
export const dailyListHasProjection = selector(function* dailyListHasProjection(taskId: string) {
  const projection = yield* dailyProjectionById(taskId);
  return projection !== undefined;
});

// Get all projections for a daily list
export const dailyProjectionsByDailyListId = selector(function* dailyProjectionsByDailyListId(dailyListId: string) {
  return (yield* selectFrom(taskProjectionsTable, "byDailyListIdTokenOrdered").where((q) =>
      q.eq("dailyListId", dailyListId),
    )) as TaskProjection[];
});

// Get all task ids in a specific daily list (non-done, ordered)
export const dailyProjectionChildrenIds = selector(function* dailyProjectionChildrenIds(
  dailyListId: string,
): Generator<unknown, string[], unknown> {
  const projections = yield* dailyProjectionsByDailyListId(dailyListId);

  const result: string[] = [];
  for (const proj of projections) {
    const task = yield* taskById(proj.id);
    if (task && task.state === "todo") {
      result.push(proj.id);
    }
  }

  return result;
});

export const dailyProjectionChildrenForDisplay = selector(function* dailyProjectionChildrenForDisplay(
  dailyListId: string,
): Generator<unknown, CardForDisplay[], unknown> {
  const projections = yield* dailyProjectionsByDailyListId(dailyListId);
  const projectionIds = projections.map((projection) => projection.id);
  const tasks = projectionIds.length
    ? yield* selectFrom(tasksTable, "byId").where((q) =>
          projectionIds.map((id) => q.eq("id", id)),
        )
    : [];
  const taskMap = new Map((tasks as Task[]).map((task) => [task.id, task]));

  const cards: Task[] = [];
  const cardWrappers: TaskProjection[] = [];
  for (const projection of projections) {
    const task = taskMap.get(projection.id);
    if (task && task.state === "todo") {
      cards.push(task);
      cardWrappers.push(projection);
    }
  }

  return yield* projectCategoryCardsForDisplay(cards, cardWrappers);
});

export const dailyProjectionDateOfTask = selector(function* dailyProjectionDateOfTask(
  taskId: string,
): Generator<unknown, Date | undefined, unknown> {
  const projection = yield* dailyProjectionByTaskId(taskId);
  if (!projection) return undefined as Date | undefined;

  const list = yield* dailyListById(projection.dailyListId);
  if (!list) return undefined as Date | undefined;

  return parse(list.date, dailyDateFormat, new Date());
});

// Get all done task ids in a daily list (sorted by lastToggledAt)
export const doneDailyProjectionChildrenIds = selector(function* doneDailyProjectionChildrenIds(
  dailyListId: string,
): Generator<unknown, string[], unknown> {
  const projections = yield* dailyProjectionsByDailyListId(dailyListId);

  const doneTasks: { id: string; lastToggledAt: number }[] = [];
  for (const proj of projections) {
    const task = yield* taskById(proj.id);
    if (task && task.state === "done") {
      doneTasks.push({ id: proj.id, lastToggledAt: task.lastToggledAt });
    }
  }

  return doneTasks
    .sort((a, b) => b.lastToggledAt - a.lastToggledAt)
    .map((t) => t.id);
});

export const doneDailyProjectionChildrenForDisplay = selector(function* doneDailyProjectionChildrenForDisplay(
  dailyListId: string,
): Generator<unknown, CardForDisplay[], unknown> {
  const projections = yield* dailyProjectionsByDailyListId(dailyListId);
  const projectionIds = projections.map((projection) => projection.id);
  const tasks = projectionIds.length
    ? yield* selectFrom(tasksTable, "byId").where((q) =>
          projectionIds.map((id) => q.eq("id", id)),
        )
    : [];
  const taskMap = new Map((tasks as Task[]).map((task) => [task.id, task]));

  const cardsWithProjections: {
    card: Task;
    cardWrapper: TaskProjection;
  }[] = [];
  for (const projection of projections) {
    const task = taskMap.get(projection.id);
    if (task && task.state === "done") {
      cardsWithProjections.push({ card: task, cardWrapper: projection });
    }
  }

  cardsWithProjections.sort(
    (a, b) => b.card.lastToggledAt - a.card.lastToggledAt,
  );

  return yield* projectCategoryCardsForDisplay(
    cardsWithProjections.map(({ card }) => card),
    cardsWithProjections.map(({ cardWrapper }) => cardWrapper),
  );
});

// Get first task in daily list
export const firstDailyProjectionChild = selector(function* firstDailyProjectionChild(
  dailyListId: string,
): Generator<unknown, Task | undefined, unknown> {
  const ids = yield* dailyProjectionChildrenIds(dailyListId);
  const firstChildId = ids[0];
  return firstChildId
    ? yield* taskById(firstChildId)
    : (undefined as Task | undefined);
});

// Get last task in daily list
export const lastDailyProjectionChild = selector(function* lastDailyProjectionChild(
  dailyListId: string,
): Generator<unknown, Task | undefined, unknown> {
  const ids = yield* dailyProjectionChildrenIds(dailyListId);
  const lastChildId = ids[ids.length - 1];
  return lastChildId
    ? yield* taskById(lastChildId)
    : (undefined as Task | undefined);
});

// Get siblings of a task within its daily list
export const dailyProjectionSiblings = selector(function* dailyProjectionSiblings(taskId: string) {
  const projection = yield* dailyProjectionByTaskId(taskId);
  if (!projection)
    return [undefined, undefined] as [
      TaskProjection | undefined,
      TaskProjection | undefined,
    ];

  const sortedProjections = yield* dailyProjectionsByDailyListId(projection.dailyListId);

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
export const dailyProjectionCanDrop = selector(function* dailyProjectionCanDrop(
  projectionId: string,
  dropId: string,
  dropModelType: AnyModelType,
): Generator<unknown, boolean, unknown> {
  const model = yield* appById(dropId, dropModelType);
  if (!model) return false;

  const projection = yield* dailyProjectionById(projectionId);
  if (!projection) return false;

  const task = yield* taskById(projection.id);
  if (!task) return false;

  // Only allow dropping todo tasks
  if (task.state === "done") return false;

  // Check if dropping a task directly
  if (isTask(model)) {
    return model.state === "todo";
  }

  // Check if dropping a projection (task in daily list)
  if (isTaskProjection(model)) {
    const droppedTask = yield* taskById(model.id);
    return droppedTask !== undefined && droppedTask.state === "todo";
  }

  // Check if dropping a stash projection
  if (isStashProjection(model)) {
    const droppedTask = yield* taskById(model.id);
    return droppedTask !== undefined && droppedTask.state === "todo";
  }

  return false;
});

// Handle drop operations
export const dailyProjectionHandleDrop = action(function* dailyProjectionHandleDrop(
  projectionId: string,
  dropId: string,
  dropModelType: AnyModelType,
  edge: "top" | "bottom",
): Generator<unknown, void, unknown> {
  const canDropResult = yield* dailyProjectionCanDrop(projectionId, dropId, dropModelType);
  if (!canDropResult) return;

  const projection = yield* dailyProjectionById(projectionId);
  if (!projection) return;

  const dropItem = yield* appById(dropId, dropModelType);
  if (!dropItem) return;

  const [up, down] = yield* dailyProjectionSiblings(projection.id);

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
    yield* upsertDailyProjection({
      id: dropItem.id,
      dailyListId: projection.dailyListId,
      orderToken,
    });
  } else if (isTaskProjection(dropItem)) {
    yield* upsertDailyProjection({
      id: dropItem.id, // projection.id is the same as task.id
      dailyListId: projection.dailyListId,
      orderToken,
    });
  } else if (isStashProjection(dropItem)) {
    yield* upsertDailyProjection({
      id: dropItem.id,
      dailyListId: projection.dailyListId,
      orderToken,
    });
    yield* deleteStashProjections([dropItem.id]);
  } else {
    shouldNeverHappen("unknown drop item type", dropItem);
  }
});

export const deleteDailyProjections = action(function* deleteDailyProjections(ids: string[]) {
  yield* deleteRows(taskProjectionsTable, ids);
});

export const createDailyProjection = action(function* createDailyProjection(projection: {
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

export const updateDailyProjection = action(function* updateDailyProjection(
  id: string,
  projection: Partial<TaskProjection>,
): Generator<unknown, void, unknown> {
  const projInState = yield* dailyProjectionById(id);
  if (!projInState) throw new Error("Projection not found");

  yield* upsertRows(taskProjectionsTable, [{ ...projInState, ...projection }]);
});

// Create or update projection for a task
export const upsertDailyProjection = action(function* upsertDailyProjection(projection: {
  id: string;
  dailyListId: string;
  orderToken: string;
}) {
  const existing = yield* dailyProjectionById(projection.id);

  if (existing) {
    yield* updateDailyProjection(projection.id, {
      dailyListId: projection.dailyListId,
      orderToken: projection.orderToken,
    });
    return yield* dailyProjectionByIdOrDefault(projection.id);
  }

  return yield* createDailyProjection(projection);
});

// Create a sibling task in the daily list
export const createDailyProjectionSibling = action(function* createDailyProjectionSibling(
  taskId: string,
  position: "before" | "after",
  taskParams?: Partial<Task>,
) {
  const task = yield* taskById(taskId);
  if (!task) throw new Error("Task not found");

  const projection = yield* dailyProjectionByTaskId(taskId);
  if (!projection) throw new Error("Task not in daily list");

  // Create task in project first
  const newTask = yield* createSiblingTask(
    taskId,
    position,
    taskParams,
  );

  // Add to daily list with proper ordering
  const sibs = yield* dailyProjectionSiblings(taskId);
  const dailyListOrderToken = generateKeyPositionedBetween(
    projection,
    sibs,
    position,
  );

  return yield* createDailyProjection({
    id: newTask.id,
    dailyListId: projection.dailyListId,
    orderToken: dailyListOrderToken,
  });
});

// Remove task from daily list
export const removeFromDailyList = action(function* removeFromDailyList(taskId: string) {
  yield* deleteDailyProjections([taskId]);
});

// Create projection at the top of a daily list (ensures daily list exists)
export const createProjectionInDailyList = action(function* createProjectionInDailyList(
  taskId: string,
  date: string,
) {
  const dailyList = yield* createDailyListIfNotPresent(date);

  const projections = yield* dailyProjectionsByDailyListId(dailyList.id);
  const firstToken = projections.length > 0 ? projections[0].orderToken : null;
  const orderToken = generateJitteredKeyBetween(null, firstToken);

  return yield* createDailyProjection({
    id: taskId,
    dailyListId: dailyList.id,
    orderToken,
  });
});

// Add task to daily list
export const addToDailyList = action(function* addToDailyList(
  taskId: string,
  dailyListId: string,
  position:
    | "append"
    | "prepend"
    | [TaskProjection | undefined, TaskProjection | undefined],
): Generator<unknown, void, unknown> {
  const task = yield* taskById(taskId);
  if (!task) throw new Error("Task not found");

  let orderToken: string;

  if (position === "append") {
    const projections = yield* dailyProjectionsByDailyListId(dailyListId);
    const lastToken =
      projections.length > 0
        ? projections[projections.length - 1].orderToken
        : null;
    orderToken = generateJitteredKeyBetween(lastToken, null);
  } else if (position === "prepend") {
    const projections = yield* dailyProjectionsByDailyListId(dailyListId);
    const firstToken =
      projections.length > 0 ? projections[0].orderToken : null;
    orderToken = generateJitteredKeyBetween(null, firstToken);
  } else {
    orderToken = generateJitteredKeyBetween(
      position[0]?.orderToken || null,
      position[1]?.orderToken || null,
    );
  }

  yield* upsertDailyProjection({
    id: taskId,
    dailyListId,
    orderToken,
  });
});

registerModelSlice(
  {
    byId: dailyProjectionById,
    delete: deleteDailyProjections,
    canDrop: dailyProjectionCanDrop,
    handleDrop: dailyProjectionHandleDrop,
  },
  taskProjectionsTable,
  projectionType,
);
