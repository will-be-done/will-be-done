import { QueryClient } from "@tanstack/query-core";
import {
  BTreeIndex,
  createCollection,
  eq,
  useLiveQuery,
} from "@tanstack/react-db";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import { useMemo } from "react";
import {
  createWorkloadRows,
  type ClearWorkloadResult,
  type DashboardSnapshot,
  type Project,
  type Task,
  type WorkloadResult,
} from "./workload";

const queryClient = new QueryClient();

export const tanstackProjectsCollection = createCollection(
  queryCollectionOptions<Project>({
    id: "tanstack-projects",
    queryClient,
    queryKey: ["tanstack-projects"],
    queryFn: (): Project[] => [],
    getKey: (project) => project.id,
  }),
);

export const tanstackTasksCollection = createCollection(
  queryCollectionOptions<Task>({
    id: "tanstack-tasks",
    queryClient,
    queryKey: ["tanstack-tasks"],
    queryFn: (): Task[] => [],
    getKey: (task) => task.id,
  }),
);

tanstackProjectsCollection.createIndex((project) => project.createdAt, {
  name: "projects-by-created-at",
  indexType: BTreeIndex,
});
tanstackProjectsCollection.createIndex((project) => project.id, {
  name: "projects-by-id",
  indexType: BTreeIndex,
});
tanstackTasksCollection.createIndex((task) => task.projectId, {
  name: "tasks-by-project-id",
  indexType: BTreeIndex,
});
tanstackTasksCollection.createIndex((task) => task.position, {
  name: "tasks-by-position",
  indexType: BTreeIndex,
});

await Promise.all([
  tanstackProjectsCollection.preload(),
  tanstackTasksCollection.preload(),
]);

export function generateTanstackWorkload(
  projectCount: number,
  tasksPerProject: number,
): WorkloadResult {
  const { projects, tasks, result } = createWorkloadRows(
    projectCount,
    tasksPerProject,
  );

  tanstackProjectsCollection.utils.writeInsert(projects);
  tanstackTasksCollection.utils.writeInsert(tasks);

  return result;
}

export function clearTanstackWorkload(): ClearWorkloadResult {
  const projectsDeleted = tanstackProjectsCollection.size;
  const tasksDeleted = tanstackTasksCollection.size;

  tanstackTasksCollection.utils.writeDelete([...tanstackTasksCollection.keys()]);
  tanstackProjectsCollection.utils.writeDelete([
    ...tanstackProjectsCollection.keys(),
  ]);

  return {
    projectsDeleted,
    tasksDeleted,
  };
}

export function toggleTanstackTaskDone(task: Task) {
  const status: Task["status"] = task.status === "done" ? "todo" : "done";

  tanstackTasksCollection.utils.writeUpdate({
    id: task.id,
    status,
  });
}

export function useTanstackDashboardSnapshot(
  taskLimit = 10,
  projectLimit = 10,
  selectedProjectId: string | null = null,
): DashboardSnapshot {
  const { data: projects = [] } = useLiveQuery(
    (q) =>
      q
        .from({ project: tanstackProjectsCollection })
        .orderBy(({ project }) => project.createdAt, "asc")
        .limit(projectLimit),
    [projectLimit],
  );
  const { data: selectedProjects = [] } = useLiveQuery(
    (q) =>
      selectedProjectId
        ? q
            .from({ project: tanstackProjectsCollection })
            .where(({ project }) => eq(project.id, selectedProjectId))
            .orderBy(({ project }) => project.id, "asc")
            .limit(1)
        : undefined,
    [selectedProjectId],
  );

  const selectedProject = selectedProjectId
    ? selectedProjects[0] ?? null
    : projects[0] ?? null;

  const { data: selectedTasks = [] } = useLiveQuery(
    (q) =>
      selectedProject
        ? q
            .from({ task: tanstackTasksCollection })
            .where(({ task }) => eq(task.projectId, selectedProject.id))
            .orderBy(({ task }) => task.position, "asc")
            .limit(taskLimit)
        : undefined,
    [selectedProject?.id, taskLimit],
  );

  return useMemo(() => {
    return {
      projects,
      selectedProject,
      selectedTasks,
      selectedTaskCount: 0,
      projectTaskCountsById: {},
      projectNamesById: Object.fromEntries(
        projects.map((project) => [project.id, project.name]),
      ),
      totalProjects: 0,
      totalTasks: 0,
      todoTasks: 0,
      doingTasks: 0,
      doneTasks: 0,
    } satisfies DashboardSnapshot;
  }, [projects, selectedProject, selectedTasks]);
}
