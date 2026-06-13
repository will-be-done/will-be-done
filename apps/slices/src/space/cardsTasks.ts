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
  upsert,
  v,
} from "@will-be-done/hyperdb-lib";
import { generateJitteredKeyBetween } from "fractional-indexing-jittered";
import { uuidv7 } from "uuidv7";
import { appSlice } from ".";
import { cardsTaskTemplatesSlice } from ".";
import { checklistItemsSlice } from ".";
import { isTaskTemplate, TaskTemplate } from "./cardsTaskTemplates";
import { registerSpaceSyncableTable } from "./syncMap";
import { registerModelSlice, AnyModelType } from "./maps";
import { projectCategoryCardsSlice } from ".";
import { dailyListsProjectionsSlice } from ".";
import { isTaskProjection } from "./dailyListsProjections";
import { projectCategoriesSlice } from ".";

// Type definitions
export const taskType = "task";

export type TaskNature = "red" | "green" | "unknown";

export const tasksTable = defineTable("tasks", {
  type: v.literal(taskType),
  id: v.string(),
  title: v.string(),
  content: v.optional(v.string()),
  state: v.union(v.literal("todo"), v.literal("done")),
  projectCategoryId: v.string(),
  orderToken: v.string(),
  lastToggledAt: v.number(),
  nature: v.optional(
    v.union(v.literal("red"), v.literal("green"), v.literal("unknown")),
  ),
  createdAt: v.number(),
  templateId: v.union(v.string(), v.null()),
  templateDate: v.union(v.number(), v.null()),
})
  .index("byIds", ["id"])
  .index("byCategoryIdOrderStates", [
    "projectCategoryId",
    "state",
    "orderToken",
  ])
  .index("byTemplateId", ["templateId"], { type: "hash" });
export type Task = ExtractSchema<typeof tasksTable>;

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

registerSpaceSyncableTable(tasksTable, taskType);

// Selectors and actions
export const byId = selector(function* byId(id: string) {
  const tasks = yield* selectFrom(tasksTable, "byId")
      .where((q) => q.eq("id", id))
      .limit(1);

  return tasks[0] as Task | undefined;
});

export const exists = selector(function* exists(id: string) {
  return !!(yield* byId(id));
});

export const byIdOrDefault = selector(function* byIdOrDefault(id: string) {
  return (yield* byId(id)) || defaultTask;
});

export const taskIdsOfTemplateId = selector(function* taskIdsOfTemplateId(ids: string[]) {
  const tasks = yield* selectFrom(tasksTable, "byTemplateId").where((q) =>
      ids.map((id) => q.eq("templateId", id)),
    );

  return tasks.map((t) => t.id);
});

export const all = selector(function* all() {
  const tasks = yield* selectFrom(tasksTable, "byCategoryIdOrderStates");
  return tasks;
});

export const deleteTasks = action(function* deleteTasks(
  ids: string[],
): Generator<unknown, void, unknown> {
  yield* checklistItemsSlice.deleteForParents(ids, taskType);
  yield* deleteRows(tasksTable, ids);
  yield* dailyListsProjectionsSlice.deleteProjections(ids);
});

export const updateTask = action(function* updateTask(id: string, task: Partial<Task>) {
  const taskInState = yield* byId(id);
  if (!taskInState) throw new Error("Task not found");

  yield* upsert(tasksTable, [{ ...taskInState, ...task }]);
});

export const createTask = action(function* createTask(
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

export const canDrop = selector(function* canDrop(
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

  if (
    yield* checklistItemsSlice.canDropOnParent(
      taskId,
      taskType,
      dropId,
      dropModelType,
    )
  ) {
    return true;
  }

  return isTask(model) || isTaskTemplate(model);
});

export const handleDrop = action(function* handleDrop(
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
  } else if (
    yield* checklistItemsSlice.canDropOnParent(
      taskId,
      taskType,
      dropId,
      dropModelType,
    )
  ) {
    yield* checklistItemsSlice.handleDropOnParent(
      taskId,
      taskType,
      dropId,
      dropModelType,
      edge,
    );
  } else {
    shouldNeverHappen("unknown drop item type", dropItem);
  }
});

export const moveToProject = action(function* moveToProject(
  taskId: string,
  projectId: string,
): Generator<unknown, void, unknown> {
  const task = yield* byId(taskId);
  if (!task) throw new Error("Task not found");

  const firstCategory = yield* projectCategoriesSlice.firstChild(projectId);
  if (!firstCategory) throw new Error("No categories found");

  yield* upsert(tasksTable, [
    {
      ...task,
      projectCategoryId: firstCategory.id,
    },
  ]);
});

export const toggleState = action(function* toggleState(taskId: string) {
  const task = yield* byId(taskId);
  if (!task) throw new Error("Task not found");

  yield* upsert(tasksTable, [
    {
      ...task,
      state: task.state === "todo" ? "done" : "todo",
      lastToggledAt: Date.now(),
    },
  ]);
});

export const createFromTemplate = action(function* createFromTemplate(
  taskTemplate: TaskTemplate,
) {
  const newId = uuidv7();
  yield* checklistItemsSlice.copyItems(
    taskTemplate.id,
    "template",
    newId,
    taskType,
  );
  yield* appSlice.deleteModel(taskTemplate.id, taskTemplate.type);

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
    content: taskTemplate.content,
    templateId: null,
    templateDate: null,
  };
  yield* insert(tasksTable, [newTask]);

  return newTask;
});

export const deleteByIds = action(function* deleteByIds(ids: string[]) {
  yield* deleteTasks(ids);
});

export const deleteById = action(function* deleteById(id: string) {
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
