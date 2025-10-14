import { isObjectType } from "../utils";
import { shouldNeverHappen } from "@/utils";
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
import { uuidv7 } from "uuidv7";
import type { GenReturn } from "./utils";
import { generateKeyPositionedBetween } from "./utils";
import { appSlice2 } from "./app";
import { isTask, tasksSlice2, type Task } from "./tasks";
import { projectItemsSlice2 } from "./projectItems";

// Type definitions
export const projectionType = "projection";

export type TaskProjection = {
  type: typeof projectionType;
  id: string;
  taskId: string;
  orderToken: string;
  dailyListId: string;
  createdAt: number;
};

export const isTaskProjection = isObjectType<TaskProjection>(projectionType);

export const defaultTaskProjection: TaskProjection = {
  type: projectionType,
  id: "default-projection-id",
  taskId: "",
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
  byTaskIdCreatedAt: { cols: ["taskId", "createdAt"], type: "btree" },
  byDailyListId: { cols: ["dailyListId"], type: "hash" },
  byDailyListIdTokenOrdered: {
    cols: ["dailyListId", "orderToken"],
    type: "btree",
  },
});

// Slice
export const projectionsSlice2 = {
  // selectors
  allIds: selector(function* (): GenReturn<string[]> {
    const projections = yield* runQuery(
      selectFrom(taskProjectionsTable, "byIds").where((q) => q),
    );

    return projections.map((p) => p.id);
  }),
  byId: selector(function* (id: string): GenReturn<TaskProjection | undefined> {
    const projections = yield* runQuery(
      selectFrom(taskProjectionsTable, "byId").where((q) => q.eq("id", id)),
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
    return (yield* projectionsSlice2.byId(id)) || defaultTaskProjection;
  }),
  canDrop: selector(function* (
    taskProjectionId: string,
    dropId: string,
  ): GenReturn<boolean> {
    const model = yield* appSlice2.byId(dropId);
    if (!model) return false;

    const projection = yield* projectionsSlice2.byId(taskProjectionId);
    if (!projection) return false;

    const projectionTask = yield* tasksSlice2.byId(projection.taskId);
    if (!projectionTask) return false;

    if (projectionTask.state === "done") {
      return false;
    }

    if (isTaskProjection(model)) {
      const modelTask = yield* tasksSlice2.byId(model.taskId);
      if (!modelTask) return false;

      if (modelTask.state === "done") {
        return false;
      }
    }

    return isTaskProjection(model) || isTask(model);
  }),
  siblings: selector(function* (
    taskProjectionId: string,
  ): GenReturn<[TaskProjection | undefined, TaskProjection | undefined]> {
    const item = yield* projectionsSlice2.byId(taskProjectionId);
    if (!item) return [undefined, undefined];

    const sortedProjections = yield* runQuery(
      selectFrom(taskProjectionsTable, "byDailyListIdTokenOrdered").where((q) =>
        q.eq("dailyListId", item.dailyListId),
      ),
    );

    const index = sortedProjections.findIndex((p) => p.id === taskProjectionId);

    const before = index > 0 ? sortedProjections[index - 1] : undefined;
    const after =
      index < sortedProjections.length - 1
        ? sortedProjections[index + 1]
        : undefined;

    return [before, after];
  }),
  sortedProjectionIdsByTaskId: selector(function* (
    taskId: string,
  ): GenReturn<string[]> {
    const projections = yield* runQuery(
      selectFrom(taskProjectionsTable, "byTaskIdCreatedAt").where((q) =>
        q.eq("taskId", taskId),
      ),
    );

    return projections.map((p) => p.id);
  }),
  sortedProjectionsOfTask: selector(function* (
    taskId: string,
  ): GenReturn<TaskProjection[]> {
    const projections = yield* runQuery(
      selectFrom(taskProjectionsTable, "byTaskIdCreatedAt").where((q) =>
        q.eq("taskId", taskId),
      ),
    );

    return projections;
  }),
  lastProjectionOfTask: selector(function* (
    taskId: string,
  ): GenReturn<TaskProjection | undefined> {
    const projections =
      yield* projectionsSlice2.sortedProjectionsOfTask(taskId);

    if (projections.length === 0) return undefined;
    return projections[projections.length - 1];
  }),

  // actions
  delete: action(function* (ids: string[]): GenReturn<void> {
    yield* deleteRows(taskProjectionsTable, ids);
  }),
  deleteProjectionsOfTask: action(function* (
    taskIds: string[],
  ): GenReturn<void> {
    const projectionIds: string[] = [];

    for (const taskId of taskIds) {
      const ids = yield* projectionsSlice2.sortedProjectionIdsByTaskId(taskId);
      projectionIds.push(...ids);
    }

    yield* deleteRows(taskProjectionsTable, projectionIds);
  }),
  create: action(function* (
    projection: Partial<TaskProjection> & {
      taskId: string;
      dailyListId: string;
      orderToken: string;
    },
  ): GenReturn<TaskProjection> {
    const id = projection.id || uuidv7();
    const newProjection: TaskProjection = {
      type: projectionType,
      id,
      createdAt: Date.now(),
      ...projection,
    };

    yield* insert(taskProjectionsTable, [newProjection]);
    return newProjection;
  }),
  update: action(function* (
    id: string,
    projection: Partial<TaskProjection>,
  ): GenReturn<void> {
    const projInState = yield* projectionsSlice2.byId(id);
    if (!projInState) throw new Error("Projection not found");

    yield* update(taskProjectionsTable, [{ ...projInState, ...projection }]);
  }),
  createSibling: action(function* (
    taskProjectionId: string,
    position: "before" | "after",
    taskParams?: Partial<Task>,
  ): GenReturn<TaskProjection> {
    const taskProjection = yield* projectionsSlice2.byId(taskProjectionId);

    if (!taskProjection) throw new Error("TaskProjection not found");

    const newTask = yield* projectItemsSlice2.createSibling(
      taskProjection.taskId,
      position,
      taskParams,
    );

    return yield* projectionsSlice2.create({
      taskId: newTask.id,
      dailyListId: taskProjection.dailyListId,
      orderToken: generateKeyPositionedBetween(
        taskProjection,
        yield* projectionsSlice2.siblings(taskProjectionId),
        position,
      ),
    });
  }),
  handleDrop: action(function* (
    taskProjectionId: string,
    dropId: string,
    edge: "top" | "bottom",
  ): GenReturn<void> {
    const canDrop = yield* projectionsSlice2.canDrop(taskProjectionId, dropId);
    if (!canDrop) return;

    const taskProjection = yield* projectionsSlice2.byId(taskProjectionId);
    if (!taskProjection) return;

    const dropItem = yield* appSlice2.byId(dropId);
    if (!dropItem) return;

    const [up, down] = yield* projectionsSlice2.siblings(taskProjectionId);

    let between: [string | undefined, string | undefined] = [
      taskProjection.orderToken,
      down?.orderToken,
    ];

    if (edge == "top") {
      between = [up?.orderToken, taskProjection.orderToken];
    }

    const orderToken = generateJitteredKeyBetween(
      between[0] || null,
      between[1] || null,
    );

    if (isTaskProjection(dropItem)) {
      yield* projectionsSlice2.update(dropItem.id, {
        orderToken,
        dailyListId: taskProjection.dailyListId,
      });
    } else if (isTask(dropItem)) {
      yield* projectionsSlice2.create({
        taskId: dropItem.id,
        dailyListId: taskProjection.dailyListId,
        orderToken,
      });
    } else {
      shouldNeverHappen("unknown drop item type", dropItem);
    }
  }),
};
