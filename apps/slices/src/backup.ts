import {
  AnyModel,
  DailyList,
  dailyListType,
  getDMY,
  Project,
  projectionType,
  projectType,
  Task,
  TaskGroup,
  taskGroupType,
  TaskProjection,
  TaskTemplate,
  taskTemplateType,
  taskType,
} from "./slices";
import uuidByString from "uuid-by-string";

interface TaskGroupBackup {
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
  projectId: string;
  taskGroupId: string;
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
  projectId: string;
  orderToken: string;
  horizon: "week" | "month" | "year" | "someday";
  repeatRule: string;
  createdAt: number;
  lastGeneratedAt: number;
  taskGroupId: string;
}

export interface Backup {
  tasks: TaskBackup[];
  projects: ProjectBackup[];
  dailyLists: DailyListBackup[];
  dailyListProjections: DailyListProjectionBackup[];
  taskTemplates: TaskTemplateBackup[];
  taskGroups: TaskGroupBackup[];
}

export const getNewModels = (backup: Backup): AnyModel[] => {
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

  for (const groupBackup of backup.taskGroups) {
    const taskGroup: TaskGroup = {
      type: taskGroupType,
      id: groupBackup.id,
      title: groupBackup.title,
      projectId: groupBackup.projectId,
      createdAt: groupBackup.createdAt,
      orderToken: groupBackup.orderToken,
    };

    models.push(taskGroup);
  }

  // Then create all tasks
  for (const taskBackup of backup.tasks) {
    const project = backup.projects.find((p) => p.id === taskBackup.projectId);
    if (!project) {
      console.warn(
        `Project ${taskBackup.projectId} not found for task ${taskBackup.id}`,
      );
      continue;
    }

    const task: Task = {
      type: taskType,
      id: taskBackup.id,
      title: taskBackup.title,
      state: taskBackup.state,
      projectId: taskBackup.projectId,
      taskGroupId: taskBackup.taskGroupId,
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
    const project = backup.projects.find(
      (p) => p.id === templateBackup.projectId,
    );
    if (!project) {
      console.warn(
        `Project ${templateBackup.projectId} not found for template ${templateBackup.id}`,
      );
      continue;
    }

    const template: TaskTemplate = {
      type: taskTemplateType,
      id: templateBackup.id,
      title: templateBackup.title,
      projectId: templateBackup.projectId,
      orderToken: templateBackup.orderToken,
      horizon: templateBackup.horizon,
      repeatRule: templateBackup.repeatRule,
      createdAt: templateBackup.createdAt,
      lastGeneratedAt: templateBackup.lastGeneratedAt,
      taskGroupId: templateBackup.taskGroupId,
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
