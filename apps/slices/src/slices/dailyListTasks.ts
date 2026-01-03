import { shouldNeverHappen } from "../utils";
import { action, runQuery, selectFrom, selector } from "@will-be-done/hyperdb";
import { generateJitteredKeyBetween } from "fractional-indexing-jittered";
import type { GenReturn } from "./utils";
import { generateKeyPositionedBetween } from "./utils";
import { appSlice } from "./app";
import { isTask, cardsTasksSlice, type Task, tasksTable } from "./cardsTasks";
import { projectCategoryCardsSlice } from "./projectsCategoriesCards";

export const dailyListTasksSlice = {
  // SELECTORS

  // Get all tasks in a specific daily list (non-done, ordered)
  childrenIds: selector(function* (dailyListId: string): GenReturn<string[]> {
    const tasks = yield* runQuery(
      selectFrom(tasksTable, "byDailyListIdOrderToken").where((q) =>
        q.eq("dailyListId", dailyListId),
      ),
    );

    return tasks.filter((t) => t.state === "todo").map((t) => t.id);
  }),

  // Get all done tasks in a daily list (sorted by lastToggledAt)
  doneChildrenIds: selector(function* (
    dailyListId: string,
  ): GenReturn<string[]> {
    const tasks = yield* runQuery(
      selectFrom(tasksTable, "byDailyListId").where((q) =>
        q.eq("dailyListId", dailyListId),
      ),
    );

    return tasks
      .filter((t) => t.state === "done")
      .sort((a, b) => b.lastToggledAt - a.lastToggledAt)
      .map((t) => t.id);
  }),

  // Get first task in daily list
  firstChild: selector(function* (
    dailyListId: string,
  ): GenReturn<Task | undefined> {
    const childrenIds = yield* dailyListTasksSlice.childrenIds(dailyListId);
    const firstChildId = childrenIds[0];
    return firstChildId ? yield* cardsTasksSlice.byId(firstChildId) : undefined;
  }),

  // Get last task in daily list
  lastChild: selector(function* (
    dailyListId: string,
  ): GenReturn<Task | undefined> {
    const childrenIds = yield* dailyListTasksSlice.childrenIds(dailyListId);
    const lastChildId = childrenIds[childrenIds.length - 1];
    return lastChildId ? yield* cardsTasksSlice.byId(lastChildId) : undefined;
  }),

  // Get siblings of a task within its daily list
  siblings: selector(function* (
    taskId: string,
  ): GenReturn<[Task | undefined, Task | undefined]> {
    const task = yield* cardsTasksSlice.byId(taskId);
    if (!task || !task.dailyListId) return [undefined, undefined];

    const sortedTasks = yield* runQuery(
      selectFrom(tasksTable, "byDailyListIdOrderToken").where((q) =>
        q.eq("dailyListId", task.dailyListId!),
      ),
    );

    const index = sortedTasks.findIndex((t) => t.id === taskId);

    const before = index > 0 ? sortedTasks[index - 1] : undefined;
    const after =
      index < sortedTasks.length - 1 ? sortedTasks[index + 1] : undefined;

    return [before, after];
  }),

  // Check if a task/model can be dropped into this daily list context
  canDrop: selector(function* (
    taskId: string,
    dropId: string,
  ): GenReturn<boolean> {
    const model = yield* appSlice.byId(dropId);
    if (!model) return false;

    const task = yield* cardsTasksSlice.byId(taskId);
    if (!task) return false;

    // Only allow dropping todo tasks
    if (task.state === "done") return false;

    if (isTask(model) && model.state === "done") {
      return false;
    }

    return isTask(model);
  }),

  // ACTIONS

  // Create a sibling task in the daily list
  createSibling: action(function* (
    taskId: string,
    position: "before" | "after",
    taskParams?: Partial<Task>,
  ): GenReturn<Task> {
    const task = yield* cardsTasksSlice.byId(taskId);
    if (!task) throw new Error("Task not found");
    if (!task.dailyListId) throw new Error("Task not in daily list");

    // Create task in project first
    const newTask = yield* projectCategoryCardsSlice.createSiblingTask(
      taskId,
      position,
      taskParams,
    );

    // Add to daily list with proper ordering
    const siblings = yield* dailyListTasksSlice.siblings(taskId);
    const dailyListOrderToken = generateKeyPositionedBetween(
      task,
      siblings,
      position,
    );

    yield* cardsTasksSlice.update(newTask.id, {
      dailyListId: task.dailyListId,
      dailyListOrderToken,
    });

    return yield* cardsTasksSlice.byIdOrDefault(newTask.id);
  }),

  // Handle drop operations
  handleDrop: action(function* (
    taskId: string,
    dropId: string,
    edge: "top" | "bottom",
  ): GenReturn<void> {
    const canDrop = yield* dailyListTasksSlice.canDrop(taskId, dropId);
    if (!canDrop) return;

    const task = yield* cardsTasksSlice.byId(taskId);
    if (!task || !task.dailyListId) return;

    const dropItem = yield* appSlice.byId(dropId);
    if (!dropItem) return;

    const [up, down] = yield* dailyListTasksSlice.siblings(taskId);

    let between: [string | undefined, string | undefined] = [
      task.dailyListOrderToken || undefined,
      down?.dailyListOrderToken || undefined,
    ];

    if (edge === "top") {
      between = [
        up?.dailyListOrderToken || undefined,
        task.dailyListOrderToken || undefined,
      ];
    }

    const orderToken = generateJitteredKeyBetween(
      between[0] || null,
      between[1] || null,
    );

    if (isTask(dropItem)) {
      yield* cardsTasksSlice.update(dropItem.id, {
        dailyListId: task.dailyListId,
        dailyListOrderToken: orderToken,
      });
    } else {
      shouldNeverHappen("unknown drop item type", dropItem);
    }
  }),

  // Remove task from daily list
  removeFromDailyList: action(function* (taskId: string): GenReturn<void> {
    yield* cardsTasksSlice.update(taskId, {
      dailyListId: null,
      dailyListOrderToken: null,
    });
  }),

  // Add task to daily list
  addToDailyList: action(function* (
    taskId: string,
    dailyListId: string,
    position: "append" | "prepend" | [Task | undefined, Task | undefined],
  ): GenReturn<void> {
    const task = yield* cardsTasksSlice.byId(taskId);
    if (!task) throw new Error("Task not found");

    let orderToken: string;

    if (position === "append") {
      const tasks = yield* runQuery(
        selectFrom(tasksTable, "byDailyListIdOrderToken").where((q) =>
          q.eq("dailyListId", dailyListId),
        ),
      );
      const lastToken =
        tasks.length > 0 ? tasks[tasks.length - 1].dailyListOrderToken : null;
      orderToken = generateJitteredKeyBetween(lastToken, null);
    } else if (position === "prepend") {
      const tasks = yield* runQuery(
        selectFrom(tasksTable, "byDailyListIdOrderToken").where((q) =>
          q.eq("dailyListId", dailyListId),
        ),
      );
      const firstToken = tasks.length > 0 ? tasks[0].dailyListOrderToken : null;
      orderToken = generateJitteredKeyBetween(null, firstToken);
    } else {
      orderToken = generateJitteredKeyBetween(
        position[0]?.dailyListOrderToken || null,
        position[1]?.dailyListOrderToken || null,
      );
    }

    yield* cardsTasksSlice.update(taskId, {
      dailyListId,
      dailyListOrderToken: orderToken,
    });
  }),
};
