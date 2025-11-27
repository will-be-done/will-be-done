import {
  deleteRows,
  insert,
  runQuery,
  selectFrom,
  selector,
} from "@will-be-done/hyperdb";
import type { GenReturn } from "./utils";
import { getDMY } from "./utils";
import { tasksSlice2, type Task, taskType } from "./cardsTasks";
import {
  projectionsSlice2,
  projectionType,
  type TaskProjection,
} from "./dailyListsProjections";
import {
  taskTemplatesSlice2,
  type TaskTemplate,
  taskTemplateType,
} from "./cardsTaskTemplates";
import { dailyListsSlice2, dailyListType, type DailyList } from "./dailyLists";
import { allProjectsSlice2 } from "./projectsAll";
import { projectType, type Project } from "./projects";
import { AnyModel, appTypeTablesMap } from "./maps";
import { registeredSyncableTables } from "./syncMap";
import {
  projectCategoriesSlice2,
  ProjectCategory,
  projectCategoryType,
} from "./projectsCategories";
import uuidByString from "uuid-by-string";

interface CategoryBackup {
  id: string;
  title: string;
  projectId: string;
  createdAt: number;
  orderToken: string;
}

interface TaskBackup {
  id: string;
  title: string;
  state: "todo" | "done";
  // projectId: string;
  projectCategoryId: string;
  orderToken: string;
  lastToggledAt: number;
  createdAt: number;
  horizon?: "week" | "month" | "year" | "someday";
  templateId: string | null;
  templateDate: number | null;
}

interface ProjectBackup {
  id: string;
  title: string;
  icon: string;
  isInbox: boolean;
  orderToken: string;
  createdAt: number;
}

interface DailyListBackup {
  id: string;
  date: string;
}

interface DailyListProjectionBackup {
  id: string;
  taskId: string;
  orderToken: string;
  listId: string;
  createdAt: number;
}

interface TaskTemplateBackup {
  id: string;
  title: string;
  // projectId: string;
  orderToken: string;
  horizon: "week" | "month" | "year" | "someday";
  repeatRule: string;
  createdAt: number;
  lastGeneratedAt: number;
  projectCategoryId: string;
}

export interface Backup {
  tasks: TaskBackup[];
  projects: ProjectBackup[];
  dailyLists: DailyListBackup[];
  dailyListProjections: DailyListProjectionBackup[];
  taskTemplates: TaskTemplateBackup[];
  projectCategories: CategoryBackup[];
}

const getNewModels = (backup: Backup): AnyModel[] => {
  const models: AnyModel[] = [];

  // First, create all projects
  for (const projectBackup of backup.projects) {
    const project: Project = {
      type: projectType,
      id: projectBackup.id,
      title: projectBackup.title,
      icon: projectBackup.icon,
      isInbox: projectBackup.isInbox,
      orderToken: projectBackup.orderToken,
      createdAt: projectBackup.createdAt,
    };

    models.push(project);
  }

  for (const categoryBackup of backup.projectCategories) {
    const category: ProjectCategory = {
      type: projectCategoryType,
      id: categoryBackup.id,
      title: categoryBackup.title,
      projectId: categoryBackup.projectId,
      createdAt: categoryBackup.createdAt,
      orderToken: categoryBackup.orderToken,
    };

    models.push(category);
  }

  // Then create all tasks
  for (const taskBackup of backup.tasks) {
    const category = backup.projectCategories.find(
      (p) => p.id === taskBackup.projectCategoryId,
    );
    if (!category) {
      console.warn(
        `Project ${taskBackup.projectCategoryId} not found for template ${taskBackup.id}`,
      );
      continue;
    }

    const task: Task = {
      type: taskType,
      id: taskBackup.id,
      title: taskBackup.title,
      state: taskBackup.state,
      // projectId: taskBackup.projectId,
      projectCategoryId: taskBackup.projectCategoryId,
      orderToken: taskBackup.orderToken,
      lastToggledAt: taskBackup.lastToggledAt,
      createdAt: taskBackup.createdAt,
      horizon: taskBackup.horizon || "someday",
      templateId: taskBackup.templateId || null,
      templateDate: taskBackup.templateDate || null,
    };

    models.push(task);
  }

  // Create daily lists
  for (const dailyListBackup of backup.dailyLists) {
    if (dailyListBackup.date.length !== 10) {
      dailyListBackup.date = getDMY(new Date(dailyListBackup.date));
    }

    const dailyList: DailyList = {
      type: dailyListType,
      id: uuidByString(dailyListBackup.date),
      date: dailyListBackup.date,
    };

    models.push(dailyList);
  }

  // Create task templates
  for (const templateBackup of backup.taskTemplates || []) {
    const category = backup.projectCategories.find(
      (p) => p.id === templateBackup.projectCategoryId,
    );
    if (!category) {
      console.warn(
        `Project ${templateBackup.projectCategoryId} not found for template ${templateBackup.id}`,
      );
      continue;
    }

    const template: TaskTemplate = {
      type: taskTemplateType,
      id: templateBackup.id,
      title: templateBackup.title,
      orderToken: templateBackup.orderToken,
      horizon: templateBackup.horizon,
      repeatRule: templateBackup.repeatRule,
      createdAt: templateBackup.createdAt,
      lastGeneratedAt: templateBackup.lastGeneratedAt,
      projectCategoryId: category.id,
    };

    models.push(template);
  }

  // Finally create daily list projections
  for (const projectionBackup of backup.dailyListProjections) {
    const task = backup.tasks.find((t) => t.id === projectionBackup.taskId);
    const dailyListId = backup.dailyLists.find(
      (dl) => dl.id === projectionBackup.listId,
    )?.id;

    if (!task) {
      console.warn(`Task ${projectionBackup.taskId} not found for projection`);
      continue;
    }

    if (!dailyListId) {
      console.warn(
        `DailyList ${projectionBackup.listId} not found for projection`,
      );
      continue;
    }

    const projection: TaskProjection = {
      createdAt: projectionBackup.createdAt,
      type: projectionType,
      id: projectionBackup.id,
      taskId: projectionBackup.taskId,
      orderToken: projectionBackup.orderToken,
      dailyListId: dailyListId,
    };

    models.push(projection);
  }

  return models;
};

export const backupSlice = {
  loadBackup: selector(function* (backup: Backup): GenReturn<void> {
    for (const table of registeredSyncableTables) {
      const allIds = (yield* runQuery(selectFrom(table, "byIds"))).map(
        (r) => r.id,
      );

      yield* deleteRows(table, allIds);
    }

    const models = getNewModels(backup);

    for (const model of models) {
      yield* insert(appTypeTablesMap[model.type], [model]);
    }
  }),
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

    const allCategories = yield* projectCategoriesSlice2.all();

    return {
      projectCategories: allCategories.map((group) => ({
        id: group.id,
        title: group.title,
        projectId: group.projectId,
        createdAt: group.createdAt,
        orderToken: group.orderToken,
      })),
      tasks: tasks.map((task) => ({
        id: task.id,
        title: task.title,
        state: task.state,
        // projectId: task.projectId,
        orderToken: task.orderToken,
        lastToggledAt: task.lastToggledAt,
        createdAt: task.createdAt,
        horizon: task.horizon,
        templateId: task.templateId,
        templateDate: task.templateDate,
        projectCategoryId: task.projectCategoryId,
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
        // projectId: template.projectId,
        orderToken: template.orderToken,
        horizon: template.horizon,
        repeatRule: template.repeatRule,
        createdAt: template.createdAt,
        lastGeneratedAt: template.lastGeneratedAt,
        projectCategoryId: template.projectCategoryId,
      })),
    };
  }),
};
