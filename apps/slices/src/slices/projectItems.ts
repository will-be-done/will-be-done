// import {
//   action,
//   deleteRows,
//   runQuery,
//   selectFrom,
//   selector,
// } from "@will-be-done/hyperdb";
// import { startOfDay } from "date-fns";
// import type { GenReturn, OrderableItem } from "./utils";
// import {
//   timeCompare,
//   generateOrderTokenPositioned,
//   generateKeyPositionedBetween,
// } from "./utils";
// import {
//   isTask,
//   tasksSlice2,
//   type Task,
//   tasksTable,
//   defaultTask,
// } from "./tasks";
// import {
//   isTaskTemplate,
//   taskTemplatesSlice2,
//   type TaskTemplate,
//   taskTemplatesTable,
//   defaultTaskTemplate,
// } from "./taskTemplates";
// import { projectsSlice2 } from "./projects";
// import { dailyListsSlice2 } from "./dailyLists";
// import { projectionsSlice2 } from "./projections";
//
// // Slice
// export const projectItemsSlice2 = {
//   // selectors
//   projectChildrenIdsExceptDailies: selector(function* (
//     projectId: string,
//     exceptDailyListIds: string[],
//   ): GenReturn<string[]> {
//     const exceptTaskIds =
//       yield* dailyListsSlice2.allTaskIds(exceptDailyListIds);
//     const tasks = yield* runQuery(
//       selectFrom(tasksTable, "byProjectIdOrderStates").where((q) =>
//         q.eq("projectId", projectId).eq("state", "todo"),
//       ),
//     );
//
//     const finalTasks = tasks.filter((task) => !exceptTaskIds.has(task.id));
//
//     const templates = yield* runQuery(
//       selectFrom(taskTemplatesTable, "byProjectIdOrderToken").where((q) =>
//         q.eq("projectId", projectId),
//       ),
//     );
//
//     const allItems = [...finalTasks, ...templates];
//
//     return allItems
//       .sort((a, b) => {
//         if (a.orderToken > b.orderToken) {
//           return 1;
//         }
//         if (a.orderToken < b.orderToken) {
//           return -1;
//         }
//
//         return 0;
//       })
//       .map((item) => item.id);
//   }),
//   projectChildrenIds: selector(function* (
//     projectId: string,
//   ): GenReturn<string[]> {
//     // TODO: maybe use merge sort?
//     const tasks = yield* runQuery(
//       selectFrom(tasksTable, "byProjectIdOrderStates").where((q) =>
//         q.eq("projectId", projectId).eq("state", "todo"),
//       ),
//     );
//
//     const templates = yield* runQuery(
//       selectFrom(taskTemplatesTable, "byProjectIdOrderToken").where((q) =>
//         q.eq("projectId", projectId),
//       ),
//     );
//
//     const allItems = [...tasks, ...templates];
//
//     return allItems
//       .sort((a, b) => {
//         if (a.orderToken > b.orderToken) {
//           return 1;
//         }
//         if (a.orderToken < b.orderToken) {
//           return -1;
//         }
//
//         return 0;
//       })
//       .map((item) => item.id);
//   }),
//   projectDoneChildrenIds: selector(function* (
//     projectId: string,
//   ): GenReturn<string[]> {
//     const tasks = yield* runQuery(
//       selectFrom(tasksTable, "byProjectIdOrderStates").where((q) =>
//         q.eq("projectId", projectId).eq("state", "done"),
//       ),
//     );
//
//     return tasks.map((p) => p.id);
//   }),
//
//   projectDoneChildrenIdsExceptDailies: selector(function* (
//     projectId: string,
//     exceptDailyListIds: string[],
//   ): GenReturn<string[]> {
//     const exceptTaskIds =
//       yield* dailyListsSlice2.allTaskIds(exceptDailyListIds);
//
//     const tasks = yield* runQuery(
//       selectFrom(tasksTable, "byProjectIdOrderStates").where((q) =>
//         q.eq("projectId", projectId).eq("state", "done"),
//       ),
//     );
//
//     return tasks.map((p) => p.id).filter((id) => !exceptTaskIds.has(id));
//   }),
//   projectTasksIds: selector(function* (projectId: string): GenReturn<string[]> {
//     const tasks = yield* runQuery(
//       selectFrom(tasksTable, "byProjectIdOrderStates").where((q) =>
//         q.eq("projectId", projectId).eq("state", "todo"),
//       ),
//     );
//     return tasks.map((t) => t.id);
//   }),
//   projectCategoriesTasksIds: selector(function* (
//     projectCategoryId: string,
//     state: "todo" | "done",
//   ): GenReturn<string[]> {
//     const tasks = yield* runQuery(
//       selectFrom(tasksTable, "byCategoryIdOrderStates").where((q) =>
//         q.eq("projectCategoryId", projectCategoryId).eq("state", state),
//       ),
//     );
//     return tasks.map((t) => t.id);
//   }),
//   projectTasks: selector(function* (projectId: string): GenReturn<Task[]> {
//     return yield* runQuery(
//       selectFrom(tasksTable, "byProjectIdOrderStates").where((q) =>
//         q.eq("projectId", projectId).eq("state", "todo"),
//       ),
//     );
//   }),
//   projectNotDoneTaskIds: selector(function* (
//     projectId: string,
//     taskHorizons: Task["horizon"][],
//   ): GenReturn<string[]> {
//     const tasks = yield* projectItemsSlice2.projectTasks(projectId);
//     const filteredTaskIds: string[] = [];
//
//     for (const task of tasks) {
//       if (!task || task.state === "done") continue;
//
//       if (
//         taskHorizons.includes(task.horizon)
//         // alwaysIncludeTaskIds.includes(task.id)
//       ) {
//         filteredTaskIds.push(task.id);
//       }
//     }
//
//     return filteredTaskIds;
//   }),
//
//   notDoneTaskCountExceptDailiesCount: selector(function* (
//     projectId: string,
//     exceptDailyListIds: string[],
//   ): GenReturn<number> {
//     return (yield* dailyListsSlice2.notDoneTaskIdsExceptDailies(
//       projectId,
//       exceptDailyListIds,
//       ["someday", "week", "month", "year"],
//       [],
//       // idsToAlwaysInclude,
//     )).length;
//   }),
//
//   overdueTaskCountExceptDailiesCount: selector(function* (
//     projectId: string,
//     exceptDailyListIds: string[],
//     currentDate: Date,
//   ): GenReturn<number> {
//     const notDoneTasks = yield* dailyListsSlice2.notDoneTaskIdsExceptDailies(
//       projectId,
//       exceptDailyListIds,
//       ["someday", "week", "month", "year"],
//       [],
//       // idsToAlwaysInclude,
//     );
//
//     let count = 0;
//     for (const taskId of notDoneTasks) {
//       const lastProjectionTime = (yield* projectionsSlice2.lastProjectionOfTask(
//         taskId,
//       ))?.createdAt;
//
//       if (
//         lastProjectionTime &&
//         startOfDay(currentDate).getTime() > lastProjectionTime
//       ) {
//         count++;
//       }
//     }
//
//     return count;
//   }),
//
//   projectWithoutTasksByIds: selector(function* (
//     projectId: string,
//     excludeIds: string[],
//   ): GenReturn<string[]> {
//     const childrenIds = yield* projectItemsSlice2.projectChildrenIds(projectId);
//     const excludeSet = new Set(excludeIds);
//     return childrenIds.filter((id) => !excludeSet.has(id));
//   }),
//   getItemById: selector(function* (id: string): GenReturn<Task | TaskTemplate> {
//     const task = yield* tasksSlice2.byId(id);
//     if (task) return task;
//
//     const template = yield* taskTemplatesSlice2.byId(id);
//     if (template) return template;
//
//     return defaultTask;
//   }),
//   siblings: selector(function* (
//     itemId: string,
//   ): GenReturn<
//     [(Task | TaskTemplate) | undefined, (Task | TaskTemplate) | undefined]
//   > {
//     const item = yield* projectItemsSlice2.getItemById(itemId);
//     if (!item) return [undefined, undefined];
//
//     const childrenIds = yield* projectItemsSlice2.projectChildrenIds(
//       item.projectId,
//     );
//     const index = childrenIds.findIndex((id) => id === itemId);
//
//     const beforeId = index > 0 ? childrenIds[index - 1] : undefined;
//     const afterId =
//       index < childrenIds.length - 1 ? childrenIds[index + 1] : undefined;
//
//     const before = beforeId
//       ? yield* projectItemsSlice2.getItemById(beforeId)
//       : undefined;
//     const after = afterId
//       ? yield* projectItemsSlice2.getItemById(afterId)
//       : undefined;
//
//     return [before, after];
//   }),
//   childrenCount: selector(function* (projectId: string): GenReturn<number> {
//     const children = yield* projectItemsSlice2.projectChildrenIds(projectId);
//     return children.length;
//   }),
//   firstChild: selector(function* (
//     projectId: string,
//   ): GenReturn<(Task | TaskTemplate) | undefined> {
//     const children = yield* projectItemsSlice2.projectChildrenIds(projectId);
//     const firstChildId = children[0];
//     return firstChildId
//       ? yield* projectItemsSlice2.getItemById(firstChildId)
//       : undefined;
//   }),
//   lastChild: selector(function* (
//     projectId: string,
//   ): GenReturn<(Task | TaskTemplate) | undefined> {
//     const children = yield* projectItemsSlice2.projectChildrenIds(projectId);
//     const lastChildId = children[children.length - 1];
//     return lastChildId
//       ? yield* projectItemsSlice2.getItemById(lastChildId)
//       : undefined;
//   }),
//
//   // actions
//   deleteById: action(function* (id: string): GenReturn<void> {
//     yield* tasksSlice2.delete([id]);
//     yield* deleteRows(taskTemplatesTable, [id]);
//   }),
//
//   createTaskIfNotExists: action(function* (
//     projectId: string,
//     taskId: string,
//     position:
//       | [OrderableItem | undefined, OrderableItem | undefined]
//       | "append"
//       | "prepend",
//     taskAttrs?: Partial<Task>,
//   ): GenReturn<Task> {
//     const task = yield* tasksSlice2.byId(taskId);
//     if (task) {
//       return task;
//     }
//
//     return yield* projectItemsSlice2.createTask(projectId, position, {
//       ...taskAttrs,
//       id: taskId,
//     });
//   }),
//   createTask: action(function* (
//     projectId: string,
//     position:
//       | [OrderableItem | undefined, OrderableItem | undefined]
//       | "append"
//       | "prepend",
//     taskAttrs?: Partial<Task>,
//   ): GenReturn<Task> {
//     const project = yield* projectsSlice2.byId(projectId);
//     if (!project) throw new Error("Project not found");
//
//     const orderToken = yield* generateOrderTokenPositioned(
//       projectId,
//       projectItemsSlice2,
//       position,
//     );
//
//     return yield* tasksSlice2.createTask({
//       ...taskAttrs,
//       orderToken: orderToken,
//       projectId: projectId,
//     });
//   }),
//   createSibling: action(function* (
//     itemId: string,
//     position: "before" | "after",
//     taskParams?: Partial<Task>,
//   ): GenReturn<Task> {
//     const projectItem = yield* projectItemsSlice2.getItemById(itemId);
//     if (!projectItem) throw new Error("Item not found");
//
//     return yield* tasksSlice2.createTask({
//       projectId: projectItem.projectId,
//       orderToken: generateKeyPositionedBetween(
//         projectItem,
//         yield* projectItemsSlice2.siblings(itemId),
//         position,
//       ),
//       ...taskParams,
//     });
//   }),
// };
