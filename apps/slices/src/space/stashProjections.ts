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
import { appSlice } from ".";
import { cardsTasksSlice } from ".";
import { projectsSlice } from ".";
import { isTask, type Task } from "./cardsTasks";
import { projectCategoryCardsSlice } from ".";
import { isTaskProjection } from "./dailyListsProjections";
import { dailyListsProjectionsSlice } from ".";
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
export const allIds = selector(function* allIds() {
  const projections = yield* selectFrom(stashProjectionsTable, "byIds").where((q) => q);
  return projections.map((p) => p.id);
});

export const allTaskIds = selector(function* allTaskIds() {
  return new Set(yield* allIds());
});

export const byId = selector(function* byId(id: string) {
  const projections = yield* selectFrom(stashProjectionsTable, "byId")
      .where((q) => q.eq("id", id))
      .limit(1);
  return projections[0] as StashProjection | undefined;
});

export const byIds = selector(function* byIds(ids: string[]) {
  const projections = yield* selectFrom(stashProjectionsTable, "byId").where((q) =>
      ids.map((id) => q.eq("id", id)),
    );
  return projections as StashProjection[];
});

export const byIdOrDefault = selector(function* byIdOrDefault(id: string) {
  return (yield* byId(id)) || defaultStashProjection;
});

// Get all stash projections ordered by token
export const allOrdered = selector(function* allOrdered() {
  return (yield* selectFrom(stashProjectionsTable, "byTokenOrdered").where((q) => q)) as StashProjection[];
});

// Check if a task is in the stash
export const hasProjection = selector(function* hasProjection(taskId: string) {
  const projection = yield* byId(taskId);
  return projection !== undefined;
});

// Get all task ids in stash (non-done, ordered)
export const childrenIds = selector(function* childrenIds(): Generator<
  unknown,
  string[],
  unknown
> {
  const projections = yield* allOrdered();

  const result: string[] = [];
  for (const proj of projections) {
    const task = yield* cardsTasksSlice.byId(proj.id);
    if (task && task.state === "todo") {
      result.push(proj.id);
    }
  }

  return result;
});

// Get all done task ids in stash (sorted by lastToggledAt)
export const doneChildrenIds = selector(function* doneChildrenIds(): Generator<
  unknown,
  string[],
  unknown
> {
  const projections = yield* allOrdered();

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

// Get first task in stash
export const firstChild = selector(function* firstChild(): Generator<
  unknown,
  Task | undefined,
  unknown
> {
  const ids = yield* childrenIds();
  const firstChildId = ids[0];
  return firstChildId
    ? yield* cardsTasksSlice.byId(firstChildId)
    : (undefined as Task | undefined);
});

// Get last task in stash
export const lastChild = selector(function* lastChild(): Generator<
  unknown,
  Task | undefined,
  unknown
> {
  const ids = yield* childrenIds();
  const lastChildId = ids[ids.length - 1];
  return lastChildId
    ? yield* cardsTasksSlice.byId(lastChildId)
    : (undefined as Task | undefined);
});

// Get siblings of a task within the stash
export const siblings = selector(function* siblings(taskId: string) {
  const projection = yield* byId(taskId);
  if (!projection)
    return [undefined, undefined] as [
      StashProjection | undefined,
      StashProjection | undefined,
    ];

  const sortedProjections = yield* allOrdered();

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
export const canDrop = selector(function* canDrop(
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

  // Check if dropping a stash projection
  if (isStashProjection(model)) {
    const droppedTask = yield* cardsTasksSlice.byId(model.id);
    return droppedTask !== undefined && droppedTask.state === "todo";
  }

  return false;
});

// Handle drop operations
export const handleDrop = action(function* handleDrop(
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
      orderToken,
    });
  } else if (isTaskProjection(dropItem)) {
    yield* upsert({
      id: dropItem.id,
      orderToken,
    });
    yield* dailyListsProjectionsSlice.deleteProjections([dropItem.id]);
  } else if (isStashProjection(dropItem)) {
    yield* upsert({
      id: dropItem.id,
      orderToken,
    });
  } else {
    shouldNeverHappen("unknown drop item type", dropItem);
  }
});

export const deleteProjections = action(function* deleteProjections(ids: string[]) {
  yield* deleteRows(stashProjectionsTable, ids);
});

export const createProjection = action(function* createProjection(projection: {
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

export const updateProjection = action(function* updateProjection(
  id: string,
  projection: Partial<StashProjection>,
): Generator<unknown, void, unknown> {
  const projInState = yield* byId(id);
  if (!projInState) throw new Error("Stash projection not found");

  yield* upsertRows(stashProjectionsTable, [{ ...projInState, ...projection }]);
});

// Create or update stash projection for a task
export const upsert = action(function* upsert(projection: {
  id: string;
  orderToken: string;
}) {
  const existing = yield* byId(projection.id);

  if (existing) {
    yield* updateProjection(projection.id, {
      orderToken: projection.orderToken,
    });
    return yield* byIdOrDefault(projection.id);
  }

  return yield* createProjection(projection);
});

// Create a sibling task in the stash
export const createSibling = action(function* createSibling(
  taskId: string,
  position: "before" | "after",
  taskParams?: Partial<Task>,
) {
  const task = yield* cardsTasksSlice.byId(taskId);
  if (!task) throw new Error("Task not found");

  const projection = yield* byId(taskId);
  if (!projection) throw new Error("Task not in stash");

  // Create task in project first
  const newTask = yield* projectCategoryCardsSlice.createSiblingTask(
    taskId,
    position,
    taskParams,
  );

  // Add to stash with proper ordering
  const sibs = yield* siblings(taskId);
  const stashOrderToken = generateKeyPositionedBetween(
    projection,
    sibs,
    position,
  );

  return yield* createProjection({
    id: newTask.id,
    orderToken: stashOrderToken,
  });
});

// Remove task from stash
export const removeFromStash = action(function* removeFromStash(taskId: string) {
  yield* deleteProjections([taskId]);
});

// Add task to stash
export const addToStash = action(function* addToStash(
  taskId: string,
  position:
    | "append"
    | "prepend"
    | [StashProjection | undefined, StashProjection | undefined],
): Generator<unknown, void, unknown> {
  const task = yield* cardsTasksSlice.byId(taskId);
  if (!task) throw new Error("Task not found");

  let orderToken: string;

  if (position === "append") {
    const projections = yield* allOrdered();
    const lastToken =
      projections.length > 0
        ? projections[projections.length - 1].orderToken
        : null;
    orderToken = generateJitteredKeyBetween(lastToken, null);
  } else if (position === "prepend") {
    const projections = yield* allOrdered();
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

// Column-level handleDrop: add dropped task to stash (prepend/append based on edge)
const stashColumnHandleDrop = action(function* stashColumnHandleDrop(
  _stashId: string,
  dropId: string,
  dropModelType: AnyModelType,
  edge: "top" | "bottom",
): Generator<unknown, void, unknown> {
  const drop = yield* appSlice.byId(dropId, dropModelType);
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
    yield* dailyListsProjectionsSlice.deleteProjections([taskId]);
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
  const task = yield* projectsSlice.createTask(projectId, categoryPosition);

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

  return yield* cardsTasksSlice.byIdOrDefault(task.id);
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
