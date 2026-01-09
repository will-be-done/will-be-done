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
import { uuidv7 } from "uuidv7";
import type { GenReturn } from "./utils";
import { appSlice, DndScope } from "./app";
import {
  isTaskTemplate,
  TaskTemplate,
  cardsTaskTemplatesSlice,
} from "./cardsTaskTemplates";
import { registerSyncableTable } from "./syncMap";
import { registerModelSlice } from "./maps";
import { projectCategoryCardsSlice } from "./projectsCategoriesCards";
import { projectCategoriesSlice } from "./projectsCategories";
import { dailyListTasksSlice } from "./dailyListTasks";

// Type definitions
export const taskType = "task";
type TaskState = "todo" | "done";

export type Task = {
  type: typeof taskType;
  id: string;
  title: string;
  state: TaskState;
  projectCategoryId: string;
  orderToken: string;
  lastToggledAt: number;
  horizon: "week" | "month" | "year" | "someday";
  createdAt: number;
  templateId: string | null;
  templateDate: number | null;
  dailyListId: string | null;
  dailyListOrderToken: string | null;
};

export const isTask = isObjectType<Task>(taskType);

export const defaultTask: Task = {
  type: taskType,
  projectCategoryId: "abeee7aa-8bf4-4a5f-9167-ce42ad6187b6",
  id: "17748950-3b32-4893-8fa8-ccdb269f7c52",
  title: "default task kek",
  state: "todo",
  orderToken: "",
  lastToggledAt: 0,
  createdAt: 0,
  horizon: "someday",
  templateId: null,
  templateDate: null,
  dailyListId: null,
  dailyListOrderToken: null,
};

// Table definition
export const tasksTable = table<Task>("tasks").withIndexes({
  byIds: { cols: ["id"], type: "btree" },
  byId: { cols: ["id"], type: "hash" },
  byCategoryIdOrderStates: {
    cols: ["projectCategoryId", "state", "orderToken"],
    type: "btree",
  },
  byTemplateId: {
    cols: ["templateId"],
    type: "hash",
  },
  byDailyListId: {
    cols: ["dailyListId"],
    type: "hash",
  },
  byDailyListIdOrderToken: {
    cols: ["dailyListId", "dailyListOrderToken"],
    type: "btree",
  },
});
registerSyncableTable(tasksTable, taskType);

// Slice - imports are at the bottom to avoid circular dependency issues
export const cardsTasksSlice = {
  byId: selector(function* (id: string): GenReturn<Task | undefined> {
    const tasks = yield* runQuery(
      selectFrom(tasksTable, "byId")
        .where((q) => q.eq("id", id))
        .limit(1),
    );

    return tasks[0];
  }),
  byIdOrDefault: selector(function* (id: string): GenReturn<Task> {
    return (yield* cardsTasksSlice.byId(id)) || defaultTask;
  }),
  taskIdsOfTemplateId: selector(function* (ids: string[]): GenReturn<string[]> {
    const tasks = yield* runQuery(
      selectFrom(tasksTable, "byTemplateId").where((q) =>
        ids.map((id) => q.eq("templateId", id)),
      ),
    );

    return tasks.map((t) => t.id);
  }),
  all: selector(function* (): GenReturn<Task[]> {
    const tasks = yield* runQuery(
      selectFrom(tasksTable, "byCategoryIdOrderStates"),
    );
    return tasks;
  }),

  // actions
  delete: action(function* (ids: string[]): GenReturn<void> {
    yield* deleteRows(tasksTable, ids);
  }),
  update: action(function* (id: string, task: Partial<Task>): GenReturn<void> {
    const taskInState = yield* cardsTasksSlice.byId(id);
    if (!taskInState) throw new Error("Task not found");

    yield* update(tasksTable, [{ ...taskInState, ...task }]);
  }),
  createTask: action(function* (
    task: Partial<Task> & { orderToken: string; projectCategoryId: string },
  ): GenReturn<Task> {
    const id = task.id || uuidv7();

    const newTask: Task = {
      type: taskType,
      id,
      title: "",
      state: "todo",
      lastToggledAt: Date.now(),
      createdAt: Date.now(),
      horizon: "week",
      templateId: null,
      templateDate: null,
      dailyListId: null,
      dailyListOrderToken: null,
      ...task,
    };

    yield* insert(tasksTable, [newTask]);

    return newTask;
  }),
  canDrop: selector(function* (
    taskId: string,
    scope: DndScope,
    dropId: string,
    dropScope: DndScope,
  ): GenReturn<boolean> {
    if (scope === "dailyList") {
      return yield* dailyListTasksSlice.canDrop(
        taskId,
        scope,
        dropId,
        dropScope,
      );
    }

    const model = yield* appSlice.byId(dropId);
    if (!model) return false;

    const task = yield* cardsTasksSlice.byId(taskId);
    if (!task) return false;

    if (task.state === "done") {
      return false;
    }

    if (isTask(model) && model.state === "done") {
      return false;
    }

    return isTask(model) || isTaskTemplate(model);
  }),
  handleDrop: action(function* (
    taskId: string,
    scope: DndScope,
    dropId: string,
    dropScope: DndScope,
    edge: "top" | "bottom",
  ): GenReturn<void> {
    if (!(yield* cardsTasksSlice.canDrop(taskId, scope, dropId, dropScope)))
      return;

    if (scope === "dailyList") {
      yield* dailyListTasksSlice.handleDrop(
        taskId,
        scope,
        dropId,
        dropScope,
        edge,
      );

      return;
    }

    const task = yield* cardsTasksSlice.byId(taskId);
    if (!task) return shouldNeverHappen("task not found");

    const dropItem = yield* appSlice.byId(dropId);
    if (!dropItem) return shouldNeverHappen("drop item not found");

    const [up, down] = yield* projectCategoryCardsSlice.siblings(taskId);

    let between: [string | undefined, string | undefined] = [
      task.orderToken,
      down?.orderToken,
    ];

    if (edge == "top") {
      between = [up?.orderToken, task.orderToken];
    }

    const orderToken = generateJitteredKeyBetween(
      between[0] || null,
      between[1] || null,
    );

    const additionalUpdates: Partial<Task> = {};
    if (dropScope === "dailyList") {
      additionalUpdates.dailyListId = null;
      additionalUpdates.dailyListOrderToken = null;
    }

    if (isTask(dropItem)) {
      yield* cardsTasksSlice.update(dropItem.id, {
        projectCategoryId: task.projectCategoryId,
        orderToken: orderToken,
        ...additionalUpdates,
      });
    } else if (isTaskTemplate(dropItem)) {
      yield* cardsTaskTemplatesSlice.update(dropItem.id, {
        projectCategoryId: task.projectCategoryId,
        orderToken: orderToken,
      });
    } else {
      shouldNeverHappen("unknown drop item type", dropItem);
    }
  }),
  moveToProject: action(function* (
    taskId: string,
    projectId: string,
  ): GenReturn<void> {
    const task = yield* cardsTasksSlice.byId(taskId);
    if (!task) throw new Error("Task not found");

    const firstCategory = yield* projectCategoriesSlice.firstChild(projectId);
    if (!firstCategory) throw new Error("No categories found");

    yield* update(tasksTable, [
      {
        ...task,
        projectCategoryId: firstCategory.id,
      },
    ]);
  }),
  toggleState: action(function* (taskId: string): GenReturn<void> {
    const task = yield* cardsTasksSlice.byId(taskId);
    if (!task) throw new Error("Task not found");

    yield* update(tasksTable, [
      {
        ...task,
        state: task.state === "todo" ? "done" : "todo",
        lastToggledAt: Date.now(),
      },
    ]);
  }),
  createFromTemplate: action(function* (taskTemplate: TaskTemplate) {
    yield* appSlice.delete(taskTemplate);

    const newId = uuidv7();
    const newTask: Task = {
      id: newId,
      title: taskTemplate.title,
      state: "todo",
      projectCategoryId: taskTemplate.projectCategoryId,
      type: taskType,
      orderToken: taskTemplate.orderToken,
      lastToggledAt: Date.now(),
      horizon: taskTemplate.horizon,
      createdAt: taskTemplate.createdAt,
      templateId: taskTemplate.id,
      templateDate: taskTemplate.lastGeneratedAt,
      dailyListId: null,
      dailyListOrderToken: null,
    };
    yield* insert(tasksTable, [newTask]);

    return newTask;
  }),
  deleteByIds: action(function* (ids: string[]): GenReturn<void> {
    yield* cardsTasksSlice.delete(ids);
  }),
  deleteById: action(function* (id: string): GenReturn<void> {
    yield* cardsTasksSlice.delete([id]);
  }),
};
registerModelSlice(cardsTasksSlice, tasksTable, taskType);
