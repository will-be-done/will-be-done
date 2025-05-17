import {
  dailyListType,
  ModelsMap,
  projectionType,
  projectType,
  TaskState,
  taskTemplateType,
  taskType,
} from "@/models/models2";
import {
  dailyListsTable,
  projectsTable,
  SyncableTables,
  taskProjectionsTable,
  tasksTable,
  taskTemplatesTable,
} from "@/sync/schema";
import { createContext } from "@will-be-done/hyperstate";

export const skipSyncCtx = createContext("skipSync", false);

export type SyncMapping<
  TTable extends keyof SyncableTables = keyof SyncableTables,
  TModelType extends keyof ModelsMap = keyof ModelsMap,
> = {
  table: TTable;
  modelType: TModelType;
  mapDataToModel(
    data: SyncableTables[TTable]["data"]["__select__"],
  ): ModelsMap[TModelType];
  mapModelToData(
    entity: ModelsMap[TModelType],
  ): SyncableTables[TTable]["data"]["__select__"];
};

export const syncableTypes = [
  projectType,
  taskType,
  taskTemplateType,
  projectionType,
  dailyListType,
] as const;

type SyncMappingsType = {
  [K in (typeof syncableTypes)[number]]: SyncMapping<keyof SyncableTables, K>;
};

export const syncMappings: SyncMappingsType = {
  [projectType]: {
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
  } satisfies SyncMapping<typeof projectsTable, typeof projectType>,
  [taskType]: {
    table: tasksTable,
    modelType: taskType,
    mapDataToModel(data) {
      return {
        type: taskType,
        id: data.id,
        title: data.title,
        state: data.state as TaskState,
        projectId: data.projectId,
        orderToken: data.orderToken,
        lastToggledAt:
          data.lastToggledAt == 0 ? new Date().getTime() : data.lastToggledAt,
        createdAt: data.createdAt ?? 0,
        horizon: data.horizon || "someday",
      };
    },
    mapModelToData(entity) {
      return {
        id: entity.id,
        title: entity.title,
        state: entity.state,
        projectId: entity.projectId,
        orderToken: entity.orderToken,
        lastToggledAt: entity.lastToggledAt,
        createdAt: entity.createdAt,
        horizon: entity.horizon,
      };
    },
  } satisfies SyncMapping<typeof tasksTable, typeof taskType>,
  [taskTemplateType]: {
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
  } satisfies SyncMapping<typeof taskTemplatesTable, typeof taskTemplateType>,
  [projectionType]: {
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
  } satisfies SyncMapping<typeof taskProjectionsTable, typeof projectionType>,
  [dailyListType]: {
    table: dailyListsTable,
    modelType: dailyListType,
    mapDataToModel(data) {
      return {
        type: dailyListType,
        id: data.id,
        date: data.date,
      };
    },
    mapModelToData(entity) {
      return {
        id: entity.id,
        date: entity.date,
      };
    },
  } satisfies SyncMapping<typeof dailyListsTable, typeof dailyListType>,
};

export const tableModelTypeMap = Object.fromEntries(
  syncableTypes.map((t) => [syncMappings[t].table, t]),
);
