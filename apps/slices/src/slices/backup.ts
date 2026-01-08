import {
  deleteRows,
  insert,
  runQuery,
  selectFrom,
  selector,
} from "@will-be-done/hyperdb";
import type { GenReturn } from "./utils";
import { getDMY } from "./utils";
import { cardsTasksSlice, type Task, taskType } from "./cardsTasks";
import {
  cardsTaskTemplatesSlice,
  type TaskTemplate,
  taskTemplateType,
} from "./cardsTaskTemplates";
import { dailyListsSlice, dailyListType, type DailyList } from "./dailyLists";
import { projectsAllSlice } from "./projectsAll";
import { projectType, type Project } from "./projects";
import { AnyModel, appTypeTablesMap } from "./maps";
import { registeredSyncableTables } from "./syncMap";
import {
  projectCategoriesSlice,
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
  dailyListId: string | null;
  dailyListOrderToken: string | null;
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
  taskTemplates: TaskTemplateBackup[];
  projectCategories: CategoryBackup[];
  dailyListProjections?: DailyListProjectionBackup[];
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

  // Build projection map for migration from old backups
  const projectionMap = new Map<string, DailyListProjectionBackup[]>();
  if (backup.dailyListProjections) {
    for (const projection of backup.dailyListProjections) {
      const existing = projectionMap.get(projection.taskId) || [];
      existing.push(projection);
      projectionMap.set(projection.taskId, existing);
    }
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

    let dailyListId = taskBackup.dailyListId || null;
    let dailyListOrderToken = taskBackup.dailyListOrderToken || null;

    // Migrate from projections if present (backwards compatibility)
    if (backup.dailyListProjections && projectionMap.has(taskBackup.id)) {
      const projections = projectionMap.get(taskBackup.id)!;
      // Use the latest projection (highest createdAt)
      const latestProjection = projections.reduce((latest, current) =>
        current.createdAt > latest.createdAt ? current : latest
      );
      dailyListId = latestProjection.listId;
      dailyListOrderToken = latestProjection.orderToken;
    }

    const task: Task = {
      type: taskType,
      id: taskBackup.id,
      title: taskBackup.title,
      state: taskBackup.state,
      projectCategoryId: taskBackup.projectCategoryId,
      orderToken: taskBackup.orderToken,
      lastToggledAt: taskBackup.lastToggledAt,
      createdAt: taskBackup.createdAt,
      horizon: taskBackup.horizon || "someday",
      templateId: taskBackup.templateId || null,
      templateDate: taskBackup.templateDate || null,
      dailyListId,
      dailyListOrderToken,
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
    const tasks: Task[] = yield* cardsTasksSlice.all();
    const projects: Project[] = yield* projectsAllSlice.all();
    const taskTemplates: TaskTemplate[] = yield* cardsTaskTemplatesSlice.all();
    const dailyLists: DailyList[] = [];

    // Get all daily lists
    const allDailyListIds = yield* dailyListsSlice.allIds();
    for (const id of allDailyListIds) {
      const dailyList = yield* dailyListsSlice.byId(id);
      if (dailyList) {
        dailyLists.push(dailyList);
      }
    }

    const allCategories = yield* projectCategoriesSlice.all();

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
        dailyListId: task.dailyListId,
        dailyListOrderToken: task.dailyListOrderToken,
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
