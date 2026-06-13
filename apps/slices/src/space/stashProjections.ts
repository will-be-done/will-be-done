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
import { generateKeyPositionedBetween } from "./utils";
import { registerSpaceSyncableTable } from "./syncMap";
import { registerModelSlice, AnyModelType } from "./maps";
import { appById } from "./app";
import { createProjectTask } from "./projects";
import { createSiblingTask } from "./projectsCategoriesCards";
import { deleteDailyProjections } from "./dailyListsProjections";
import {
  taskById,
  taskByIdOrDefault,
} from "./cardsTasks";


import { isTask, type Task } from "./cardsTasks";

import { isTaskProjection } from "./dailyListsProjections";

import type { OrderableItem } from "./utils";

// Type definitions
// stashProjection.id = task.id (1:1 relationship)
export const stashProjectionType = "stashProjection";

export const stashProjectionsTable = defineTable("stash_projections", {
  type: v.literal(stashProjectionType),
  id: v.string(),
  orderToken: v.string(),
  createdAt: v.number(),
})
  .index("byIds", ["id"])
  .index("byTokenOrdered", ["orderToken"]);
export type StashProjection = ExtractSchema<typeof stashProjectionsTable>;

export const isStashProjection =
  isObjectType<StashProjection>(stashProjectionType);

export const defaultStashProjection: StashProjection = {
  type: stashProjectionType,
  id: "default-stash-projection-id",
  orderToken: "",
  createdAt: 0,
};

registerSpaceSyncableTable(stashProjectionsTable, stashProjectionType);

// Selectors and actions
export const stashProjectionAllIds = selector(function* stashProjectionAllIds() {
  const projections = yield* selectFrom(stashProjectionsTable, "byIds").where((q) => q);
  return projections.map((p) => p.id);
});

export const stashProjectionAllTaskIds = selector(function* stashProjectionAllTaskIds() {
  return new Set(yield* stashProjectionAllIds());
});

export const stashProjectionById = selector(function* stashProjectionById(id: string) {
  const projections = yield* selectFrom(stashProjectionsTable, "byId")
      .where((q) => q.eq("id", id))
      .limit(1);
  return projections[0] as StashProjection | undefined;
});

export const stashProjectionsByIds = selector(function* stashProjectionsByIds(ids: string[]) {
  const projections = yield* selectFrom(stashProjectionsTable, "byId").where((q) =>
      ids.map((id) => q.eq("id", id)),
    );
  return projections as StashProjection[];
});

export const stashProjectionByIdOrDefault = selector(function* stashProjectionByIdOrDefault(id: string) {
  return (yield* stashProjectionById(id)) || defaultStashProjection;
});

// Get all stash projections ordered by token
export const allStashProjectionsOrdered = selector(function* allStashProjectionsOrdered() {
  return (yield* selectFrom(stashProjectionsTable, "byTokenOrdered").where((q) => q)) as StashProjection[];
});

// Check if a task is in the stash
export const stashHasProjection = selector(function* stashHasProjection(taskId: string) {
  const projection = yield* stashProjectionById(taskId);
  return projection !== undefined;
});

// Get all task ids in stash (non-done, ordered)
export const stashProjectionChildrenIds = selector(function* stashProjectionChildrenIds(): Generator<
  unknown,
  string[],
  unknown
> {
  const projections = yield* allStashProjectionsOrdered();

  const result: string[] = [];
  for (const proj of projections) {
    const task = yield* taskById(proj.id);
    if (task && task.state === "todo") {
      result.push(proj.id);
    }
  }

  return result;
});

// Get all done task ids in stash (sorted by lastToggledAt)
export const doneStashProjectionChildrenIds = selector(function* doneStashProjectionChildrenIds(): Generator<
  unknown,
  string[],
  unknown
> {
  const projections = yield* allStashProjectionsOrdered();

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

// Get first task in stash
export const firstStashProjectionChild = selector(function* firstStashProjectionChild(): Generator<
  unknown,
  Task | undefined,
  unknown
> {
  const ids = yield* stashProjectionChildrenIds();
  const firstChildId = ids[0];
  return firstChildId
    ? yield* taskById(firstChildId)
    : (undefined as Task | undefined);
});

// Get last task in stash
export const lastStashProjectionChild = selector(function* lastStashProjectionChild(): Generator<
  unknown,
  Task | undefined,
  unknown
> {
  const ids = yield* stashProjectionChildrenIds();
  const lastChildId = ids[ids.length - 1];
  return lastChildId
    ? yield* taskById(lastChildId)
    : (undefined as Task | undefined);
});

// Get siblings of a task within the stash
export const stashProjectionSiblings = selector(function* stashProjectionSiblings(taskId: string) {
  const projection = yield* stashProjectionById(taskId);
  if (!projection)
    return [undefined, undefined] as [
      StashProjection | undefined,
      StashProjection | undefined,
    ];

  const sortedProjections = yield* allStashProjectionsOrdered();

  const index = sortedProjections.findIndex((p) => p.id === taskId);

  const before = index > 0 ? sortedProjections[index - 1] : undefined;
  const after =
    index < sortedProjections.length - 1
      ? sortedProjections[index + 1]
      : undefined;

  return [before, after] as [
    StashProjection | undefined,
    StashProjection | undefined,
  ];
});

// Check if a stash projection can accept another model being dropped
export const stashProjectionCanDrop = selector(function* stashProjectionCanDrop(
  projectionId: string,
  dropId: string,
  dropModelType: AnyModelType,
): Generator<unknown, boolean, unknown> {
  const model = yield* appById(dropId, dropModelType);
  if (!model) return false;

  const projection = yield* stashProjectionById(projectionId);
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
export const stashProjectionHandleDrop = action(function* stashProjectionHandleDrop(
  projectionId: string,
  dropId: string,
  dropModelType: AnyModelType,
  edge: "top" | "bottom",
): Generator<unknown, void, unknown> {
  const canDropResult = yield* stashProjectionCanDrop(projectionId, dropId, dropModelType);
  if (!canDropResult) return;

  const projection = yield* stashProjectionById(projectionId);
  if (!projection) return;

  const dropItem = yield* appById(dropId, dropModelType);
  if (!dropItem) return;

  const [up, down] = yield* stashProjectionSiblings(projection.id);

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
    yield* upsertStashProjection({
      id: dropItem.id,
      orderToken,
    });
  } else if (isTaskProjection(dropItem)) {
    yield* upsertStashProjection({
      id: dropItem.id,
      orderToken,
    });
    yield* deleteDailyProjections([dropItem.id]);
  } else if (isStashProjection(dropItem)) {
    yield* upsertStashProjection({
      id: dropItem.id,
      orderToken,
    });
  } else {
    shouldNeverHappen("unknown drop item type", dropItem);
  }
});

export const deleteStashProjections = action(function* deleteStashProjections(ids: string[]) {
  yield* deleteRows(stashProjectionsTable, ids);
});

export const createStashProjection = action(function* createStashProjection(projection: {
  id: string; // This should be the task.id
  orderToken: string;
}) {
  const newProjection: StashProjection = {
    type: stashProjectionType,
    id: projection.id,
    orderToken: projection.orderToken,
    createdAt: Date.now(),
  };

  yield* insert(stashProjectionsTable, [newProjection]);
  return newProjection;
});

export const updateStashProjection = action(function* updateStashProjection(
  id: string,
  projection: Partial<StashProjection>,
): Generator<unknown, void, unknown> {
  const projInState = yield* stashProjectionById(id);
  if (!projInState) throw new Error("Stash projection not found");

  yield* upsertRows(stashProjectionsTable, [{ ...projInState, ...projection }]);
});

// Create or update stash projection for a task
export const upsertStashProjection = action(function* upsertStashProjection(projection: {
  id: string;
  orderToken: string;
}) {
  const existing = yield* stashProjectionById(projection.id);

  if (existing) {
    yield* updateStashProjection(projection.id, {
      orderToken: projection.orderToken,
    });
    return yield* stashProjectionByIdOrDefault(projection.id);
  }

  return yield* createStashProjection(projection);
});

// Create a sibling task in the stash
export const createStashProjectionSibling = action(function* createStashProjectionSibling(
  taskId: string,
  position: "before" | "after",
  taskParams?: Partial<Task>,
) {
  const task = yield* taskById(taskId);
  if (!task) throw new Error("Task not found");

  const projection = yield* stashProjectionById(taskId);
  if (!projection) throw new Error("Task not in stash");

  // Create task in project first
  const newTask = yield* createSiblingTask(
    taskId,
    position,
    taskParams,
  );

  // Add to stash with proper ordering
  const sibs = yield* stashProjectionSiblings(taskId);
  const stashOrderToken = generateKeyPositionedBetween(
    projection,
    sibs,
    position,
  );

  return yield* createStashProjection({
    id: newTask.id,
    orderToken: stashOrderToken,
  });
});

// Remove task from stash
export const removeFromStash = action(function* removeFromStash(taskId: string) {
  yield* deleteStashProjections([taskId]);
});

// Add task to stash
export const addToStash = action(function* addToStash(
  taskId: string,
  position:
    | "append"
    | "prepend"
    | [StashProjection | undefined, StashProjection | undefined],
): Generator<unknown, void, unknown> {
  const task = yield* taskById(taskId);
  if (!task) throw new Error("Task not found");

  let orderToken: string;

  if (position === "append") {
    const projections = yield* allStashProjectionsOrdered();
    const lastToken =
      projections.length > 0
        ? projections[projections.length - 1].orderToken
        : null;
    orderToken = generateJitteredKeyBetween(lastToken, null);
  } else if (position === "prepend") {
    const projections = yield* allStashProjectionsOrdered();
    const firstToken =
      projections.length > 0 ? projections[0].orderToken : null;
    orderToken = generateJitteredKeyBetween(null, firstToken);
  } else {
    orderToken = generateJitteredKeyBetween(
      position[0]?.orderToken || null,
      position[1]?.orderToken || null,
    );
  }

  yield* upsertStashProjection({
    id: taskId,
    orderToken,
  });
});

registerModelSlice(
  {
    byId: stashProjectionById,
    delete: deleteStashProjections,
    canDrop: stashProjectionCanDrop,
    handleDrop: stashProjectionHandleDrop,
  },
  stashProjectionsTable,
  stashProjectionType,
);

// --- Column-level "stash" model type ---
// Used as columnModelType in TasksColumn for dropping onto the stash column header.
// No separate table/entity needed — the stash is a singleton concept.

export const stashType = "stash" as const;
export const STASH_ID = "stash-singleton";

// Column-level canDrop: any todo task/projection can be dropped onto the stash column
const stashColumnCanDrop = selector(function* stashColumnCanDrop(
  _stashId: string,
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

// Column-level handleDrop: add dropped task to stash (prepend/append based on edge)
const stashColumnHandleDrop = action(function* stashColumnHandleDrop(
  _stashId: string,
  dropId: string,
  dropModelType: AnyModelType,
  edge: "top" | "bottom",
): Generator<unknown, void, unknown> {
  const drop = yield* appById(dropId, dropModelType);
  if (!drop) return;

  let taskId: string;
  let shouldDeleteProjection = false;
  if (isTask(drop)) {
    taskId = drop.id;
  } else if (isTaskProjection(drop)) {
    taskId = drop.id;
    shouldDeleteProjection = true;
  } else if (isStashProjection(drop)) {
    taskId = drop.id;
  } else {
    return;
  }

  yield* addToStash(taskId, edge === "top" ? "prepend" : "append");

  if (shouldDeleteProjection) {
    yield* deleteStashProjections([taskId]);
  }
});

// Column-level byId: returns the stash projection if it exists, for the column model lookup
const stashColumnById = selector(function* stashColumnById(_id: string) {
  return undefined as StashProjection | undefined;
});

const stashColumnDelete = action(function* stashColumnDelete(_ids: string[]) {
  // No-op: stash is a virtual singleton, nothing to delete
});

// Create a task directly in the stash
export const createTaskInStash = action(function* createTaskInStash(
  projectId: string,
  position:
    | [OrderableItem | undefined, OrderableItem | undefined]
    | "append"
    | "prepend",
  categoryPosition:
    | [OrderableItem | undefined, OrderableItem | undefined]
    | "append"
    | "prepend",
): Generator<unknown, Task, unknown> {
  const task = yield* createProjectTask(projectId, categoryPosition);

  let stashPosition:
    | "append"
    | "prepend"
    | [StashProjection | undefined, StashProjection | undefined];
  if (position === "append" || position === "prepend") {
    stashPosition = position;
  } else {
    stashPosition = [
      position[0] as StashProjection | undefined,
      position[1] as StashProjection | undefined,
    ];
  }

  yield* addToStash(task.id, stashPosition);

  return yield* taskByIdOrDefault(task.id);
});

registerModelSlice(
  {
    byId: stashColumnById,
    delete: stashColumnDelete,
    canDrop: stashColumnCanDrop,
    handleDrop: stashColumnHandleDrop,
  },
  stashProjectionsTable,
  stashType,
);
