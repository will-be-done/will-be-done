import Loki from "lokijs";
import { useSyncExternalStore } from "react";
import {
  createWorkloadRows,
  type ClearWorkloadResult,
  type DashboardSnapshot,
  type Project,
  type Task,
  type WorkloadResult,
} from "./workload";

const lokiDb = new Loki("hyperdb-demo-loki.db", {
  persistenceMethod: "memory",
});

const lokiProjectsCollection = lokiDb.addCollection<Project>("projects", {
  indices: ["createdAt", "id"],
});
const lokiTasksCollection = lokiDb.addCollection<Task>("tasks", {
  indices: ["createdAt", "id", "projectId", "position", "status"],
});

type TaskStats = {
  projects: number;
  total: number;
  todo: number;
  doing: number;
  done: number;
};

const EMPTY_TASK_STATS: TaskStats = {
  projects: 0,
  total: 0,
  todo: 0,
  doing: 0,
  done: 0,
};

let taskStats = { ...EMPTY_TASK_STATS };
const projectTaskCountsById = new Map<string, number>();
let revision = 0;
const subscribers = new Set<() => void>();

function emitChange() {
  revision += 1;
  for (const subscriber of subscribers) {
    subscriber();
  }
}

function subscribe(listener: () => void) {
  subscribers.add(listener);

  return () => {
    subscribers.delete(listener);
  };
}

function getRevision() {
  return revision;
}

function getProjectsByCreatedAt(limit: number): Project[] {
  return lokiProjectsCollection
    .chain()
    .find({ createdAt: { $gte: 0 } })
    .simplesort("createdAt")
    .limit(limit)
    .data();
}

function getProjectById(id: string): Project | null {
  return lokiProjectsCollection.findOne({ id: { $eq: id } });
}

function getTasksByProjectPosition(projectId: string, limit: number): Task[] {
  return lokiTasksCollection
    .chain()
    .find({ projectId: { $eq: projectId } })
    .simplesort("position")
    .limit(limit)
    .data();
}

function applyTaskStatusDelta(status: Task["status"], delta: 1 | -1) {
  taskStats = {
    ...taskStats,
    total: taskStats.total + delta,
    [status]: taskStats[status] + delta,
  };
}

export function generateLokiWorkload(
  projectCount: number,
  tasksPerProject: number,
): WorkloadResult {
  const { projects, tasks, result } = createWorkloadRows(
    projectCount,
    tasksPerProject,
  );

  lokiProjectsCollection.insert(projects);
  lokiTasksCollection.insert(tasks);
  taskStats = {
    ...taskStats,
    projects: taskStats.projects + projects.length,
  };

  for (const task of tasks) {
    applyTaskStatusDelta(task.status, 1);
    projectTaskCountsById.set(
      task.projectId,
      (projectTaskCountsById.get(task.projectId) ?? 0) + 1,
    );
  }

  emitChange();

  return result;
}

export function clearLokiWorkload(): ClearWorkloadResult {
  const projectsDeleted = lokiProjectsCollection.count();
  const tasksDeleted = lokiTasksCollection.count();

  lokiTasksCollection.clear({ removeIndices: false });
  lokiProjectsCollection.clear({ removeIndices: false });
  taskStats = { ...EMPTY_TASK_STATS };
  projectTaskCountsById.clear();
  emitChange();

  return {
    projectsDeleted,
    tasksDeleted,
  };
}

export function toggleLokiTaskDone(task: Task) {
  const existingTask = lokiTasksCollection.findOne({ id: { $eq: task.id } });

  if (!existingTask) return;

  applyTaskStatusDelta(existingTask.status, -1);
  existingTask.status = existingTask.status === "done" ? "todo" : "done";
  applyTaskStatusDelta(existingTask.status, 1);
  lokiTasksCollection.update(existingTask);
  emitChange();
}

function getLokiDashboardSnapshot(
  taskLimit = 10,
  projectLimit = 10,
  selectedProjectId: string | null = null,
): DashboardSnapshot {
  const projects = getProjectsByCreatedAt(projectLimit);
  const selectedProject = selectedProjectId
    ? getProjectById(selectedProjectId)
    : (projects[0] ?? null);
  const selectedTasks = selectedProject
    ? getTasksByProjectPosition(selectedProject.id, taskLimit)
    : [];
  const visibleProjectTaskCountsById = Object.fromEntries(
    projects.map((project) => [
      project.id,
      projectTaskCountsById.get(project.id) ?? 0,
    ]),
  );

  return {
    projects,
    selectedProject,
    selectedTasks,
    selectedTaskCount: selectedProject
      ? (projectTaskCountsById.get(selectedProject.id) ?? 0)
      : 0,
    projectTaskCountsById: visibleProjectTaskCountsById,
    projectNamesById: Object.fromEntries(
      projects.map((project) => [project.id, project.name]),
    ),
    totalProjects: taskStats.projects,
    totalTasks: taskStats.total,
    todoTasks: taskStats.todo,
    doingTasks: taskStats.doing,
    doneTasks: taskStats.done,
  };
}

export function useLokiDashboardSnapshot(
  taskLimit = 10,
  projectLimit = 10,
  selectedProjectId: string | null = null,
): DashboardSnapshot {
  useSyncExternalStore(subscribe, getRevision, getRevision);

  return getLokiDashboardSnapshot(taskLimit, projectLimit, selectedProjectId);
}
