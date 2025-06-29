import { createSlice } from "@will-be-done/hyperstate";
import { appSlice } from "@/store/slices/appSlice.ts";
import { shouldNeverHappen } from "@/utils.ts";
import { dailyListsSlice } from "@/store/slices/dailyListsSlice.ts";
import { shallowEqual } from "fast-equals";
import { generateJitteredKeyBetween } from "fractional-indexing-jittered";
import { uuidv7 } from "uuidv7";
import { isTask, Task, tasksSlice } from "@/store/slices/tasksSlice.ts";
import { generateKeyPositionedBetween } from "@/store/order.ts";
import {
  appAction,
  appQuerySelector,
  appSelector,
} from "@/store/z.selectorAction.ts";
import { isObjectType } from "@/store/z.utils.ts";
import { RootState } from "@/store/store.ts";
import { SyncMapping } from "../sync/mapping";
import { projectItemsSlice } from "./projectItemsSlice";

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
export type TaskProjectionData = {
  id: string;
  taskId: string;
  orderToken: string;
  dailyListId: string;
  createdAt: number;
};
export const taskProjectionsTable = "task_projections";

export const projectionSyncMap: SyncMapping<
  typeof taskProjectionsTable,
  typeof projectionType
> = {
  table: taskProjectionsTable,
  modelType: projectionType,
  mapDataToModel(data) {
    return {
      type: projectionType,
      id: data.id,
      taskId: data.taskId,
      orderToken: data.orderToken,
      dailyListId: data.dailyListId,
      createdAt: data.createdAt ?? 0,
    };
  },
  mapModelToData(entity) {
    return {
      id: entity.id,
      taskId: entity.taskId,
      orderToken: entity.orderToken,
      dailyListId: entity.dailyListId,
      createdAt: entity.createdAt,
    };
  },
};

export const projectionsSlice = createSlice(
  {
    byId: (state: RootState, id: string) => state.projection.byIds[id],
    byIdOrDefault: (state: RootState, id: string): TaskProjection => {
      const proj = projectionsSlice.byId(state, id);
      if (!proj)
        return {
          type: projectionType,
          id,
          taskId: "",
          orderToken: "",
          dailyListId: "",
          createdAt: 0,
        };

      return proj;
    },
    canDrop(state: RootState, taskProjectionId: string, dropId: string) {
      const model = appSlice.byId(state, dropId);
      if (!model) return shouldNeverHappen("target not found");

      const projection = projectionsSlice.byId(state, taskProjectionId);
      if (!projection) return shouldNeverHappen("projection not found");

      const projectionTask = tasksSlice.byId(state, projection.taskId);
      if (!projectionTask) return shouldNeverHappen("task not found");

      if (projectionTask.state === "done") {
        return false;
      }

      if (isTaskProjection(model)) {
        const modelTask = tasksSlice.byId(state, model.taskId);
        if (!modelTask) return shouldNeverHappen("task not found");

        if (modelTask.state === "done") {
          return false;
        }
      }

      return isTaskProjection(model) || isTask(model);
    },
    siblings: appQuerySelector(
      (
        query,
        taskProjectionId: string,
      ): [TaskProjection | undefined, TaskProjection | undefined] => {
        const item = query((state) =>
          projectionsSlice.byId(state, taskProjectionId),
        );
        if (!item)
          return shouldNeverHappen("item not found", { taskProjectionId });

        const items = query((state) =>
          dailyListsSlice.childrenIds(state, item.dailyListId),
        );
        const i = items.findIndex((it: string) => it === taskProjectionId);

        const beforeId = items[i - 1];
        const afterId = items[i + 1];

        return [
          beforeId
            ? query((state) => projectionsSlice.byId(state, beforeId))
            : undefined,
          afterId
            ? query((state) => projectionsSlice.byId(state, afterId))
            : undefined,
        ];
      },
    ),

    projectionIdsByTaskId: appQuerySelector(
      (query, taskId: string): string[] => {
        const byIds = query((state) => state.projection.byIds);

        return Object.values(byIds)
          .filter((proj) => proj.taskId === taskId)
          .map((p) => p.id);
      },
      shallowEqual,
    ),

    projectionsOfTask: appSelector(
      (state, taskId: string): TaskProjection[] => {
        const byIds = state.projection.byIds;

        return Object.values(byIds).filter((proj) => proj.taskId === taskId);
      },
      shallowEqual,
    ),

    lastProjectionOfTask: appSelector(
      (state, taskId: string): TaskProjection | undefined => {
        const projections = projectionsSlice.projectionsOfTask(state, taskId);

        if (projections.length === 0) return undefined;

        return projections.reduce((latest, current) =>
          current.createdAt > latest.createdAt ? current : latest,
        );
      },
    ),

    // --actions
    delete: appAction((state: RootState, id: string) => {
      const proj = projectionsSlice.byId(state, id);
      if (!proj) return;

      delete state.projection.byIds[proj.id];
    }),
    deleteProjectionsOfTask: appAction((state: RootState, taskId: string) => {
      const projectionIds = projectionsSlice.projectionIdsByTaskId(
        state,
        taskId,
      );

      for (const id of projectionIds) {
        projectionsSlice.delete(state, id);
      }
    }),
    handleDrop: appAction(
      (
        state: RootState,
        taskProjectionId: string,
        dropId: string,
        edge: "top" | "bottom",
      ) => {
        if (!projectionsSlice.canDrop(state, taskProjectionId, dropId)) {
          return;
        }

        const taskProjection = projectionsSlice.byId(state, taskProjectionId);
        if (!taskProjection) return shouldNeverHappen("task not found");

        const dropItem = appSlice.byId(state, dropId);
        if (!dropItem) return shouldNeverHappen("drop item not found");

        const [up, down] = projectionsSlice.siblings(state, taskProjectionId);

        let between: [string | undefined, string | undefined] = [
          taskProjection.orderToken,
          down?.orderToken,
        ];

        if (edge == "top") {
          between = [up?.orderToken, taskProjection.orderToken];
        }

        const orderToken = generateJitteredKeyBetween(
          between[0] || null,
          between[1] || null,
        );

        if (isTaskProjection(dropItem)) {
          dropItem.orderToken = orderToken;
          dropItem.dailyListId = taskProjection.dailyListId;
        } else if (isTask(dropItem)) {
          projectionsSlice.create(state, {
            taskId: dropItem.id,
            dailyListId: taskProjection.dailyListId,
            orderToken: orderToken,
          });
        } else {
          shouldNeverHappen("unknown drop item type", dropItem);
        }
      },
    ),
    create: appAction(
      (
        state: RootState,
        taskProjection: Partial<TaskProjection> & {
          taskId: string;
          dailyListId: string;
          orderToken: string;
        },
      ) => {
        const id = taskProjection.id || uuidv7();

        const newTaskProjection: TaskProjection = {
          type: projectionType,
          id,
          createdAt: new Date().getTime(),
          ...taskProjection,
        };

        state.projection.byIds[id] = newTaskProjection;

        return newTaskProjection;
      },
    ),
    createSibling: appAction(
      (
        state: RootState,
        taskProjectionId: string,
        position: "before" | "after",
        taskParams?: Partial<Task>,
      ): TaskProjection => {
        const taskProjection = projectionsSlice.byId(state, taskProjectionId);

        if (!taskProjection) throw new Error("TaskProjection not found");
        const newTask = projectItemsSlice.createSibling(
          state,
          taskProjection.taskId,
          position,
          taskParams,
        );

        return projectionsSlice.create(state, {
          taskId: newTask.id,
          dailyListId: taskProjection.dailyListId,
          orderToken: generateKeyPositionedBetween(
            taskProjection,
            projectionsSlice.siblings(state, taskProjectionId),
            position,
          ),
        });
      },
    ),
  },
  "projectionsSlice",
);
