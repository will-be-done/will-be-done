import { shouldNeverHappen } from "../utils";
import {
  deleteRows,
  insert,
  selectFrom,
  upsert as upsertRows,
  v,
} from "@will-be-done/hyperdb";
import { action, selector } from "../builders";
import { generateJitteredKeyBetween } from "fractional-indexing-jittered";
import {
  dailyDateFormat,
  generateKeyPositionedBetween,
  normalizeOrderPosition,
  type OrderableItem,
  orderPositionArg,
} from "./utils";
import { registerModelSlice } from "./maps";
import { appById } from "./app";
import { dailyListById, createDailyListIfNotPresent } from "./dailyLists";
import {
  createSiblingTask,
  projectSectionCardsForDisplay,
  type CardForDisplay,
} from "./projectSectionCards";
import { deleteStashProjections } from "./stashProjections";
import { taskById } from "./cardsTasks";
import { parse } from "date-fns";
import {
  projectionType,
  taskProjectionsTable,
  tasksTable,
  Task,
  isTask,
  possibleModelType,
  TaskProjection,
  isTaskProjection,
  isStashProjection,
} from "./tables";

export const defaultTaskProjection: TaskProjection = {
  type: projectionType,
  id: "default-projection-id",
  orderToken: "",
  dailyListId: "",
  createdAt: 0,
};

export const dailyProjectionAllIds = selector({
  name: "dailyProjectionAllIds",
  args: {},
  handler: function* dailyProjectionAllIds() {
    const projections = yield* selectFrom(taskProjectionsTable, "byIds").where(
      (q) => q,
    );
    return projections.map((p) => p.id);
  },
});

export const dailyProjectionById = selector({
  name: "dailyProjectionById",
  args: { id: v.string() },
  handler: function* dailyProjectionById({ id }) {
    const projections = yield* selectFrom(taskProjectionsTable, "byId")
      .where((q) => q.eq("id", id))
      .limit(1);
    return projections[0] as TaskProjection | undefined;
  },
});

export const dailyProjectionsByIds = selector({
  name: "dailyProjectionsByIds",
  args: { ids: v.array(v.string()) },
  handler: function* dailyProjectionsByIds({ ids }) {
    const projections = yield* selectFrom(taskProjectionsTable, "byId").where(
      (q) => ids.map((id) => q.eq("id", id)),
    );
    return projections as TaskProjection[];
  },
});

export const dailyProjectionByIdOrDefault = selector({
  name: "dailyProjectionByIdOrDefault",
  args: { id: v.string() },
  handler: function* dailyProjectionByIdOrDefault({ id }) {
    return (yield* dailyProjectionById({ id })) || defaultTaskProjection;
  },
});

export const dailyProjectionByTaskId = selector({
  name: "dailyProjectionByTaskId",
  args: { taskId: v.string() },
  handler: function* dailyProjectionByTaskId({ taskId }) {
    return yield* dailyProjectionById({ id: taskId });
  },
});

export const dailyListHasProjection = selector({
  name: "dailyListHasProjection",
  args: { taskId: v.string() },
  handler: function* dailyListHasProjection({ taskId }) {
    const projection = yield* dailyProjectionById({ id: taskId });
    return projection !== undefined;
  },
});

export const dailyProjectionsByDailyListId = selector({
  name: "dailyProjectionsByDailyListId",
  args: { dailyListId: v.string() },
  handler: function* dailyProjectionsByDailyListId({ dailyListId }) {
    return (yield* selectFrom(
      taskProjectionsTable,
      "byDailyListIdTokenOrdered",
    ).where((q) => q.eq("dailyListId", dailyListId))) as TaskProjection[];
  },
});

export const dailyProjectionChildrenIds = selector({
  name: "dailyProjectionChildrenIds",
  args: { dailyListId: v.string() },
  handler: function* dailyProjectionChildrenIds({
    dailyListId,
  }): Generator<unknown, string[], unknown> {
    const projections = yield* dailyProjectionsByDailyListId({ dailyListId });

    const result: string[] = [];
    for (const proj of projections) {
      const task = yield* taskById({ id: proj.id });
      if (task && task.state === "todo") {
        result.push(proj.id);
      }
    }

    return result;
  },
});

export const dailyProjectionChildrenForDisplay = selector({
  name: "dailyProjectionChildrenForDisplay",
  args: { dailyListId: v.string() },
  handler: function* dailyProjectionChildrenForDisplay({
    dailyListId,
  }): Generator<unknown, CardForDisplay[], unknown> {
    const projections = yield* dailyProjectionsByDailyListId({ dailyListId });
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

    return yield* projectSectionCardsForDisplay({ cards, cardWrappers });
  },
});

export const dailyProjectionDateOfTask = selector({
  name: "dailyProjectionDateOfTask",
  args: { taskId: v.string() },
  handler: function* dailyProjectionDateOfTask({
    taskId,
  }): Generator<unknown, Date | undefined, unknown> {
    const projection = yield* dailyProjectionByTaskId({ taskId });
    if (!projection) return undefined as Date | undefined;

    const list = yield* dailyListById({ id: projection.dailyListId });
    if (!list) return undefined as Date | undefined;

    return parse(list.date, dailyDateFormat, new Date());
  },
});

export const doneDailyProjectionChildrenIds = selector({
  name: "doneDailyProjectionChildrenIds",
  args: { dailyListId: v.string() },
  handler: function* doneDailyProjectionChildrenIds({
    dailyListId,
  }): Generator<unknown, string[], unknown> {
    const projections = yield* dailyProjectionsByDailyListId({ dailyListId });

    const doneTasks: { id: string; lastToggledAt: number }[] = [];
    for (const proj of projections) {
      const task = yield* taskById({ id: proj.id });
      if (task && task.state === "done") {
        doneTasks.push({ id: proj.id, lastToggledAt: task.lastToggledAt });
      }
    }

    return doneTasks
      .sort((a, b) => b.lastToggledAt - a.lastToggledAt)
      .map((t) => t.id);
  },
});

export const doneDailyProjectionChildrenForDisplay = selector({
  name: "doneDailyProjectionChildrenForDisplay",
  args: { dailyListId: v.string() },
  handler: function* doneDailyProjectionChildrenForDisplay({
    dailyListId,
  }): Generator<unknown, CardForDisplay[], unknown> {
    const projections = yield* dailyProjectionsByDailyListId({ dailyListId });
    const projectionIds = projections.map((projection) => projection.id);
    const tasks = projectionIds.length
      ? yield* selectFrom(tasksTable, "byId").where((q) =>
          projectionIds.map((id) => q.eq("id", id)),
        )
      : [];
    const taskMap = new Map((tasks as Task[]).map((task) => [task.id, task]));

    const cardsWithProjections: { card: Task; cardWrapper: TaskProjection }[] =
      [];
    for (const projection of projections) {
      const task = taskMap.get(projection.id);
      if (task && task.state === "done") {
        cardsWithProjections.push({ card: task, cardWrapper: projection });
      }
    }

    cardsWithProjections.sort(
      (a, b) => b.card.lastToggledAt - a.card.lastToggledAt,
    );

    return yield* projectSectionCardsForDisplay({
      cards: cardsWithProjections.map(({ card }) => card),
      cardWrappers: cardsWithProjections.map(({ cardWrapper }) => cardWrapper),
    });
  },
});

export const firstDailyProjectionChild = selector({
  name: "firstDailyProjectionChild",
  args: { dailyListId: v.string() },
  handler: function* firstDailyProjectionChild({
    dailyListId,
  }): Generator<unknown, Task | undefined, unknown> {
    const ids = yield* dailyProjectionChildrenIds({ dailyListId });
    const firstChildId = ids[0];
    return firstChildId
      ? yield* taskById({ id: firstChildId })
      : (undefined as Task | undefined);
  },
});

export const lastDailyProjectionChild = selector({
  name: "lastDailyProjectionChild",
  args: { dailyListId: v.string() },
  handler: function* lastDailyProjectionChild({
    dailyListId,
  }): Generator<unknown, Task | undefined, unknown> {
    const ids = yield* dailyProjectionChildrenIds({ dailyListId });
    const lastChildId = ids[ids.length - 1];
    return lastChildId
      ? yield* taskById({ id: lastChildId })
      : (undefined as Task | undefined);
  },
});

export const dailyProjectionSiblings = selector({
  name: "dailyProjectionSiblings",
  args: { taskId: v.string() },
  handler: function* dailyProjectionSiblings({ taskId }) {
    const projection = yield* dailyProjectionByTaskId({ taskId });
    if (!projection)
      return [undefined, undefined] as [
        TaskProjection | undefined,
        TaskProjection | undefined,
      ];

    const sortedProjections = yield* dailyProjectionsByDailyListId({
      dailyListId: projection.dailyListId,
    });

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
  },
});

export const dailyProjectionCanDrop = selector({
  name: "dailyProjectionCanDrop",
  args: {
    projectionId: v.string(),
    dropId: v.string(),
    dropModelType: possibleModelType,
  },
  handler: function* dailyProjectionCanDrop({
    projectionId,
    dropId,
    dropModelType,
  }): Generator<unknown, boolean, unknown> {
    const model = yield* appById({ id: dropId, modelType: dropModelType });
    if (!model) return false;

    const projection = yield* dailyProjectionById({ id: projectionId });
    if (!projection) return false;

    const task = yield* taskById({ id: projection.id });
    if (!task) return false;

    if (task.state === "done") return false;

    if (isTask(model)) {
      return model.state === "todo";
    }

    if (isTaskProjection(model)) {
      const droppedTask = yield* taskById({ id: model.id });
      return droppedTask !== undefined && droppedTask.state === "todo";
    }

    if (isStashProjection(model)) {
      const droppedTask = yield* taskById({ id: model.id });
      return droppedTask !== undefined && droppedTask.state === "todo";
    }

    return false;
  },
});

export const dailyProjectionHandleDrop = action({
  name: "dailyProjectionHandleDrop",
  args: {
    projectionId: v.string(),
    dropId: v.string(),
    dropModelType: possibleModelType,
    edge: v.union(v.literal("top"), v.literal("bottom")),
  },
  handler: function* dailyProjectionHandleDrop({
    projectionId,
    dropId,
    dropModelType,
    edge,
  }): Generator<unknown, void, unknown> {
    const canDropResult = yield* dailyProjectionCanDrop({
      projectionId,
      dropId,
      dropModelType,
    });
    if (!canDropResult) return;

    const projection = yield* dailyProjectionById({ id: projectionId });
    if (!projection) return;

    const dropItem = yield* appById({ id: dropId, modelType: dropModelType });
    if (!dropItem) return;

    const [up, down] = yield* dailyProjectionSiblings({
      taskId: projection.id,
    });

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
        projection: {
          id: dropItem.id,
          dailyListId: projection.dailyListId,
          orderToken,
        },
      });
    } else if (isTaskProjection(dropItem)) {
      yield* upsertDailyProjection({
        projection: {
          id: dropItem.id,
          dailyListId: projection.dailyListId,
          orderToken,
        },
      });
    } else if (isStashProjection(dropItem)) {
      yield* upsertDailyProjection({
        projection: {
          id: dropItem.id,
          dailyListId: projection.dailyListId,
          orderToken,
        },
      });
      yield* deleteStashProjections({ ids: [dropItem.id] });
    } else {
      shouldNeverHappen("unknown drop item type", dropItem);
    }
  },
});

export const deleteDailyProjections = action({
  name: "deleteDailyProjections",
  args: { ids: v.array(v.string()) },
  handler: function* deleteDailyProjections({ ids }) {
    yield* deleteRows(taskProjectionsTable, ids);
  },
});

export const createDailyProjection = action({
  name: "createDailyProjection",
  args: {
    projection: v.required(v.partial(taskProjectionsTable.v()), [
      "id",
      "dailyListId",
      "orderToken",
    ]),
  },
  handler: function* createDailyProjection({ projection }) {
    const newProjection: TaskProjection = {
      type: projectionType,
      id: projection.id,
      dailyListId: projection.dailyListId,
      orderToken: projection.orderToken,
      createdAt: Date.now(),
    };

    yield* insert(taskProjectionsTable, [newProjection]);
    return newProjection;
  },
});

export const updateDailyProjection = action({
  name: "updateDailyProjection",
  args: {
    id: v.string(),
    projection: v.partial(taskProjectionsTable.v()),
  },
  handler: function* updateDailyProjection({ id, projection }) {
    const projInState = yield* dailyProjectionById({ id });
    if (!projInState) throw new Error("Projection not found");

    yield* upsertRows(taskProjectionsTable, [
      { ...projInState, ...projection },
    ]);
  },
});

export const upsertDailyProjection = action({
  name: "upsertDailyProjection",
  args: {
    projection: v.required(v.partial(taskProjectionsTable.v()), [
      "id",
      "dailyListId",
      "orderToken",
    ]),
  },
  handler: function* upsertDailyProjection({ projection }) {
    const existing = yield* dailyProjectionById({ id: projection.id });

    if (existing) {
      yield* updateDailyProjection({
        id: projection.id,
        projection: {
          dailyListId: projection.dailyListId,
          orderToken: projection.orderToken,
        },
      });
      return yield* dailyProjectionByIdOrDefault({ id: projection.id });
    }

    return yield* createDailyProjection({ projection });
  },
});

export const createDailyProjectionSibling = action({
  name: "createDailyProjectionSibling",
  args: {
    taskId: v.string(),
    position: v.union(v.literal("before"), v.literal("after")),
    taskParams: v.optional(v.partial(tasksTable.v())),
  },
  handler: function* createDailyProjectionSibling({
    taskId,
    position,
    taskParams,
  }) {
    const task = yield* taskById({ id: taskId });
    if (!task) throw new Error("Task not found");

    const projection = yield* dailyProjectionByTaskId({ taskId });
    if (!projection) throw new Error("Task not in daily list");

    const newTask = yield* createSiblingTask({
      cardId: taskId,
      position,
      taskParams,
    });

    const sibs = yield* dailyProjectionSiblings({ taskId });
    const dailyListOrderToken = generateKeyPositionedBetween(
      projection,
      sibs,
      position,
    );

    return yield* createDailyProjection({
      projection: {
        id: newTask.id,
        dailyListId: projection.dailyListId,
        orderToken: dailyListOrderToken,
      },
    });
  },
});

export const removeFromDailyList = action({
  name: "removeFromDailyList",
  args: { taskId: v.string() },
  handler: function* removeFromDailyList({ taskId }) {
    yield* deleteDailyProjections({ ids: [taskId] });
  },
});

export const createProjectionInDailyList = action({
  name: "createProjectionInDailyList",
  args: {
    taskId: v.string(),
    date: v.string(),
  },
  handler: function* createProjectionInDailyList({ taskId, date }) {
    const dailyList = yield* createDailyListIfNotPresent({ date });

    const projections = yield* dailyProjectionsByDailyListId({
      dailyListId: dailyList.id,
    });
    const firstToken =
      projections.length > 0 ? projections[0].orderToken : null;
    const orderToken = generateJitteredKeyBetween(null, firstToken);

    return yield* createDailyProjection({
      projection: {
        id: taskId,
        dailyListId: dailyList.id,
        orderToken,
      },
    });
  },
});

export const addToDailyList = action({
  name: "addToDailyList",
  args: {
    taskId: v.string(),
    dailyListId: v.string(),
    position: orderPositionArg,
  },
  handler: function* addToDailyList({
    taskId,
    dailyListId,
    position,
  }): Generator<unknown, void, unknown> {
    const task = yield* taskById({ id: taskId });
    if (!task) throw new Error("Task not found");

    let orderToken: string;

    if (position === "append") {
      const projections = yield* dailyProjectionsByDailyListId({ dailyListId });
      const lastToken =
        projections.length > 0
          ? projections[projections.length - 1].orderToken
          : null;
      orderToken = generateJitteredKeyBetween(lastToken, null);
    } else if (position === "prepend") {
      const projections = yield* dailyProjectionsByDailyListId({ dailyListId });
      const firstToken =
        projections.length > 0 ? projections[0].orderToken : null;
      orderToken = generateJitteredKeyBetween(null, firstToken);
    } else {
      const siblings = normalizeOrderPosition(position) as [
        OrderableItem | undefined,
        OrderableItem | undefined,
      ];
      orderToken = generateJitteredKeyBetween(
        siblings[0]?.orderToken || null,
        siblings[1]?.orderToken || null,
      );
    }

    yield* upsertDailyProjection({
      projection: { id: taskId, dailyListId, orderToken },
    });
  },
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
