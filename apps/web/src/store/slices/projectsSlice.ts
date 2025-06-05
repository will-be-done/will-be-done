import { createSlice } from "@will-be-done/hyperstate";
import { appSlice } from "@/store/slices/appSlice.ts";
import { allProjectsSlice } from "@/store/slices/allProjectsSlice.ts";
import { generateOrderTokenPositioned, OrderableItem } from "@/store/order.ts";
import { isTask, Task, tasksSlice } from "@/store/slices/tasksSlice.ts";
import { uuidv7 } from "uuidv7";
import { generateJitteredKeyBetween } from "fractional-indexing-jittered";
import { shouldNeverHappen } from "@/utils.ts";

import { appAction, appQuerySelector } from "@/store/z.selectorAction.ts";
import { isObjectType } from "@/store/z.utils.ts";
import {
  isTaskTemplate,
  TaskTemplate,
} from "@/store/slices/taskTemplatesSlice.ts";
import { isTaskProjection } from "@/store/slices/projectionsSlice.ts";
import { RootState } from "@/store/store.ts";
import { SyncMapping } from "../sync/mapping";
import { projectItemsSlice } from "./projectItemsSlice";

export type Project = {
  type: typeof projectType;
  id: string;
  title: string;
  icon: string;
  isInbox: boolean;
  orderToken: string;
  createdAt: number;
};
export const projectType = "project";
const isProject = isObjectType<Project>(projectType);
export type ProjectItem = Task | TaskTemplate;

export const inboxId = "01965eb2-7d13-727f-9f50-3d565d0ce2ef";
export type ProjectData = {
  id: string;
  title: string;
  icon: string;
  isInbox: boolean;
  orderToken: string;
  createdAt: number;
};
export const projectsTable = "projects";

export const projectsSyncMap: SyncMapping<
  typeof projectsTable,
  typeof projectType
> = {
  table: projectsTable,
  modelType: projectType,
  mapDataToModel(data) {
    return {
      type: projectType,
      id: data.id,
      title: data.title,
      icon: data.icon,
      isInbox: data.isInbox,
      orderToken: data.orderToken,
      createdAt: data.createdAt ?? 0,
    };
  },
  mapModelToData(entity) {
    return {
      id: entity.id,
      title: entity.title,
      icon: entity.icon,
      isInbox: entity.isInbox,
      orderToken: entity.orderToken,
      createdAt: entity.createdAt,
    };
  },
};

export const projectsSlice = createSlice(
  {
    byId: (state: RootState, id: string): Project | undefined =>
      state.project.byIds[id],
    byIdOrDefault: (state: RootState, id: string): Project => {
      const project = projectsSlice.byId(state, id);
      if (!project)
        return {
          type: projectType,
          id,
          title: "",
          icon: "",
          isInbox: false,
          orderToken: "",
          createdAt: 0,
        };

      return project;
    },
    canDrop(state: RootState, projectId: string, dropTargetId: string) {
      const target = appSlice.byId(state, dropTargetId);

      if (isProject(target) && target.isInbox) {
        return false;
      }

      return (
        isProject(target) ||
        isTask(target) ||
        isTaskTemplate(target) ||
        isTaskProjection(target)
      );
    },

    // -- actions

    create: appAction(
      (
        state: RootState,
        newProject: Partial<Project>,
        position:
          | [OrderableItem | undefined, OrderableItem | undefined]
          | "append"
          | "prepend",
      ) => {
        const orderToken = generateOrderTokenPositioned(
          state,
          "all-projects-list",
          allProjectsSlice,
          position,
        );

        const id = newProject.id || uuidv7();
        const project: Project = {
          type: projectType,
          id: id,
          orderToken: orderToken,
          title: "New project",
          icon: "",
          isInbox: false,
          createdAt: new Date().getTime(),
          ...newProject,
        };

        state.project.byIds[id] = project;
      },
    ),
    delete: appAction((state: RootState, id: string) => {
      delete state.project.byIds[id];
    }),
    update: appAction(
      (state: RootState, id: string, project: Partial<Project>): Project => {
        const projInState = projectsSlice.byId(state, id);
        if (!projInState) throw new Error("Project not found");

        Object.assign(projInState, project);

        return projInState;
      },
    ),
    handleDrop: appAction(
      (
        state: RootState,
        projectId: string,
        dropItemId: string,
        edge: "top" | "bottom",
      ) => {
        if (!projectsSlice.canDrop(state, projectId, dropItemId)) {
          return;
        }

        const project = projectsSlice.byId(state, projectId);
        if (!project) throw new Error("Project not found");
        const dropItem = appSlice.byId(state, dropItemId);
        if (!dropItem) throw new Error("Target not found");

        if (isProject(dropItem)) {
          const [up, down] = allProjectsSlice.siblings(state, project.id);

          let between: [string | undefined, string | undefined] = [
            project.orderToken,
            down?.orderToken,
          ];
          if (edge == "top") {
            between = [up?.orderToken, project.orderToken];
          }

          const orderToken = generateJitteredKeyBetween(
            between[0] || null,
            between[1] || null,
          );

          dropItem.orderToken = orderToken;
        } else if (isTask(dropItem) || isTaskTemplate(dropItem)) {
          dropItem.projectId = project.id;
        } else if (isTaskProjection(dropItem)) {
          const task = tasksSlice.byId(state, dropItem.taskId);
          if (!task) return shouldNeverHappen("task not found", dropItem);

          task.projectId = project.id;
        } else {
          shouldNeverHappen("unknown drop item type", dropItem);
        }
      },
    ),
  },
  "projectsSlice",
);
