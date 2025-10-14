import { tasksSlice2, type Task, tasksTable, taskType } from "./tasks";
import {
  projectionsSlice2,
  type TaskProjection,
  taskProjectionsTable,
  projectionType,
} from "./projections";
import {
  taskTemplatesSlice2,
  type TaskTemplate,
  taskTemplatesTable,
  taskTemplateType,
} from "./taskTemplates";
import {
  dailyListsSlice2,
  type DailyList,
  dailyListsTable,
  dailyListType,
} from "./dailyLists";
import {
  projectsSlice2,
  type Project,
  projectsTable,
  projectType,
} from "./projects";

// TODO: refactor on object getters. Or maybe registerSyncableTable()

export const appSyncableTables = () =>
  [
    { table: tasksTable, modelType: taskType },
    { table: taskProjectionsTable, modelType: projectionType },
    { table: taskTemplatesTable, modelType: taskTemplateType },
    { table: projectsTable, modelType: projectType },
    { table: dailyListsTable, modelType: dailyListType },
  ] as const;

export type AppSyncableModel =
  | Task
  | TaskProjection
  | TaskTemplate
  | Project
  | DailyList;

export const syncableTablesMap = () => ({
  [tasksTable.tableName]: tasksTable,
  [taskProjectionsTable.tableName]: taskProjectionsTable,
  [taskTemplatesTable.tableName]: taskTemplatesTable,
  [projectsTable.tableName]: projectsTable,
  [dailyListsTable.tableName]: dailyListsTable,
});

export const appSlices = () => ({
  [projectType]: projectsSlice2,
  [taskType]: tasksSlice2,
  [taskTemplateType]: taskTemplatesSlice2,
  [projectionType]: projectionsSlice2,
  [dailyListType]: dailyListsSlice2,
});

export const appTypeTables = () => ({
  [projectType]: projectsTable,
  [taskType]: tasksTable,
  [taskTemplateType]: taskTemplatesTable,
  [projectionType]: taskProjectionsTable,
  [dailyListType]: dailyListsTable,
});
