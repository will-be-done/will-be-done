import {
  action,
  deleteRows,
  insert,
  runQuery,
  selectFrom,
  selector,
} from "@will-be-done/hyperdb";
import type { GenReturn } from "./utils";
import { assertUnreachable } from "./utils";
import {
  tasksSlice2,
  type Task,
  tasksTable,
  defaultTask,
  taskType,
} from "./tasks";
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
  isTaskTemplate,
} from "./taskTemplates";
import {
  dailyListsSlice2,
  type DailyList,
  dailyListsTable,
  dailyListType,
} from "./dailyLists";
import { allProjectsSlice2 } from "./allProjects";
import {
  projectsSlice2,
  type Project,
  projectsTable,
  projectType,
} from "./projects";
import { projectItemsSlice2 } from "./projectItems";
import { isTask } from "./tasks";
import { isTaskProjection } from "./projections";
import { Backup, getNewModels } from "../backup";
import { appSlices, appTypeTables, syncableTablesMap } from "./maps";

export type AnyModel =
  | Task
  | TaskProjection
  | TaskTemplate
  | Project
  | DailyList;

// Slice
export const appSlice2 = {
  getBackup: selector(function* (): GenReturn<Backup> {
    const tasks: Task[] = yield* tasksSlice2.all();
    const projects: Project[] = yield* allProjectsSlice2.all();
    const taskTemplates: TaskTemplate[] = yield* taskTemplatesSlice2.all();
    const dailyLists: DailyList[] = [];
    const dailyListProjections: TaskProjection[] = [];

    // Get all daily lists
    const allDailyListIds = yield* dailyListsSlice2.allIds();
    for (const id of allDailyListIds) {
      const dailyList = yield* dailyListsSlice2.byId(id);
      if (dailyList) {
        dailyLists.push(dailyList);
      }
    }

    // Get all projections
    const allProjectionIds = yield* projectionsSlice2.allIds();
    for (const id of allProjectionIds) {
      const projection = yield* projectionsSlice2.byId(id);
      if (projection) {
        dailyListProjections.push(projection);
      }
    }

    return {
      tasks: tasks.map((task) => ({
        id: task.id,
        title: task.title,
        state: task.state,
        projectId: task.projectId,
        orderToken: task.orderToken,
        lastToggledAt: task.lastToggledAt,
        createdAt: task.createdAt,
        horizon: task.horizon,
        templateId: task.templateId,
        templateDate: task.templateDate,
      })),
      projects: projects.map((project) => ({
        id: project.id,
        title: project.title,
        icon: project.icon,
        isInbox: project.isInbox,
        orderToken: project.orderToken,
        createdAt: project.createdAt,
      })),
      dailyLists: dailyLists.map((dailyList) => ({
        id: dailyList.id,
        date: dailyList.date,
      })),
      dailyListProjections: dailyListProjections.map((projection) => ({
        id: projection.id,
        taskId: projection.taskId,
        orderToken: projection.orderToken,
        listId: projection.dailyListId,
        createdAt: projection.createdAt,
      })),
      taskTemplates: taskTemplates.map((template) => ({
        id: template.id,
        title: template.title,
        projectId: template.projectId,
        orderToken: template.orderToken,
        horizon: template.horizon,
        repeatRule: template.repeatRule,
        createdAt: template.createdAt,
        lastGeneratedAt: template.lastGeneratedAt,
      })),
    };
  }),
  loadBackup: selector(function* (backup: Backup): GenReturn<void> {
    for (const table of Object.values(syncableTablesMap())) {
      const allIds = (yield* runQuery(selectFrom(table, "byIds"))).map(
        (r) => r.id,
      );

      yield* deleteRows(table, allIds);
    }

    const models = getNewModels(backup);

    for (const model of models) {
      yield* insert(appTypeTables()[model.type], [model]);
    }
  }),
  // selectors
  byId: selector(function* (id: string): GenReturn<AnyModel | undefined> {
    for (const slice of Object.values(appSlices())) {
      const item = yield* slice.byId(id);
      if (item) return item;
    }

    return undefined;
  }),
  byIdOrDefault: selector(function* (id: string): GenReturn<AnyModel> {
    const entity = yield* appSlice2.byId(id);
    if (!entity) {
      return defaultTask;
    }

    return entity;
  }),
  taskOfModel: selector(function* (
    model: AnyModel,
  ): GenReturn<Task | undefined> {
    if (isTask(model)) {
      return model;
    } else if (isTaskProjection(model)) {
      return yield* tasksSlice2.byId(model.taskId);
    }
    return undefined;
  }),
  taskBoxById: selector(function* (
    id: string,
  ): GenReturn<Task | TaskTemplate | TaskProjection | undefined> {
    const slices = [tasksSlice2, projectionsSlice2, taskTemplatesSlice2];
    for (const slice of slices) {
      const res = yield* slice.byId(id);

      if (res) {
        return res;
      }
    }

    return undefined;
  }),
  taskBoxByIdOrDefault: selector(function* (
    id: string,
  ): GenReturn<Task | TaskTemplate | TaskProjection> {
    const entity = yield* appSlice2.taskBoxById(id);
    if (!entity) {
      return defaultTask;
    }

    return entity;
  }),

  // actions
  delete: action(function* (id: string): GenReturn<void> {
    // TODO: use slice.delete
    // for (const slice of Object.values(slices)) {
    //   slice.delete(id);
    // }
    yield* tasksSlice2.delete([id]);
    yield* projectionsSlice2.delete([id]);
    yield* deleteRows(taskTemplatesTable, [id]);
    yield* deleteRows(projectsTable, [id]);
    yield* deleteRows(dailyListsTable, [id]);
  }),

  createTaskBoxSibling: action(function* (
    taskBox: Task | TaskProjection | TaskTemplate,
    position: "before" | "after",
    taskParams?: Partial<Task>,
  ) {
    if (isTask(taskBox) || isTaskTemplate(taskBox)) {
      return yield* projectItemsSlice2.createSibling(
        taskBox.id,
        position,
        taskParams,
      );
    } else if (isTaskProjection(taskBox)) {
      return yield* projectionsSlice2.createSibling(taskBox.id, position);
    } else {
      assertUnreachable(taskBox);
    }
  }),
};
