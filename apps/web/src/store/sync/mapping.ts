import { SyncableTables } from "@/store/sync/schema.ts";
import { createContext } from "@will-be-done/hyperstate";
import { projectsSyncMap, projectType } from "@/store/slices/projectsSlice.ts";
import { taskSyncMap, taskType } from "@/store/slices/tasksSlice.ts";
import {
  taskTemplateSyncMap,
  taskTemplateType,
} from "@/store/slices/taskTemplatesSlice.ts";
import {
  projectionSyncMap,
  projectionType,
} from "@/store/slices/projectionsSlice.ts";
import {
  dailyListSyncMap,
  dailyListType,
} from "@/store/slices/dailyListsSlice.ts";
import { ModelsMap } from "@/store/store.ts";

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
  [projectType]: projectsSyncMap,
  [taskType]: taskSyncMap,
  [taskTemplateType]: taskTemplateSyncMap,
  [projectionType]: projectionSyncMap,
  [dailyListType]: dailyListSyncMap,
};

export const tableModelTypeMap = Object.fromEntries(
  syncableTypes.map((t) => [syncMappings[t].table, t]),
);
