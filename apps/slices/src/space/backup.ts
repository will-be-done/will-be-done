import {
  action,
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
import { projectsSlice, projectType, type Project } from "./projects";
import { AnyModel, appTypeTablesMap } from "./maps";
import { registeredSpaceSyncableTables } from "./syncMap";
import {
  projectCategoriesSlice,
  ProjectCategory,
  projectCategoryType,
} from "./projectsCategories";
import {
  dailyListsProjectionsSlice,
  projectionType,
  TaskProjection,
} from "./dailyListsProjections";

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
  projectCategoryId: string;
  orderToken: string;
  lastToggledAt: number;
  createdAt: number;
  horizon?: "week" | "month" | "year" | "someday";
  templateId: string | null;
  templateDate: number | null;
  // Legacy fields for backwards compatibility (when loading old backups)
  dailyListId?: string | null;
  dailyListOrderToken?: string | null;
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
  taskId?: string; // Legacy field - in new format id === taskId
  orderToken: string;
  listId: string; // dailyListId
  createdAt: number;
}

interface TaskTemplateBackup {
  id: string;
  title: string;
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

const getNewModels = action(function* (backup: Backup): GenReturn<AnyModel[]> {
  const models: AnyModel[] = [];

  const inboxProjectIdInBackup = backup.projects.find((p) => p.isInbox)?.id;
  const inboxProjectId = yield* projectsSlice.inboxProjectId();

  // First, create all projects
  for (const projectBackup of backup.projects) {
    const project: Project = {
      type: projectType,
      id: projectBackup.isInbox
        ? yield* projectsSlice.inboxProjectId()
        : projectBackup.id,
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
      projectId:
        categoryBackup.projectId === inboxProjectIdInBackup
          ? inboxProjectId
          : categoryBackup.projectId,
      createdAt: categoryBackup.createdAt,
      orderToken: categoryBackup.orderToken,
    };

    models.push(category);
  }

  // Build projection map for migration from old backups (where projections have taskId)
  const legacyProjectionMap = new Map<string, DailyListProjectionBackup[]>();
  if (backup.dailyListProjections) {
    for (const projection of backup.dailyListProjections) {
      // If taskId exists, it's a legacy format
      if (projection.taskId) {
        const existing = legacyProjectionMap.get(projection.taskId) || [];
        existing.push(projection);
        legacyProjectionMap.set(projection.taskId, existing);
      }
    }
  }

  // Then create all tasks
  for (const taskBackup of backup.tasks) {
    const category = backup.projectCategories.find(
      (p) => p.id === taskBackup.projectCategoryId,
    );
    if (!category) {
      console.warn(
        `Project ${taskBackup.projectCategoryId} not found for task ${taskBackup.id}`,
      );
      continue;
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
    };

    models.push(task);
  }

  const dailyListIdMap = new Map<string, string>();

  // Create daily lists
  for (const dailyListBackup of backup.dailyLists) {
    if (dailyListBackup.date.length !== 10) {
      dailyListBackup.date = getDMY(new Date(dailyListBackup.date));
    }

    const dailyList: DailyList = {
      type: dailyListType,
      id: yield* dailyListsSlice.getId(dailyListBackup.date),
      date: dailyListBackup.date,
    };

    dailyListIdMap.set(dailyListBackup.id, dailyList.id);

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

  // Create projections - handle both new format (id = taskId) and legacy format (separate taskId field)
  if (backup.dailyListProjections) {
    for (const projectionBackup of backup.dailyListProjections) {
      // In new format, id = taskId, so taskId field is optional
      const taskId = projectionBackup.taskId || projectionBackup.id;

      // Verify the task exists
      const taskExists = backup.tasks.some((t) => t.id === taskId);
      if (!taskExists) {
        console.warn(`Task ${taskId} not found for projection`);
        continue;
      }

      const projection: TaskProjection = {
        type: projectionType,
        id: taskId, // projection.id = task.id
        orderToken: projectionBackup.orderToken,
        dailyListId: dailyListIdMap.get(projectionBackup.listId)!,
        createdAt: projectionBackup.createdAt,
      };

      models.push(projection);
    }
  }

  // Handle legacy backup format where dailyListId was on tasks directly
  for (const taskBackup of backup.tasks) {
    // Skip if we already have a projection for this task (from dailyListProjections array)
    const hasProjection = backup.dailyListProjections?.some(
      (p) => (p.taskId || p.id) === taskBackup.id,
    );
    if (hasProjection) continue;

    // Check if task has legacy dailyListId field
    if (taskBackup.dailyListId && taskBackup.dailyListOrderToken) {
      const projection: TaskProjection = {
        type: projectionType,
        id: taskBackup.id,
        orderToken: taskBackup.dailyListOrderToken,
        dailyListId: taskBackup.dailyListId,
        createdAt: taskBackup.createdAt,
      };

      models.push(projection);
    }
  }

  return models;
});

export const backupSlice = {
  loadBackup: selector(function* (backup: Backup): GenReturn<void> {
    for (const table of registeredSpaceSyncableTables) {
      const allIds = (yield* runQuery(selectFrom(table, "byIds"))).map(
        (r) => r.id,
      );

      yield* deleteRows(table, allIds);
    }

    const models = yield* getNewModels(backup);

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

    // Get all projections
    const projections: TaskProjection[] = [];
    const allProjectionIds = yield* dailyListsProjectionsSlice.allIds();
    for (const id of allProjectionIds) {
      const projection = yield* dailyListsProjectionsSlice.byId(id);
      if (projection) {
        projections.push(projection);
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
      dailyListProjections: projections.map((projection) => ({
        id: projection.id, // id = taskId in new format
        orderToken: projection.orderToken,
        listId: projection.dailyListId,
        createdAt: projection.createdAt,
      })),
      taskTemplates: taskTemplates.map((template) => ({
        id: template.id,
        title: template.title,
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
