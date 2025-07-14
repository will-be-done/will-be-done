import { isObjectType } from "@/store/z.utils";
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
import { uuidv7 } from "uuidv7";

export const taskType = "task";
type TaskState = "todo" | "done";
export type Task = {
  type: typeof taskType;
  id: string;
  title: string;
  state: TaskState;
  projectId: string;
  orderToken: string;
  lastToggledAt: number;
  horizon: "week" | "month" | "year" | "someday";
  createdAt: number;
  templateId?: string;
  templateDate?: number;
};
export const isTask = isObjectType<Task>(taskType);
export const defaultTask: Task = {
  type: taskType,
  id: "17748950-3b32-4893-8fa8-ccdb269f7c52",
  title: "default task",
  state: "todo",
  projectId: "",
  orderToken: "",
  lastToggledAt: 0,
  createdAt: 0,
  horizon: "someday",
};
const tasksTable = table<Task>("tasks").withIndexes({
  byId: { cols: ["id"], type: "hash" },
  byProjectIdOrderStates: {
    cols: ["projectId", "state", "orderToken"],
    type: "btree",
  },
  byTemplateId: {
    cols: ["templateId"],
    type: "hash",
  },
});

export const projectionType = "projection";
export const isTaskProjection = isObjectType<TaskProjection>(projectionType);
export type TaskProjection = {
  type: typeof projectionType;
  id: string;
  taskId: string;
  orderToken: string;
  dailyListId: string;
  createdAt: number;
};
const defaultTaskProjection: TaskProjection = {
  type: projectionType,
  id: "default-projection-id",
  taskId: "",
  orderToken: "",
  dailyListId: "",
  createdAt: 0,
};
const taskProjectionsTable = table<TaskProjection>(
  "task_projections",
).withIndexes({
  byId: { cols: ["id"], type: "hash" },
  byTaskId: { cols: ["taskId"], type: "btree" },
});

export const taskTemplateType = "template";
export type TaskTemplate = {
  type: typeof taskTemplateType;
  id: string;
  title: string;
  projectId: string;
  orderToken: string;
  horizon: "week" | "month" | "year" | "someday";
  repeatRule: string;
  createdAt: number;
  lastGeneratedAt: number;
};
export const isTaskTemplate = isObjectType<TaskTemplate>(taskTemplateType);
export const taskTemplatesTable = table<TaskTemplate>(
  "task_templates",
).withIndexes({
  byId: { cols: ["id"], type: "hash" },
});

type GenReturn<T> = Generator<unknown, T, unknown>;

export const projectItemsSlice = {
  deleteById: function* (id: string) {},
};

export const projectionsSlice = {
  // selectors
  byId: selector(function* (id: string): GenReturn<TaskProjection | undefined> {
    const projections = yield* runQuery(
      selectFrom(taskProjectionsTable, "byId").where((q) => q.eq("id", id)),
    );

    return projections[0];
  }),
  byIdOrDefault: selector(function* (id: string): GenReturn<TaskProjection> {
    return (yield* projectionsSlice.byId(id)) || defaultTaskProjection;
  }),
  canDrop(taskProjectionId: string, dropId: string) {
    // TODO: add
  },
  siblings: selector(function* (
    taskProjectionId: string,
  ): GenReturn<[TaskProjection | undefined, TaskProjection | undefined]> {
    // TODO: add
  }),
  projectionIdsByTaskId: selector(function* (
    taskId: string,
  ): GenReturn<string[]> {
    const projections = yield* runQuery(
      selectFrom(taskProjectionsTable, "byTaskId").where((q) =>
        q.eq("taskId", taskId),
      ),
    );

    return projections.map((p) => p.id);
  }),

  // actions
  deleteProjectionsOfTask: action(function* (
    taskIds: string[],
  ): GenReturn<void> {
    const projectionIds: string[] = [];

    for (const taskId of taskIds) {
      const ids = yield* projectionsSlice.projectionIdsByTaskId(taskId);
      projectionIds.push(...ids);
    }

    yield* deleteRows(taskProjectionsTable, projectionIds);
  }),
};

export const tasksSlice = {
  canDrop: selector(function* (taskId: string, dropId: string) {
    // TODO: add
  }),
  byId: selector(function* (id: string): GenReturn<Task | undefined> {
    const tasks = yield* runQuery(
      selectFrom(tasksTable, "byId")
        .where((q) => q.eq("id", id))
        .limit(1),
    );

    return tasks[0];
  }),
  byIdOrDefault: selector(function* (id: string): GenReturn<Task> {
    return (yield* tasksSlice.byId(id)) || defaultTask;
  }),
  taskIdsOfTemplateId: selector(function* (id: string): GenReturn<string[]> {
    const tasks = yield* runQuery(
      selectFrom(tasksTable, "byTemplateId").where((q) =>
        q.eq("templateId", id),
      ),
    );

    return tasks.map((t) => t.id);
  }),

  // actions
  delete: action(function* (ids: string[]): GenReturn<void> {
    yield* deleteRows(tasksTable, ids);
    yield* projectionsSlice.deleteProjectionsOfTask(ids);
  }),
  update: action(function* (id: string, task: Partial<Task>): GenReturn<void> {
    const taskInState = yield* tasksSlice.byId(id);
    if (!taskInState) throw new Error("Task not found");
    Object.assign(taskInState, task);

    yield* update(tasksTable, [taskInState]);
  }),
  createTask: action(function* (
    task: Partial<Task> & { projectId: string; orderToken: string },
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
      ...task,
    };

    yield* update(tasksTable, [newTask]);

    return newTask;
  }),
  handleDrop: action(function* (
    taskId: string,
    dropId: string,
    edge: "top" | "bottom",
  ) {
    // TODO: add
  }),
  toggleState: action(function* (taskId: string): GenReturn<void> {
    const task = yield* tasksSlice.byId(taskId);
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
    yield* projectItemsSlice.deleteById(taskTemplate.id);

    const newId = uuidv7();
    const newTask: Task = {
      id: newId,
      title: taskTemplate.title,
      state: "todo",
      projectId: taskTemplate.projectId,
      type: taskType,
      orderToken: taskTemplate.orderToken,
      lastToggledAt: Date.now(),
      horizon: taskTemplate.horizon,
      createdAt: taskTemplate.createdAt,
    };
    yield* insert(tasksTable, [newTask]);

    return newTask;
  }),
  deleteByIds: action(function* (ids: string[]) {
    yield* deleteRows(tasksTable, ids);
  }),
};
