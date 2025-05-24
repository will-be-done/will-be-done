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
import { appAction, appSelector } from "@/store/z.selectorAction.ts";
import { isObjectType } from "@/store/z.utils.ts";
import { isTaskTemplate } from "@/store/slices/taskTemplatesSlice.ts";
import { RootState } from "@/store/store.ts";
import { SyncMapping } from "../sync/mapping";

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
};
export const tasksTable = "tasks";
export const isTask = isObjectType<Task>(taskType);

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
    };
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
    };
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
    byIdOrDefault: appSelector((query, id: string): Task => {
      const task = query((state) => tasksSlice.byId(state, id));
      if (!task)
        return {
          type: taskType,
          id,
          title: "",
          state: "todo",
          projectId: "",
          orderToken: "",
          lastToggledAt: 0,
          createdAt: 0,
          horizon: "someday",
        };

      return task;
    }),
    siblings: appSelector(
      (
        query,
        taskId: string,
      ): [ProjectItem | undefined, ProjectItem | undefined] => {
        const task = query((state) => tasksSlice.byId(state, taskId));
        if (!task) return shouldNeverHappen("task not found", { taskId });

        const items = query((state) =>
          projectsSlice.childrenIds(state, task.projectId),
        );
        const i = items.findIndex((it: string) => it === taskId);
        const beforeId = items[i - 1];
        const afterId = items[i + 1];

        return [
          beforeId
            ? query((state) => tasksSlice.byId(state, beforeId))
            : undefined,
          afterId
            ? query((state) => tasksSlice.byId(state, afterId))
            : undefined,
        ];
      },
    ),

    // --actions

    delete: appAction((state: RootState, id: string) => {
      const task = tasksSlice.byId(state, id);
      if (!task) return shouldNeverHappen("task not found");

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
    createSibling: appAction(
      (
        state: RootState,
        taskId: string,
        position: "before" | "after",
      ): Task => {
        const task = tasksSlice.byId(state, taskId);

        if (!task) throw new Error("Task not found");

        return tasksSlice.createTask(state, {
          projectId: task.projectId,
          orderToken: generateKeyPositionedBetween(
            task,
            tasksSlice.siblings(state, taskId),
            position,
          ),
        });
      },
    ),
    handleDrop: appAction(
      (
        state: RootState,
        taskId: string,
        dropId: string,
        edge: "top" | "bottom",
      ) => {
        if (!tasksSlice.canDrop(state, taskId, dropId)) return;

        const task = tasksSlice.byId(state, taskId);
        if (!task) return shouldNeverHappen("task not found");

        const dropItem = appSlice.byId(state, dropId);
        if (!dropItem) return shouldNeverHappen("drop item not found");

        const [up, down] = tasksSlice.siblings(state, taskId);

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
  },
  "tasksSlice",
);
