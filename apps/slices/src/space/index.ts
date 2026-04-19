// Pure utilities and maps - keep as star exports
export * from "./utils";
export * from "./maps";
export * from "./syncMap";

// Slice namespace exports
export * as appSlice from "./app";
export * as cardsSlice from "./cards";
export * as cardsTasksSlice from "./cardsTasks";
export * as cardsTaskTemplatesSlice from "./cardsTaskTemplates";
export * as projectCategoriesSlice from "./projectsCategories";
export * as projectCategoryCardsSlice from "./projectsCategoriesCards";
export * as projectsSlice from "./projects";
export * as projectsAllSlice from "./projectsAll";
export * as dailyListsSlice from "./dailyLists";
export * as dailyListsProjectionsSlice from "./dailyListsProjections";
export * as stashProjectionsSlice from "./stashProjections";
export * as backupSlice from "./backup";

export type { AnyModelType } from "./maps";

// Direct re-exports of types, type guards, constants, tables, and default values

// cardsTasks
export type { Task, TaskNature } from "./cardsTasks";
export { taskType, isTask, defaultTask, tasksTable } from "./cardsTasks";

// cardsTaskTemplates
export type { TaskTemplate } from "./cardsTaskTemplates";
export { taskTemplateType, isTaskTemplate, defaultTaskTemplate, taskTemplatesTable } from "./cardsTaskTemplates";

// projects
export type { Project } from "./projects";
export { projectType, isProject, defaultProject, projectsTable } from "./projects";

// projectsCategories
export type { ProjectCategory } from "./projectsCategories";
export { projectCategoryType, isProjectCategory, defaultProjectCategory, projectCategoriesTable } from "./projectsCategories";

// dailyLists
export type { DailyList } from "./dailyLists";
export { dailyListType, isDailyList, defaultDailyList, dailyListsTable } from "./dailyLists";

// dailyListsProjections
export type { TaskProjection } from "./dailyListsProjections";
export { projectionType, isTaskProjection, defaultTaskProjection, taskProjectionsTable } from "./dailyListsProjections";

// stashProjections
export type { StashProjection } from "./stashProjections";
export { stashProjectionType, isStashProjection, defaultStashProjection, stashProjectionsTable, stashType, STASH_ID } from "./stashProjections";

// cards
export type { CardWrapper, CardWrapperType } from "./cards";

// backup
export type { Backup } from "./backup";

// importer
export { parseTickTickCSV } from "./importer/ticktick";
