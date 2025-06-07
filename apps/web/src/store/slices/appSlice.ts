import { createSlice, withoutUndoAction } from "@will-be-done/hyperstate";

import { appAction, appSelector } from "@/store/z.selectorAction.ts";
import { Project, projectType } from "@/store/slices/projectsSlice.ts";

import {
  defaultTask,
  isTask,
  Task,
  tasksSlice,
  taskType,
} from "@/store/slices/tasksSlice.ts";
import {
  isTaskProjection,
  projectionsSlice,
  TaskProjection,
} from "@/store/slices/projectionsSlice.ts";
import {
  allTypes,
  AnyModel,
  AppModelChange,
  RootState,
  slices,
} from "@/store/store.ts";
import { isTaskTemplate, TaskTemplate } from "./taskTemplatesSlice";
import { assertUnreachable } from "@/utils/assert";
import { projectItemsSlice } from "./projectItemsSlice";

export const appSlice = createSlice(
  {
    resetAndApplyChanges: withoutUndoAction(
      appAction((state: RootState, changes: AppModelChange[]) => {
        for (const t of allTypes) {
          for (const id of Object.keys(state[t].byIds)) {
            delete state[t].byIds[id];
          }
        }

        appSlice.applyChanges(state, changes);
      }),
    ),
    applyChanges: withoutUndoAction(
      appAction((state: RootState, changes: AppModelChange[]) => {
        for (const ch of changes) {
          if (ch.isDeleted) {
            delete state[ch.modelType].byIds[ch.id];
          } else {
            if (isTask(ch.model) && !ch.model.lastToggledAt) {
              ch.model.lastToggledAt = new Date().getTime();
            }

            state[ch.modelType].byIds[ch.id] = ch.model;
          }
        }
      }),
    ),
    // NOTE: some store have extra logic to delete them, so maybe it's better to avoid such way
    // delete: appAction((state: RootState, id: string) => {
    //   const item = appSlice.byId(state, id);
    //   if (!item) return shouldNeverHappen("item not found");
    //
    //   delete state[item.type].byIds[item.id];
    // }),
    taskBoxById: appSelector((state: RootState, id: string) => {
      const storages = [state.task, state.projection, state.template];
      for (const storage of storages) {
        const entity = storage.byIds[id];

        if (entity) {
          return entity;
        }
      }

      return undefined;
    }),
    taskBoxByIdOrDefault: appSelector(
      (state: RootState, id: string): Task | TaskProjection | TaskTemplate => {
        const entity = appSlice.taskBoxById(state, id);
        if (!entity)
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

        return entity;
      },
    ),
    taskOfModel: appSelector(
      (state: RootState, model: AnyModel): Task | undefined => {
        if (isTask(model)) {
          return model;
        } else if (isTaskProjection(model)) {
          return tasksSlice.byId(state, model.taskId);
        } else {
          return undefined;
        }
      },
    ),
    byId: appSelector((state: RootState, id: string): AnyModel | undefined => {
      for (const storage of Object.values(slices)) {
        const entity = storage.byId(state, id);

        if (entity) {
          return entity;
        }
      }

      return undefined;
    }),
    byIdOrDefault: appSelector((state: RootState, id: string): AnyModel => {
      const entity = appSlice.byId(state, id);
      if (!entity) {
        return defaultTask;
      }

      return entity;
    }),
    delete: appAction((state: RootState, id: string): void => {
      for (const slice of Object.values(slices)) {
        slice.delete(state, id);
      }
    }),
    // TODO: maybe pass as prop to Task component
    createTaskBoxSibling: appAction(
      (
        state: RootState,
        taskBox: Task | TaskProjection | TaskTemplate,
        position: "before" | "after",
        taskParams?: Partial<Task>,
      ) => {
        if (isTask(taskBox) || isTaskTemplate(taskBox)) {
          return projectItemsSlice.createSibling(
            state,
            taskBox.id,
            position,
            taskParams,
          );
        } else if (isTaskProjection(taskBox)) {
          return projectionsSlice.createSibling(state, taskBox.id, position);
        } else {
          assertUnreachable(taskBox);
        }
      },
    ),
  },
  "appSlice",
);
