import { createSlice } from "@will-be-done/hyperstate";
import { appSlice } from "@/store/slices/appSlice.ts";
import { allProjectsSlice } from "@/store/slices/allProjectsSlice.ts";
import {
  fractionalCompare,
  generateOrderTokenPositioned,
  OrderableItem,
  timeCompare,
} from "@/store/order.ts";
import { shallowEqual } from "fast-equals";
import { isTask, Task, tasksSlice } from "@/store/slices/tasksSlice.ts";
import { uuidv7 } from "uuidv7";
import { generateJitteredKeyBetween } from "fractional-indexing-jittered";
import { shouldNeverHappen } from "@/utils.ts";

import { appAction, appSelector } from "@/store/z.selectorAction.ts";
import { isObjectType } from "@/store/z.utils.ts";
import {
  isTaskTemplate,
  TaskTemplate,
} from "@/store/slices/taskTemplatesSlice.ts";
import { isTaskProjection } from "@/store/slices/projectionsSlice.ts";
import { RootState } from "@/store/store.ts";
import { SyncMapping } from "../sync/mapping";

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
export const isProject = isObjectType<Project>(projectType);
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
    siblings: appSelector(
      (
        query,
        projectId: string,
      ): [Project | undefined, Project | undefined] => {
        const items = query((state) => allProjectsSlice.childrenIds(state));
        const i = items.findIndex((it: string) => it === projectId);

        const beforeId = items[i - 1];
        const afterId = items[i + 1];

        return [
          beforeId
            ? query((state) => projectsSlice.byId(state, beforeId))
            : undefined,
          afterId
            ? query((state) => projectsSlice.byId(state, afterId))
            : undefined,
        ];
      },
    ),
    childrenIds: appSelector((query, projectId: string): string[] => {
      const tasksByIds = query((state) => state.task.byIds);
      const tasks = Object.values(tasksByIds).filter(
        (task) => task.projectId === projectId,
      );

      const todoTasks = tasks.filter((t) => t.state === "todo");

      const templatesByIds = query((state) => state.template.byIds);
      const templates = Object.values(templatesByIds).filter(
        (template) => template.projectId === projectId,
      );

      return [...todoTasks, ...templates]
        .sort(fractionalCompare)
        .map((p) => p.id);
    }, shallowEqual),
    doneChildrenIds: appSelector((query, projectId: string): string[] => {
      const tasksByIds = query((state) => state.task.byIds);
      const tasks = Object.values(tasksByIds).filter(
        (task) => task.projectId === projectId,
      );

      const doneTasks = tasks.filter((t) => t.state === "done");
      const sortedDoneTasks = doneTasks.sort(timeCompare);

      return sortedDoneTasks.map((p) => p.id);
    }, shallowEqual),
    childrenCount: appSelector((query, projectId: string): number => {
      return query(
        (state) => projectsSlice.childrenIds(state, projectId).length,
      );
    }),
    firstChild: appSelector(
      (query, projectId: string): ProjectItem | undefined => {
        const childrenIds = query((state) =>
          projectsSlice.childrenIds(state, projectId),
        );
        const firstChildId = childrenIds[0];
        if (!firstChildId) return undefined;

        return query((state) => projectsSlice.getItemById(state, firstChildId));
      },
    ),
    lastChild: appSelector(
      (query, projectId: string): ProjectItem | undefined => {
        const childrenIds = query((state) =>
          projectsSlice.childrenIds(state, projectId),
        );
        const lastChildId = childrenIds[childrenIds.length - 1];
        if (!lastChildId) return undefined;

        return query((state) => projectsSlice.getItemById(state, lastChildId));
      },
    ),
    tasksIds: appSelector((query, projectId: string): string[] => {
      const childrenIds = query((state) =>
        projectsSlice.childrenIds(state, projectId),
      );
      return query((state) =>
        childrenIds
          .map((id) => tasksSlice.byId(state, id))
          .map((t) => t?.id)
          .filter((t) => t !== undefined),
      );
    }, shallowEqual),
    notDoneTaskIds: appSelector(
      (query, projectId: string, taskHorizons: Task["horizon"][]): string[] => {
        const taskIds = query((state) =>
          projectsSlice.tasksIds(state, projectId),
        );
        const byIds = query((state) => state.task.byIds);

        return taskIds.filter((id) => {
          const task = byIds[id];
          if (!task) return false;

          return task.state !== "done" && taskHorizons.includes(task.horizon);
        });
      },
      shallowEqual,
    ),
    withoutTasksByIds: appSelector(
      (query, projectId: string, ids: string[]): string[] => {
        const childrenIds = query((state) =>
          projectsSlice.childrenIds(state, projectId),
        );
        const setIds = new Set(ids);
        return childrenIds.filter((id) => !setIds.has(id));
      },
    ),
    getItemById: appSelector((query, id: string): ProjectItem | undefined => {
      return query((state) => tasksSlice.byId(state, id));
    }),

    // --actions

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
          const [up, down] = projectsSlice.siblings(state, project.id);

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
    createTask: appAction(
      (
        state: RootState,
        projectId: string,
        position:
          | [OrderableItem | undefined, OrderableItem | undefined]
          | "append"
          | "prepend",
      ): Task => {
        const project = projectsSlice.byId(state, projectId);
        if (!project) throw new Error("Project not found");

        const orderToken = generateOrderTokenPositioned(
          state,
          projectId,
          projectsSlice,
          position,
        );

        return tasksSlice.createTask(state, {
          projectId: projectId,
          orderToken: orderToken,
        });
      },
    ),
  },
  "projectsSlice",
);
