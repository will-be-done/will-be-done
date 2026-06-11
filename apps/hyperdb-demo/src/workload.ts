export const projectColors = [
  "#0f8b8d",
  "#e4572e",
  "#2e6f95",
  "#b23a48",
  "#6a994e",
];

const taskTitles = [
  "Index project window",
  "Render task lane",
  "Verify selector cache",
  "Replay write batch",
  "Profile commit path",
  "Measure subscription fanout",
  "Compact task payload",
  "Trace range scan",
];

export type TaskStatus = "todo" | "doing" | "done";

export type Project = {
  id: string;
  name: string;
  color: string;
  createdAt: number;
};

export type Task = {
  id: string;
  projectId: string;
  title: string;
  status: TaskStatus;
  priority: number;
  position: number;
  createdAt: number;
  estimate: number;
};

export type DashboardSnapshot = {
  projects: Project[];
  selectedProject: Project | null;
  selectedTasks: Task[];
  selectedTaskCount: number;
  projectTaskCountsById: Record<string, number>;
  projectNamesById: Record<string, string>;
  totalProjects: number;
  totalTasks: number;
  todoTasks: number;
  doingTasks: number;
  doneTasks: number;
};

export type WorkloadResult = {
  batchId: string;
  projectsCreated: number;
  tasksCreated: number;
};

export type ClearWorkloadResult = {
  projectsDeleted: number;
  tasksDeleted: number;
};

export function createWorkloadRows(
  projectCount: number,
  tasksPerProject: number,
) {
  const batchId = `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const createdAtBase = Date.now();
  const projects: Project[] = [];
  const tasks: Task[] = [];

  for (let projectIndex = 0; projectIndex < projectCount; projectIndex++) {
    const projectId = `project:${batchId}:${projectIndex}`;

    projects.push({
      id: projectId,
      name: `Project ${projectIndex + 1} / ${batchId}`,
      color: projectColors[projectIndex % projectColors.length],
      createdAt: createdAtBase + projectIndex,
    });

    for (let taskIndex = 0; taskIndex < tasksPerProject; taskIndex++) {
      const globalTaskIndex = projectIndex * tasksPerProject + taskIndex;
      const status: TaskStatus =
        globalTaskIndex % 11 === 0
          ? "done"
          : globalTaskIndex % 5 === 0
            ? "doing"
            : "todo";

      tasks.push({
        id: `task:${batchId}:${projectIndex}:${taskIndex}`,
        projectId,
        title: `${taskTitles[globalTaskIndex % taskTitles.length]} #${
          globalTaskIndex + 1
        }`,
        status,
        priority: (globalTaskIndex % 4) + 1,
        position: taskIndex,
        createdAt: createdAtBase + globalTaskIndex,
        estimate: (globalTaskIndex % 8) + 1,
      });
    }
  }

  return {
    batchId,
    projects,
    tasks,
    result: {
      batchId,
      projectsCreated: projects.length,
      tasksCreated: tasks.length,
    } satisfies WorkloadResult,
  };
}
