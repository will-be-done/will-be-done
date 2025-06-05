import { createSlice } from "@will-be-done/hyperstate";
import { appAction, appQuerySelector } from "../z.selectorAction";
import { shallowEqual } from "fast-equals";
import {
  fractionalCompare,
  generateOrderTokenPositioned,
  OrderableItem,
  timeCompare,
} from "../order";
import { isTask, Task, tasksSlice, taskType } from "./tasksSlice";
import {
  isTaskTemplate,
  TaskTemplate,
  taskTemplatesSlice,
  taskTemplateType,
} from "./taskTemplatesSlice";
import { shouldNeverHappen } from "@/utils";
import { projectsSlice } from "./projectsSlice";

export type ProjectItem = Task | TaskTemplate;
export const projectItemsSlice = createSlice(
  {
    childrenIds: appQuerySelector(
      (
        query,
        projectId: string,
        alwaysIncludeChildIds: string[] = [],
      ): string[] => {
        const tasksByIds = query((state) => state.task.byIds);
        const tasks = Object.values(tasksByIds).filter(
          (task) =>
            task.projectId === projectId ||
            alwaysIncludeChildIds.includes(task.id),
        );

        const todoTasks = tasks.filter((t) => t.state === "todo");

        const templatesByIds = query((state) => state.template.byIds);
        const templates = Object.values(templatesByIds).filter(
          (template) =>
            template.projectId === projectId ||
            alwaysIncludeChildIds.includes(template.id),
        );

        return [...todoTasks, ...templates]
          .sort(fractionalCompare)
          .map((p) => p.id);
      },
      shallowEqual,
    ),
    doneChildrenIds: appQuerySelector(
      (
        query,
        projectId: string,
        alwaysIncludeTaskIds: string[] = [],
      ): string[] => {
        const tasksByIds = query((state) => state.task.byIds);
        const tasks = Object.values(tasksByIds).filter(
          (task) =>
            task.projectId === projectId ||
            alwaysIncludeTaskIds.includes(task.id),
        );

        const doneTasks = tasks.filter((t) => t.state === "done");
        const sortedDoneTasks = doneTasks.sort(timeCompare);

        return sortedDoneTasks.map((p) => p.id);
      },
      shallowEqual,
    ),
    tasksIds: appQuerySelector((query, projectId: string): string[] => {
      const childrenIds = query((state) =>
        projectItemsSlice.childrenIds(state, projectId),
      );
      return query((state) =>
        childrenIds
          .map((id) => tasksSlice.byId(state, id))
          .map((t) => t?.id)
          .filter((t) => t !== undefined),
      );
    }, shallowEqual),
    notDoneTaskIds: appQuerySelector(
      (
        query,
        projectId: string,
        taskHorizons: Task["horizon"][],
        alwaysIncludeTaskIds: string[] = [],
      ): string[] => {
        const taskIds = query((state) =>
          projectItemsSlice.tasksIds(state, projectId),
        );
        const byIds = query((state) => state.task.byIds);

        return taskIds.filter((id) => {
          const task = byIds[id];
          if (!task) return false;

          if (task.state === "done") return false;

          return (
            taskHorizons.includes(task.horizon) ||
            alwaysIncludeTaskIds.includes(task.id)
          );
        });
      },
      shallowEqual,
    ),
    withoutTasksByIds: appQuerySelector(
      (query, projectId: string, ids: string[]): string[] => {
        const childrenIds = query((state) =>
          projectItemsSlice.childrenIds(state, projectId),
        );
        const setIds = new Set(ids);
        return childrenIds.filter((id) => !setIds.has(id));
      },
    ),
    childrenCount: appQuerySelector((query, projectId: string): number => {
      return query(
        (state) => projectItemsSlice.childrenIds(state, projectId).length,
      );
    }),
    firstChild: appQuerySelector(
      (query, projectId: string): ProjectItem | undefined => {
        const childrenIds = query((state) =>
          projectItemsSlice.childrenIds(state, projectId),
        );
        const firstChildId = childrenIds[0];
        if (!firstChildId) return undefined;

        return query((state) =>
          projectItemsSlice.getItemById(state, firstChildId),
        );
      },
    ),
    lastChild: appQuerySelector(
      (query, projectId: string): ProjectItem | undefined => {
        const childrenIds = query((state) =>
          projectItemsSlice.childrenIds(state, projectId),
        );
        const lastChildId = childrenIds[childrenIds.length - 1];
        if (!lastChildId) return undefined;

        return query((state) =>
          projectItemsSlice.getItemById(state, lastChildId),
        );
      },
    ),
    getItemById: appQuerySelector(
      (query, id: string): ProjectItem | undefined => {
        return query(
          (state) =>
            tasksSlice.byId(state, id) || taskTemplatesSlice.byId(state, id),
        );
      },
    ),

    // --actions

    deleteById: appAction((state, id: string) => {
      tasksSlice.deleteById(state, id);
      taskTemplatesSlice.deleteById(state, id);
    }),
    toggleItemType: appAction(
      (
        state,
        item: ProjectItem,
        newType: typeof taskType | typeof taskTemplateType,
      ) => {
        if (item.type == newType) {
          throw new Error("Item already in correct type");
        }

        projectItemsSlice.deleteById(state, item.id);
        if (isTask(item) && newType === taskTemplateType) {
          taskTemplatesSlice.createFromTask(state, item);
        } else if (isTaskTemplate(item) && newType === taskType) {
          tasksSlice.createFromTemplate(state, item);
        } else {
          shouldNeverHappen("Unknown conversion", { item, newType });
        }
      },
    ),
    createTask: appAction(
      (
        state,
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
          projectItemsSlice,
          position,
        );

        return tasksSlice.createTask(state, {
          projectId: projectId,
          orderToken: orderToken,
        });
      },
    ),
  },
  "projectItemsSlice",
);
