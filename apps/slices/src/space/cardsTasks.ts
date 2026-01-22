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
import { appSlice } from "./app";
import {
  isTaskTemplate,
  TaskTemplate,
  cardsTaskTemplatesSlice,
} from "./cardsTaskTemplates";
import { registerSpaceSyncableTable } from "./syncMap";
import { registerModelSlice, AnyModelType } from "./maps";
import { projectCategoryCardsSlice } from "./projectsCategoriesCards";
import { projectCategoriesSlice } from "./projectsCategories";
import { isTaskProjection } from "./dailyListsProjections";

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
});
registerSpaceSyncableTable(tasksTable, taskType);

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
      ...task,
    };

    yield* insert(tasksTable, [newTask]);

    return newTask;
  }),
  canDrop: selector(function* (
    taskId: string,
    dropId: string,
    dropModelType: AnyModelType,
  ): GenReturn<boolean> {
    const model = yield* appSlice.byId(dropId, dropModelType);
    if (!model) return false;

    const task = yield* cardsTasksSlice.byId(taskId);
    if (!task) return false;

    if (task.state === "done") {
      return false;
    }

    if (isTask(model) && model.state === "done") {
      return false;
    }

    if (isTaskProjection(model)) {
      const droppedTask = yield* cardsTasksSlice.byId(model.id);
      return droppedTask !== undefined && droppedTask.state === "todo";
    }

    return isTask(model) || isTaskTemplate(model);
  }),
  handleDrop: action(function* (
    taskId: string,
    dropId: string,
    dropModelType: AnyModelType,
    edge: "top" | "bottom",
  ): GenReturn<void> {
    if (!(yield* cardsTasksSlice.canDrop(taskId, dropId, dropModelType)))
      return;

    const task = yield* cardsTasksSlice.byId(taskId);
    if (!task) return shouldNeverHappen("task not found");

    const dropItem = yield* appSlice.byId(dropId, dropModelType);
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

    if (isTask(dropItem)) {
      yield* cardsTasksSlice.update(dropItem.id, {
        projectCategoryId: task.projectCategoryId,
        orderToken: orderToken,
      });
    } else if (isTaskTemplate(dropItem)) {
      yield* cardsTaskTemplatesSlice.update(dropItem.id, {
        projectCategoryId: task.projectCategoryId,
        orderToken: orderToken,
      });
    } else if (isTaskProjection(dropItem)) {
      // When dropping a projection onto a task, move the underlying task
      const droppedTask = yield* cardsTasksSlice.byId(dropItem.id);
      if (droppedTask) {
        yield* cardsTasksSlice.update(droppedTask.id, {
          projectCategoryId: task.projectCategoryId,
          orderToken: orderToken,
        });
        // Keep the projection in the daily list
      }
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
    yield* appSlice.delete(taskTemplate.id, taskTemplate.type);

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
