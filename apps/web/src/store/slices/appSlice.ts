import { createSlice, withoutUndoAction } from "@will-be-done/hyperstate";

import { appAction } from "@/store/z.selectorAction.ts";
import { Project, projectType } from "@/store/slices/projectsSlice.ts";

import { isTask, Task, taskType } from "@/store/slices/tasksSlice.ts";
import { TaskProjection } from "@/store/slices/projectionsSlice.ts";
import {
  allTypes,
  AnyModel,
  AppModelChange,
  RootState,
} from "@/store/store.ts";

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
    taskBoxById(state: RootState, id: string) {
      const storages = [state.task, state.projection];
      for (const storage of storages) {
        const entity = storage.byIds[id];

        if (entity) {
          return entity;
        }
      }

      return undefined;
    },
    taskBoxByIdOrDefault(state: RootState, id: string): Task | TaskProjection {
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
    byId(state: RootState, id: string) {
      const storages = [
        state.project,
        state.task,
        state.template,
        state.projection,
        state.dailyList,
      ];
      for (const storage of storages) {
        const entity = storage.byIds[id];

        if (entity) {
          return entity;
        }
      }

      return undefined;
    },
    byIdOrDefault(state: RootState, id: string): AnyModel {
      const entity = appSlice.byId(state, id);
      if (!entity) {
        const project: Project = {
          type: projectType,
          id,
          title: "",
          icon: "",
          isInbox: false,
          orderToken: "",
          createdAt: 0,
        };

        return project;
      }

      return entity;
    },
  },
  "appSlice",
);
