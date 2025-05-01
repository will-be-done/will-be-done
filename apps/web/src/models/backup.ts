import { getDMY } from "./models2";
import { StoreApi } from "@will-be-done/hyperstate";
import {
  projectType,
  taskType,
  dailyListType,
  projectionType,
  type Project,
  type Task,
  type DailyList,
  type TaskProjection,
  type RootState,
  appSlice,
  type AppModelChange,
} from "./models2";
import uuidByString from "uuid-by-string";

interface TaskBackup {
  id: string;
  title: string;
  state: "todo" | "done";
  projectId: string;
  orderToken: string;
}

interface ProjectBackup {
  id: string;
  title: string;
  icon: string;
  isInbox: boolean;
  orderToken: string;
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
}

export interface Backup {
  tasks: TaskBackup[];
  projects: ProjectBackup[];
  dailyLists: DailyListBackup[];
  dailyListProjections: DailyListProjectionBackup[];
}

export const getBackups = (state: RootState): Backup => {
  const tasks: TaskBackup[] = [];
  const projects: ProjectBackup[] = [];
  const dailyLists: DailyListBackup[] = [];
  const dailyListProjections: DailyListProjectionBackup[] = [];

  // Extract tasks
  for (const task of Object.values(state.task.byIds)) {
    tasks.push({
      id: task.id,
      title: task.title,
      state: task.state,
      projectId: task.projectId,
      orderToken: task.orderToken,
    });
  }

  // Extract projects
  for (const project of Object.values(state.project.byIds)) {
    projects.push({
      id: project.id,
      title: project.title,
      icon: project.icon,
      isInbox: project.isInbox,
      orderToken: project.orderToken,
    });
  }

  // Extract daily lists
  for (const dailyList of Object.values(state.dailyList.byIds)) {
    dailyLists.push({
      id: dailyList.id,
      date: dailyList.date,
    });
  }

  // Extract daily list projections
  for (const projection of Object.values(state.projection.byIds)) {
    dailyListProjections.push({
      id: projection.id,
      taskId: projection.taskId,
      orderToken: projection.orderToken,
      listId: projection.dailyListId,
    });
  }

  return {
    tasks,
    projects,
    dailyLists,
    dailyListProjections,
  };
};

export const loadBackups = (store: StoreApi<RootState>, backup: Backup) => {
  const changes: AppModelChange[] = [];

  // First, create all projects
  for (const projectBackup of backup.projects) {
    const project: Project = {
      type: projectType,
      id: projectBackup.id,
      title: projectBackup.title,
      icon: projectBackup.icon,
      isInbox: projectBackup.isInbox,
      orderToken: projectBackup.orderToken,
    };

    changes.push({
      id: project.id,
      modelType: projectType,
      isDeleted: false,
      model: project,
    });
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
      orderToken: taskBackup.orderToken,
    };

    changes.push({
      id: task.id,
      modelType: taskType,
      isDeleted: false,
      model: task,
    });
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

    changes.push({
      id: dailyList.id,
      modelType: dailyListType,
      isDeleted: false,
      model: dailyList,
    });
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
      type: projectionType,
      id: projectionBackup.id,
      taskId: projectionBackup.taskId,
      orderToken: projectionBackup.orderToken,
      dailyListId: dailyListId,
    };

    changes.push({
      id: projection.id,
      modelType: projectionType,
      isDeleted: false,
      model: projection,
    });
  }

  console.log(appSlice.resetAndApplyChanges);
  appSlice.resetAndApplyChanges(store, changes);
};
