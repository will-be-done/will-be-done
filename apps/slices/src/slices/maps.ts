import { type Task, tasksTable } from "./cardsTasks";
import { TaskTemplate, taskTemplatesTable } from "./cardsTaskTemplates";
import { DailyList, dailyListsTable } from "./dailyLists";
import { Project, projectsTable } from "./projects";
import { ProjectCategory, projectCategoriesTable } from "./projectsCategories";

export type AnyModel =
  | Task
  | TaskTemplate
  | Project
  | DailyList
  | ProjectCategory;

export type AnyTable =
  | typeof tasksTable
  | typeof taskTemplatesTable
  | typeof projectsTable
  | typeof dailyListsTable
  | typeof projectCategoriesTable;

type ModelSlice<T> = {
  byId: (id: string) => Generator<unknown, T | undefined, unknown>;
  delete: (ids: string[]) => Generator<unknown, void, unknown>;
  canDrop: (
    id: string,
    dropId: string,
    scope: "dailyList" | "project" | "global",
  ) => Generator<unknown, boolean, unknown>;
  handleDrop: (
    id: string,
    dropId: string,
    edge: "top" | "bottom",
    scope: "dailyList" | "project" | "global",
  ) => Generator<unknown, void, unknown>;
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
