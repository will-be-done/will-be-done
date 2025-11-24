import { type Task, tasksTable } from "./tasks";
import { taskProjectionsTable, TaskProjection } from "./projections";
import { TaskTemplate, taskTemplatesTable } from "./taskTemplates";
import { DailyList, dailyListsTable } from "./dailyLists";
import { Project, projectsTable } from "./projects";
import { TaskGroup, taskGroupsTable } from "./taskGroups";

export type AnyModel =
  | Task
  | TaskProjection
  | TaskTemplate
  | Project
  | DailyList
  | TaskGroup;

export type AnyTable =
  | typeof tasksTable
  | typeof taskProjectionsTable
  | typeof taskTemplatesTable
  | typeof projectsTable
  | typeof dailyListsTable
  | typeof taskGroupsTable;

type ModelSlice<T> = {
  byId: (id: string) => Generator<unknown, T | undefined, unknown>;
};

export const appTypeTablesMap: Record<string, AnyTable> = {};
export const appTypeSlicesMap: Record<string, ModelSlice<AnyModel>> = {};

export const registerModelSlice = (
  slice: ModelSlice<AnyModel>,
  table: AnyTable,
  modelType: string,
) => {
  appTypeTablesMap[modelType] = table;
  appTypeSlicesMap[modelType] = slice;
};
