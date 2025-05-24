import { isObjectType } from "@/store/z.utils.ts";
import { SyncMapping } from "../sync/mapping";

export const taskTemplateType = "template";
export type TaskTemplate = {
  type: typeof taskTemplateType;
  id: string;
  projectId: string;
  orderToken: string;
  createdAt: number;
};
export const isTaskTemplate = isObjectType<TaskTemplate>(taskTemplateType);
export type TaskTemplateData = {
  id: string;
  orderToken: string;
  projectId: string;
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
      projectId: data.projectId,
      orderToken: data.orderToken,
      createdAt: data.createdAt ?? 0,
    };
  },
  mapModelToData(entity) {
    return {
      id: entity.id,
      projectId: entity.projectId,
      orderToken: entity.orderToken,
      createdAt: entity.createdAt,
    };
  },
};
