import {
  action,
  defineTable,
  deleteRows,
  insert,
  runQuery,
  selectFrom,
  selector,
  type SubscribableDB,
  upsert,
  v,
  type ExtractSchema,
} from "@will-be-done/hyperdb-lib";

const projectColors = ["#0f8b8d", "#e4572e", "#2e6f95", "#b23a48", "#6a994e"];

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

export const projectsTable = defineTable("projects", {
  id: v.string(),
  name: v.string(),
  color: v.string(),
  createdAt: v.number(),
})
  .index("byCreatedAt", ["createdAt"])
  .index("byName", ["name"]);

export const tasksTable = defineTable("tasks", {
  id: v.string(),
  projectId: v.string(),
  title: v.string(),
  status: v.union(v.literal("todo"), v.literal("doing"), v.literal("done")),
  priority: v.number(),
  position: v.number(),
  createdAt: v.number(),
  estimate: v.number(),
})
  .index("byCreatedAt", ["createdAt"])
  .index("byProjectPosition", ["projectId", "position"])
  .index("byStatus", ["status"]);

export const taskStatsTable = defineTable("taskStats", {
  id: v.string(),
  projects: v.number(),
  total: v.number(),
  todo: v.number(),
  doing: v.number(),
  done: v.number(),
});

export const projectTaskStatsTable = defineTable("projectTaskStats", {
  id: v.string(),
  total: v.number(),
});

export const hyperdbDemoTables = [
  projectsTable,
  tasksTable,
  taskStatsTable,
  projectTaskStatsTable,
];

export type Project = ExtractSchema<typeof projectsTable>;
export type Task = ExtractSchema<typeof tasksTable>;
export type TaskStats = ExtractSchema<typeof taskStatsTable>;
export type ProjectTaskStats = ExtractSchema<typeof projectTaskStatsTable>;

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

const TASK_STATS_ID = "tasks";
const EMPTY_TASK_STATS: TaskStats = {
  id: TASK_STATS_ID,
  projects: 0,
  total: 0,
  todo: 0,
  doing: 0,
  done: 0,
};

export type WorkloadResult = {
  batchId: string;
  projectsCreated: number;
  tasksCreated: number;
};

export const getDashboardSnapshot = selector(function* (
  taskLimit = 10,
  projectLimit = 10,
  selectedProjectId: string | null = null,
) {
  const projects = yield* runQuery(
    selectFrom(projectsTable, "byCreatedAt")
      .where((q) => q)
      .order("asc")
      .limit(projectLimit),
  );
  const selectedProject = selectedProjectId
    ? (yield* runQuery(
        selectFrom(projectsTable, "id").where((q) =>
          q.eq("id", selectedProjectId),
        ),
      ))[0] ?? null
    : projects[0] ?? null;
  const visibleProjectTaskStats =
    projects.length > 0
      ? yield* runQuery(
          selectFrom(projectTaskStatsTable, "id").where((q) =>
            projects.map((project) => q.eq("id", project.id)),
          ),
        )
      : [];
  const selectedProjectTaskStats = selectedProject
    ? (yield* runQuery(
        selectFrom(projectTaskStatsTable, "id").where((q) =>
          q.eq("id", selectedProject.id),
        ),
      ))[0] ?? null
    : null;
  const selectedTasks = selectedProject
    ? yield* runQuery(
        selectFrom(tasksTable, "byProjectPosition")
          .where((q) => q.eq("projectId", selectedProject.id))
          .order("asc")
          .limit(taskLimit),
      )
    : [];
  const stats =
    (
      yield* runQuery(
        selectFrom(taskStatsTable, "id").where((q) => q.eq("id", TASK_STATS_ID)),
      )
    )[0] ?? EMPTY_TASK_STATS;

  return {
    projects,
    selectedProject,
    selectedTasks,
    selectedTaskCount: selectedProjectTaskStats?.total ?? 0,
    projectTaskCountsById: Object.fromEntries(
      visibleProjectTaskStats.map((stats) => [stats.id, stats.total]),
    ),
    projectNamesById: Object.fromEntries(
      projects.map((project) => [project.id, project.name]),
    ),
    totalProjects: stats.projects,
    totalTasks: stats.total,
    todoTasks: stats.todo,
    doingTasks: stats.doing,
    doneTasks: stats.done,
  } satisfies DashboardSnapshot;
});

function applyTaskStatusDelta(
  stats: TaskStats,
  status: Task["status"],
  delta: 1 | -1,
): TaskStats {
  return {
    ...stats,
    total: stats.total + delta,
    [status]: stats[status] + delta,
  };
}

function normalizeTaskStats(stats: TaskStats): TaskStats {
  return {
    ...stats,
    projects: Math.max(0, stats.projects),
    total: Math.max(0, stats.total),
    todo: Math.max(0, stats.todo),
    doing: Math.max(0, stats.doing),
    done: Math.max(0, stats.done),
  };
}

function applyProjectTotalDelta(
  stats: TaskStats,
  delta: 1 | -1,
): TaskStats {
  return {
    ...stats,
    projects: stats.projects + delta,
  };
}

function applyProjectTaskCountDelta(
  stats: ProjectTaskStats,
  delta: number,
): ProjectTaskStats {
  return {
    ...stats,
    total: stats.total + delta,
  };
}

export function installTaskStatsHooks(db: SubscribableDB) {
  db.afterChange(function* (_db, table, _traits, ops) {
    if (ops.length === 0) return;

    const existingStats =
      (
        yield* runQuery(
          selectFrom(taskStatsTable, "id").where((q) =>
            q.eq("id", TASK_STATS_ID),
          ),
        )
      )[0] ?? EMPTY_TASK_STATS;

    let nextStats = existingStats;

    if (table === projectsTable) {
      for (const op of ops) {
        if (op.type === "insert" || (op.type === "upsert" && !op.oldValue)) {
          nextStats = applyProjectTotalDelta(nextStats, 1);
        } else if (op.type !== "upsert") {
          nextStats = applyProjectTotalDelta(nextStats, -1);
        }
      }

      yield* upsert(taskStatsTable, [normalizeTaskStats(nextStats)]);
      return;
    }

    if (table !== tasksTable) return;

    const projectTaskDeltas = new Map<string, number>();
    const recordProjectTaskDelta = (projectId: string, delta: 1 | -1) => {
      projectTaskDeltas.set(
        projectId,
        (projectTaskDeltas.get(projectId) ?? 0) + delta,
      );
    };

    for (const op of ops) {
      if (op.type === "insert") {
        const task = op.newValue as Task;
        nextStats = applyTaskStatusDelta(nextStats, task.status, 1);
        recordProjectTaskDelta(task.projectId, 1);
      } else if (op.type === "upsert") {
        if (op.oldValue) {
          const oldTask = op.oldValue as Task;
          nextStats = applyTaskStatusDelta(
            nextStats,
            oldTask.status,
            -1,
          );
          recordProjectTaskDelta(oldTask.projectId, -1);
        }
        const newTask = op.newValue as Task;
        nextStats = applyTaskStatusDelta(nextStats, newTask.status, 1);
        recordProjectTaskDelta(newTask.projectId, 1);
      } else {
        const task = op.oldValue as Task;
        nextStats = applyTaskStatusDelta(
          nextStats,
          task.status,
          -1,
        );
        recordProjectTaskDelta(task.projectId, -1);
      }
    }

    yield* upsert(taskStatsTable, [normalizeTaskStats(nextStats)]);

    const changedProjectIds = [...projectTaskDeltas.keys()];
    if (changedProjectIds.length === 0) return;

    const existingProjectTaskStats = yield* runQuery(
      selectFrom(projectTaskStatsTable, "id").where((q) =>
        changedProjectIds.map((projectId) => q.eq("id", projectId)),
      ),
    );
    const projectTaskStatsById = new Map(
      existingProjectTaskStats.map((stats) => [stats.id, stats]),
    );
    const nextProjectTaskStats: ProjectTaskStats[] = [];
    const emptyProjectStatsIds: string[] = [];

    for (const [projectId, delta] of projectTaskDeltas) {
      if (delta === 0) continue;

      const existingProjectTaskStat = projectTaskStatsById.get(projectId) ?? {
        id: projectId,
        total: 0,
      };
      const nextProjectTaskStat = applyProjectTaskCountDelta(
        existingProjectTaskStat,
        delta,
      );

      if (nextProjectTaskStat.total <= 0) {
        emptyProjectStatsIds.push(projectId);
      } else {
        nextProjectTaskStats.push(nextProjectTaskStat);
      }
    }

    if (nextProjectTaskStats.length > 0) {
      yield* upsert(projectTaskStatsTable, nextProjectTaskStats);
    }
    if (emptyProjectStatsIds.length > 0) {
      yield* deleteRows(projectTaskStatsTable, emptyProjectStatsIds);
    }
  });
}

export const generateWorkload = action(function* (
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
      const status =
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

  yield* insert(projectsTable, projects);
  yield* insert(tasksTable, tasks);

  return {
    batchId,
    projectsCreated: projects.length,
    tasksCreated: tasks.length,
  } satisfies WorkloadResult;
});

export const clearWorkload = action(function* () {
  const projects = yield* runQuery(
    selectFrom(projectsTable, "byCreatedAt").where((q) => q),
  );
  const tasks = yield* runQuery(
    selectFrom(tasksTable, "byCreatedAt").where((q) => q),
  );

  yield* deleteRows(
    tasksTable,
    tasks.map((task) => task.id),
  );
  yield* deleteRows(
    projectsTable,
    projects.map((project) => project.id),
  );

  return {
    projectsDeleted: projects.length,
    tasksDeleted: tasks.length,
  };
});

export const toggleTaskDone = action(function* (task: Task) {
  const status: Task["status"] = task.status === "done" ? "todo" : "done";

  yield* upsert(tasksTable, [{ ...task, status }]);

  return status;
});
