import { isObjectType } from "@/store/z.utils.ts";
import { SyncMapping } from "../sync/mapping";
import { createSlice } from "@will-be-done/hyperstate";
import { appAction, appSelector } from "../z.selectorAction";
import { Task } from "./tasksSlice";
import { uuidv7 } from "uuidv7";

export const taskTemplateType = "template";
export type TaskTemplate = {
  type: typeof taskTemplateType;
  id: string;
  title: string;
  projectId: string;
  orderToken: string;
  horizon: "week" | "month" | "year" | "someday";
  createdAt: number;
};
export const isTaskTemplate = isObjectType<TaskTemplate>(taskTemplateType);
export type TaskTemplateData = {
  id: string;
  title: string;
  orderToken: string;
  projectId: string;
  horizon: "week" | "month" | "year" | "someday";
  createdAt: number;
};
export const taskTemplatesTable = "task_templates";

export const taskTemplateSyncMap: SyncMapping<
  typeof taskTemplatesTable,
  typeof taskTemplateType
> = {
  table: taskTemplatesTable,
  modelType: taskTemplateType,
  mapDataToModel(data) {
    return {
      type: taskTemplateType,
      id: data.id,
      title: data.title,
      projectId: data.projectId,
      orderToken: data.orderToken,
      horizon: data.horizon,
      createdAt: data.createdAt ?? 0,
    };
  },
  mapModelToData(entity) {
    return {
      id: entity.id,
      title: entity.title,
      projectId: entity.projectId,
      orderToken: entity.orderToken,
      horizon: entity.horizon,
      createdAt: entity.createdAt,
    };
  },
};

export const taskTemplatesSlice = createSlice(
  {
    byId: appSelector((state, id: string) => state.template.byIds[id]),
    createFromTask: appAction((state, task: Task) => {
      const newId = uuidv7();

      const template: TaskTemplate = {
        id: newId,
        type: taskTemplateType,
        title: task.title,
        projectId: task.projectId,
        orderToken: task.orderToken,
        createdAt: task.createdAt,
        horizon: task.horizon,
      };
      state.template.byIds[newId] = template;

      return template;
    }),
    delete: appAction((state, id: string) => {
      delete state.template.byIds[id];
    }),
  },
  "taskTemplatesSlice",
);
