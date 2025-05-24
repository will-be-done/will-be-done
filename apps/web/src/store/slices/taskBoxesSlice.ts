import { createSlice } from "@will-be-done/hyperstate";
import { shouldNeverHappen } from "@/utils.ts";
import { assertUnreachable } from "@/utils/assert.ts";
import { appSlice } from "@/store/slices/appSlice.ts";
import {
  isTaskProjection,
  projectionsSlice,
  TaskProjection,
} from "@/store/slices/projectionsSlice.ts";
import {
  isTask,
  Task,
  tasksSlice,
  taskType,
} from "@/store/slices/tasksSlice.ts";
import { appAction, appSelector } from "@/store/z.selectorAction.ts";
import { AnyModel, RootState } from "@/store/store.ts";

export type TaskBox = Task | TaskProjection;
export const taskBoxesSlice = createSlice(
  {
    taskOfModelId: appSelector((query, id: string): Task | undefined => {
      const model = query((state) => appSlice.byId(state, id));
      if (!model) return undefined;

      return query((state) => taskBoxesSlice.taskOfModel(state, model));
    }),
    taskOfModelIdOrDefault: appSelector((query, id: string): Task => {
      const model = query((state) => appSlice.byId(state, id));
      const defaultTask: Task = {
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

      if (!model) {
        return defaultTask;
      }

      return (
        query((state) => taskBoxesSlice.taskOfModel(state, model)) ||
        defaultTask
      );
    }),

    taskOfModel: (state: RootState, model: AnyModel): Task | undefined => {
      if (isTask(model)) {
        return model;
      } else if (isTaskProjection(model)) {
        return tasksSlice.byId(state, model.taskId);
      } else {
        return undefined;
      }
    },
    delete: appAction((state: RootState, id: string) => {
      const taskBox = appSlice.byId(state, id);
      if (!taskBox) return shouldNeverHappen("entity not found");

      if (isTask(taskBox)) {
        return tasksSlice.delete(state, taskBox.id);
      } else if (isTaskProjection(taskBox)) {
        return projectionsSlice.delete(state, taskBox.id);
      } else {
        shouldNeverHappen("unknown taskBox type", { taskBox });
      }
    }),
    create: appAction((state: RootState, taskBox: TaskBox) => {
      if (isTask(taskBox)) {
        return tasksSlice.createTask(state, taskBox);
      } else if (isTaskProjection(taskBox)) {
        return projectionsSlice.create(state, taskBox);
      } else {
        assertUnreachable(taskBox);
      }
    }),
    createSibling: appAction(
      (state: RootState, taskBox: TaskBox, position: "before" | "after") => {
        if (isTask(taskBox)) {
          return tasksSlice.createSibling(state, taskBox.id, position);
        } else if (isTaskProjection(taskBox)) {
          return projectionsSlice.createSibling(state, taskBox.id, position);
        } else {
          assertUnreachable(taskBox);
        }
      },
    ),
    handleDrop: appAction(
      (
        state: RootState,
        taskBox: TaskBox,
        targetId: string,
        edge: "top" | "bottom",
      ) => {
        if (isTask(taskBox)) {
          return tasksSlice.handleDrop(state, taskBox.id, targetId, edge);
        } else if (isTaskProjection(taskBox)) {
          return projectionsSlice.handleDrop(state, taskBox.id, targetId, edge);
        } else {
          assertUnreachable(taskBox);
        }
      },
    ),
  },
  "taskBoxesSlice",
);
