import { createSlice } from "@will-be-done/hyperstate";
import { appAction, appQuerySelector } from "../z.selectorAction";
import { shallowEqual } from "fast-equals";
import {
  fractionalCompare,
  generateKeyPositionedBetween,
  generateOrderTokenPositioned,
  OrderableItem,
  timeCompare,
} from "../order";
import { defaultTask, isTask, Task, tasksSlice, taskType } from "./tasksSlice";
import {
  isTaskTemplate,
  TaskTemplate,
  taskTemplatesSlice,
  taskTemplateType,
} from "./taskTemplatesSlice";
import { shouldNeverHappen } from "@/utils";
import { projectsSlice } from "./projectsSlice";
import { RootState } from "../store";

export type ProjectItem = Task | TaskTemplate;

// TODO: rename: projectItemsListSlice
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
    getItemById: appQuerySelector((query, id: string): ProjectItem => {
      return query(
        (state) =>
          tasksSlice.byId(state, id) ||
          taskTemplatesSlice.byId(state, id) ||
          defaultTask,
      );
    }),

    // --actions

    siblings: appQuerySelector(
      (
        query,
        itemId: string,
      ): [ProjectItem | undefined, ProjectItem | undefined] => {
        const task = query((state) =>
          projectItemsSlice.getItemById(state, itemId),
        );
        if (!task)
          return shouldNeverHappen("item not found", { taskId: itemId });

        const items = query((state) =>
          projectItemsSlice.childrenIds(state, task.projectId),
        );
        const i = items.findIndex((it: string) => it === itemId);
        const beforeId = items[i - 1];
        const afterId = items[i + 1];

        return [
          beforeId
            ? query((state) => projectItemsSlice.getItemById(state, beforeId))
            : undefined,
          afterId
            ? query((state) => projectItemsSlice.getItemById(state, afterId))
            : undefined,
        ];
      },
    ),
    createSibling: appAction(
      (
        state: RootState,
        itemId: string,
        position: "before" | "after",
        taskParams?: Partial<Task>,
      ): Task => {
        const projectItem = projectItemsSlice.getItemById(state, itemId);

        if (!projectItem) throw new Error("Task not found");

        return tasksSlice.createTask(state, {
          projectId: projectItem.projectId,
          orderToken: generateKeyPositionedBetween(
            projectItem,
            projectItemsSlice.siblings(state, itemId),
            position,
          ),
          ...taskParams,
        });
      },
    ),
    deleteById: appAction((state, id: string) => {
      tasksSlice.deleteById(state, id);
      taskTemplatesSlice.delete(state, id);
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
          return taskTemplatesSlice.createFromTask(state, item);
        } else if (isTaskTemplate(item) && newType === taskType) {
          return tasksSlice.createFromTemplate(state, item);
        } else {
          return shouldNeverHappen("Unknown conversion", { item, newType });
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
        taskAttrs?: Partial<Task>,
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
          ...taskAttrs,
          projectId: projectId,
          orderToken: orderToken,
        });
      },
    ),
  },
  "projectItemsSlice",
);
