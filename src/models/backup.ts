import { standaloneAction } from "mobx-keystone";
import { RootStore } from "./models";
import { Project, Task, DailyList, TaskProjection } from "./models";
import {
  projectRef,
  taskRef,
  dailyListRef,
  allProjectsListRef,
} from "./models";

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

export const getBackups = (store: RootStore): Backup => {
  const tasks: TaskBackup[] = [];
  const projects: ProjectBackup[] = [];
  const dailyLists: DailyListBackup[] = [];
  const dailyListProjections: DailyListProjectionBackup[] = [];

  // Extract tasks
  for (const task of store.taskRegistry.entities.values()) {
    tasks.push({
      id: task.id,
      title: task.title,
      state: task.state,
      projectId: task.projectRef.id,
      orderToken: task.orderToken,
    });
  }

  // Extract projects
  for (const project of store.projectsRegistry.entities.values()) {
    projects.push({
      id: project.id,
      title: project.title,
      icon: project.icon,
      isInbox: project.isInbox,
      orderToken: project.orderToken,
    });
  }

  // Extract daily lists
  for (const dailyList of store.dailyListRegisry.entities.values()) {
    dailyLists.push({
      id: dailyList.id,
      date: dailyList.date.toISOString(),
    });
  }

  // Extract daily list projections
  for (const projection of store.taskProjectionRegistry.entities.values()) {
    dailyListProjections.push({
      id: projection.id,
      taskId: projection.taskRef.id,
      orderToken: projection.orderToken,
      listId: projection.dailyListRef.id,
    });
  }

  return {
    tasks,
    projects,
    dailyLists,
    dailyListProjections,
  };
};

export const loadBackups = standaloneAction(
  "myApp/arraySwap",
  (store: RootStore, backup: Backup) => {
    store.taskRegistry.entities.clear();
    store.projectsRegistry.entities.clear();
    store.dailyListRegisry.entities.clear();
    store.taskProjectionRegistry.entities.clear();

    // First, create all projects
    const projectMap = new Map<string, Project>();
    for (const projectBackup of backup.projects) {
      const project = new Project({
        id: projectBackup.id,
        title: projectBackup.title,
        icon: projectBackup.icon,
        isInbox: projectBackup.isInbox,
        orderToken: projectBackup.orderToken,
        listRef: allProjectsListRef(store.allProjectsList),
      });
      store.projectsRegistry.add(project);
      projectMap.set(projectBackup.id, project);
    }

    // Then create all tasks
    const taskMap = new Map<string, Task>();
    for (const taskBackup of backup.tasks) {
      const project = projectMap.get(taskBackup.projectId);
      if (!project) {
        console.warn(
          `Project ${taskBackup.projectId} not found for task ${taskBackup.id}`,
        );
        continue;
      }

      const task = new Task({
        id: taskBackup.id,
        title: taskBackup.title,
        state: taskBackup.state,
        projectRef: projectRef(project),
        orderToken: taskBackup.orderToken,
      });
      store.taskRegistry.add(task);
      taskMap.set(taskBackup.id, task);
    }

    // Create daily lists
    const dailyListMap = new Map<string, DailyList>();
    for (const dailyListBackup of backup.dailyLists) {
      const dailyList = new DailyList({
        id: dailyListBackup.id,
        date: new Date(dailyListBackup.date),
      });
      store.dailyListRegisry.entities.set(dailyList.id, dailyList);
      dailyListMap.set(dailyListBackup.id, dailyList);
    }

    // Finally create daily list projections
    for (const projectionBackup of backup.dailyListProjections) {
      const task = taskMap.get(projectionBackup.taskId);
      const dailyList = dailyListMap.get(projectionBackup.listId);
      if (!task || !dailyList) {
        console.warn(
          `Task ${projectionBackup.taskId} or DailyList ${projectionBackup.id} not found for projection`,
        );
        continue;
      }

      const projection = new TaskProjection({
        id: projectionBackup.id,
        taskRef: taskRef(task),
        orderToken: projectionBackup.orderToken,
        dailyListRef: dailyListRef(dailyList),
      });
      store.taskProjectionRegistry.add(projection);
    }
  },
);
