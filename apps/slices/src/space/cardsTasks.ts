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
import { appSlice } from ".";
import { cardsTaskTemplatesSlice } from ".";
import { isTaskTemplate, TaskTemplate } from "./cardsTaskTemplates";
import { registerSpaceSyncableTable } from "./syncMap";
import { registerModelSlice, AnyModelType } from "./maps";
import { projectCategoryCardsSlice } from ".";
import { dailyListsProjectionsSlice } from ".";
import { isTaskProjection } from "./dailyListsProjections";
import { projectCategoriesSlice } from ".";

// Type definitions
export const taskType = "task";
type TaskState = "todo" | "done";

export type TaskNature = "red" | "green" | "unknown";

export type Task = {
  type: typeof taskType;
  id: string;
  title: string;
  content?: string;
  state: TaskState;
  projectCategoryId: string;
  orderToken: string;
  lastToggledAt: number;
  nature?: TaskNature;
  createdAt: number;
  templateId: string | null;
  templateDate: number | null;
};

export const isTask = isObjectType<Task>(taskType);

export const defaultTask: Task = {
  type: taskType,
  projectCategoryId: "abeee7aa-8bf4-4a5f-9167-ce42ad6187b6",
  id: "17748950-3b32-4893-8fa8-ccdb269f7c52",
  title: "default task",
  state: "todo",
  orderToken: "",
  lastToggledAt: 0,
  createdAt: 0,
  nature: "unknown",
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

// Selectors and actions
export const byId = selector(function* (id: string) {
  const tasks = yield* runQuery(
    selectFrom(tasksTable, "byId")
      .where((q) => q.eq("id", id))
      .limit(1),
  );

  return tasks[0] as Task | undefined;
});

export const exists = selector(function* (id: string) {
  return !!(yield* byId(id));
});

export const byIdOrDefault = selector(function* (id: string) {
  return (yield* byId(id)) || defaultTask;
});

export const taskIdsOfTemplateId = selector(function* (ids: string[]) {
  const tasks = yield* runQuery(
    selectFrom(tasksTable, "byTemplateId").where((q) =>
      ids.map((id) => q.eq("templateId", id)),
    ),
  );

  return tasks.map((t) => t.id);
});

export const all = selector(function* () {
  const tasks = yield* runQuery(
    selectFrom(tasksTable, "byCategoryIdOrderStates"),
  );
  return tasks;
});

export const deleteTasks = action(function* (
  ids: string[],
): Generator<unknown, void, unknown> {
  yield* deleteRows(tasksTable, ids);
  yield* dailyListsProjectionsSlice.deleteProjections(ids);
});

export const updateTask = action(function* (id: string, task: Partial<Task>) {
  const taskInState = yield* byId(id);
  if (!taskInState) throw new Error("Task not found");

  yield* update(tasksTable, [{ ...taskInState, ...task }]);
});

export const createTask = action(function* (
  task: Partial<Task> & { orderToken: string; projectCategoryId: string },
) {
  const id = task.id || uuidv7();

  const newTask: Task = {
    type: taskType,
    id,
    title: "",
    state: "todo",
    lastToggledAt: Date.now(),
    createdAt: Date.now(),
    templateId: null,
    templateDate: null,
    ...task,
    nature: task.nature ?? "unknown",
  };

  yield* insert(tasksTable, [newTask]);

  return newTask;
});

export const canDrop = selector(function* (
  taskId: string,
  dropId: string,
  dropModelType: AnyModelType,
) {
  const model = yield* appSlice.byId(dropId, dropModelType);
  if (!model) return false;

  const task = yield* byId(taskId);
  if (!task) return false;

  if (task.state === "done") {
    return false;
  }

  if (isTask(model) && model.state === "done") {
    return false;
  }

  if (isTaskProjection(model)) {
    const droppedTask = yield* byId(model.id);
    return droppedTask !== undefined && droppedTask.state === "todo";
  }

  return isTask(model) || isTaskTemplate(model);
});

export const handleDrop = action(function* (
  taskId: string,
  dropId: string,
  dropModelType: AnyModelType,
  edge: "top" | "bottom",
): Generator<unknown, void, unknown> {
  if (!(yield* canDrop(taskId, dropId, dropModelType))) return;

  const task = yield* byId(taskId);
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
    yield* updateTask(dropItem.id, {
      projectCategoryId: task.projectCategoryId,
      orderToken: orderToken,
    });
  } else if (isTaskTemplate(dropItem)) {
    yield* cardsTaskTemplatesSlice.updateTemplate(dropItem.id, {
      projectCategoryId: task.projectCategoryId,
      orderToken: orderToken,
    });
  } else if (isTaskProjection(dropItem)) {
    // When dropping a projection onto a task, move the underlying task
    const droppedTask = yield* byId(dropItem.id);
    if (droppedTask) {
      yield* updateTask(droppedTask.id, {
        projectCategoryId: task.projectCategoryId,
        orderToken: orderToken,
      });
      // Keep the projection in the daily list
    }
  } else {
    shouldNeverHappen("unknown drop item type", dropItem);
  }
});

export const moveToProject = action(function* (
  taskId: string,
  projectId: string,
): Generator<unknown, void, unknown> {
  const task = yield* byId(taskId);
  if (!task) throw new Error("Task not found");

  const firstCategory = yield* projectCategoriesSlice.firstChild(projectId);
  if (!firstCategory) throw new Error("No categories found");

  yield* update(tasksTable, [
    {
      ...task,
      projectCategoryId: firstCategory.id,
    },
  ]);
});

export const toggleState = action(function* (taskId: string) {
  const task = yield* byId(taskId);
  if (!task) throw new Error("Task not found");

  yield* update(tasksTable, [
    {
      ...task,
      state: task.state === "todo" ? "done" : "todo",
      lastToggledAt: Date.now(),
    },
  ]);
});

export const createFromTemplate = action(function* (taskTemplate: TaskTemplate) {
  yield* appSlice.deleteModel(taskTemplate.id, taskTemplate.type);

  const newId = uuidv7();
  const newTask: Task = {
    id: newId,
    title: taskTemplate.title,
    state: "todo",
    projectCategoryId: taskTemplate.projectCategoryId,
    type: taskType,
    orderToken: taskTemplate.orderToken,
    lastToggledAt: Date.now(),
    nature: taskTemplate.nature ?? "unknown",
    createdAt: taskTemplate.createdAt,
    templateId: null,
    templateDate: null,
  };
  yield* insert(tasksTable, [newTask]);

  return newTask;
});

export const deleteByIds = action(function* (ids: string[]) {
  yield* deleteTasks(ids);
});

export const deleteById = action(function* (id: string) {
  yield* deleteTasks([id]);
});

// Local slice object for registerModelSlice (not exported)
const cardsTasksSlice = {
  byId,
  exists,
  byIdOrDefault,
  taskIdsOfTemplateId,
  all,
  delete: deleteTasks,
  update: updateTask,
  createTask,
  canDrop,
  handleDrop,
  moveToProject,
  toggleState,
  createFromTemplate,
  deleteByIds,
  deleteById,
};
registerModelSlice(cardsTasksSlice, tasksTable, taskType);
