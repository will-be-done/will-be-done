import { createSlice } from "@will-be-done/hyperstate";
import { appSlice } from "@/store/slices/appSlice.ts";
import { shouldNeverHappen } from "@/utils.ts";
import {
  isTaskProjection,
  projectionsSlice,
} from "@/store/slices/projectionsSlice.ts";
import { uuidv7 } from "uuidv7";
import { generateJitteredKeyBetween } from "fractional-indexing-jittered";
import { ProjectItem, projectsSlice } from "@/store/slices/projectsSlice.ts";
import { generateKeyPositionedBetween } from "@/store/order.ts";
import {
  appAction,
  appQuerySelector,
  appSelector,
} from "@/store/z.selectorAction.ts";
import { isObjectType } from "@/store/z.utils.ts";
import {
  isTaskTemplate,
  TaskTemplate,
  taskTemplatesSlice,
} from "@/store/slices/taskTemplatesSlice.ts";
import { RootState } from "@/store/store.ts";
import { SyncMapping } from "../sync/mapping";
import { projectItemsSlice } from "./projectItemsSlice";
import { template } from "es-toolkit/compat";
import { shallowEqual } from "fast-equals";

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
  templateData?: {
    templateId: string;
    templateDate: number;
  };
};
export type TaskData = {
  id: string;
  title: string;
  state: string;
  projectId: string;
  orderToken: string;
  lastToggledAt: number;
  createdAt: number;
  horizon: "week" | "month" | "year" | "someday" | undefined;
  templateId?: string;
  templateDate?: number;
};
export const tasksTable = "tasks";
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

export const taskSyncMap: SyncMapping<typeof tasksTable, typeof taskType> = {
  table: tasksTable,
  modelType: taskType,
  mapDataToModel(data) {
    return {
      type: taskType,
      id: data.id,
      title: data.title,
      state: data.state as TaskState,
      projectId: data.projectId,
      orderToken: data.orderToken,
      lastToggledAt:
        data.lastToggledAt == 0 ? new Date().getTime() : data.lastToggledAt,
      createdAt: data.createdAt ?? 0,
      horizon: data.horizon || "someday",
      templateData:
        data.templateId && data.templateDate
          ? {
              templateId: data.templateId,
              templateDate: data.templateDate,
            }
          : undefined,
    } satisfies Task;
  },
  mapModelToData(entity) {
    return {
      id: entity.id,
      title: entity.title,
      state: entity.state,
      projectId: entity.projectId,
      orderToken: entity.orderToken,
      lastToggledAt: entity.lastToggledAt,
      createdAt: entity.createdAt,
      horizon: entity.horizon,
      templateId: entity.templateData?.templateId,
      templateDate: entity.templateData?.templateDate,
    } satisfies TaskData;
  },
};

export const tasksSlice = createSlice(
  {
    canDrop(state: RootState, taskId: string, dropId: string) {
      const model = appSlice.byId(state, dropId);
      if (!model) return shouldNeverHappen("target not found");

      const task = tasksSlice.byId(state, taskId);
      if (!task) return shouldNeverHappen("task not found");

      if (task.state === "done") {
        return false;
      }

      if (isTask(model) && model.state === "done") {
        return false;
      }

      return isTaskProjection(model) || isTask(model);
    },
    byId: (state: RootState, id: string): Task | undefined =>
      state.task.byIds[id],
    byIdOrDefault: appQuerySelector((query, id: string): Task => {
      const task = query((state) => tasksSlice.byId(state, id));
      if (!task) return defaultTask;

      return task;
    }),
    all: appSelector((state): Task[] => Object.values(state.task.byIds)),
    taskIdsOfTemplateId: appSelector((state, id: string): string[] => {
      const tasks = tasksSlice.all(state);

      return tasks
        .filter((t) => t.templateData?.templateId == id)
        .map((t) => t.id);
    }, shallowEqual),

    // --actions

    delete: appAction((state: RootState, id: string) => {
      const task = tasksSlice.byId(state, id);
      if (!task) return;

      delete state.task.byIds[task.id];

      projectionsSlice.deleteProjectionsOfTask(state, task.id);
    }),
    update: appAction(
      (state: RootState, id: string, task: Partial<Task>): Task => {
        const taskInState = tasksSlice.byId(state, id);
        if (!taskInState) throw new Error("Task not found");

        Object.assign(taskInState, task);

        return taskInState;
      },
    ),

    createTask: appAction(
      (
        state: RootState,
        task: Partial<Task> & { projectId: string; orderToken: string },
      ) => {
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

        state.task.byIds[id] = newTask;

        return newTask;
      },
    ),
    handleDrop: appAction(
      (
        state: RootState,
        taskId: string,
        dropId: string,
        edge: "top" | "bottom",
      ): void => {
        if (!tasksSlice.canDrop(state, taskId, dropId)) return;

        const task = tasksSlice.byId(state, taskId);
        if (!task) return shouldNeverHappen("task not found");

        const dropItem = appSlice.byId(state, dropId);
        if (!dropItem) return shouldNeverHappen("drop item not found");

        const [up, down] = projectItemsSlice.siblings(state, taskId);

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

        if (isTask(dropItem) || isTaskTemplate(dropItem)) {
          dropItem.orderToken = orderToken;
          dropItem.projectId = task.projectId;
        } else if (isTaskProjection(dropItem)) {
          const taskOfDrop = tasksSlice.byId(state, dropItem.taskId);
          if (!taskOfDrop) return shouldNeverHappen("task not found", dropItem);

          taskOfDrop.orderToken = orderToken;
          taskOfDrop.projectId = task.projectId;

          projectionsSlice.delete(state, dropItem.id);
        } else {
          shouldNeverHappen("unknown drop item type", dropItem);
        }
      },
    ),
    toggleState: appAction((state: RootState, taskId: string) => {
      const task = tasksSlice.byId(state, taskId);
      if (!task) throw new Error("Task not found");

      task.state = task.state === "todo" ? "done" : "todo";
      task.lastToggledAt = Date.now();
    }),

    createFromTemplate: appAction(
      (state: RootState, taskTemplate: TaskTemplate) => {
        projectItemsSlice.deleteById(state, taskTemplate.id);

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
        state.task.byIds[newId] = newTask;

        return newTask;
      },
    ),
    deleteById: appAction((state: RootState, id: string) => {
      delete state.task.byIds[id];
    }),
  },
  "tasksSlice",
);
