import type {
  ClearWorkloadResult,
  DashboardSnapshot,
  Task,
  WorkloadResult,
} from "./workload";
import { LIST_PAGE_SIZE, type BenchmarkState } from "./useBenchmarkState";

type BenchmarkAppProps = {
  backendName: string;
  benchmarkState: BenchmarkState;
  dashboard: DashboardSnapshot;
  generateWorkload: (
    projectCount: number,
    tasksPerProject: number,
  ) => WorkloadResult;
  clearWorkload: () => ClearWorkloadResult;
  toggleTaskDone: (task: Task) => void;
};

const numberFormatter = new Intl.NumberFormat("en-US");
const durationFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});

function formatNumber(value: number) {
  return numberFormatter.format(value);
}

function formatDuration(value: number) {
  return `${durationFormatter.format(value)} ms`;
}

function clampInteger(value: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;

  return Math.max(0, Math.floor(value));
}

export function BenchmarkApp({
  backendName,
  benchmarkState,
  dashboard,
  generateWorkload,
  clearWorkload,
  toggleTaskDone,
}: BenchmarkAppProps) {
  const {
    projectCount,
    setProjectCount,
    tasksPerProject,
    setTasksPerProject,
    taskLimit,
    setTaskLimit,
    projectLimit,
    setProjectLimit,
    setSelectedProjectId,
    lastRun,
    setLastRun,
    isWorking,
    setIsWorking,
  } = benchmarkState;

  const queuedTasks = projectCount * tasksPerProject;
  const visibleTaskCount = dashboard.selectedProject
    ? Math.min(taskLimit, dashboard.selectedTaskCount)
    : 0;
  const visibleProjectCount = Math.min(projectLimit, dashboard.totalProjects);

  const runMeasured = (
    label: string,
    workload: () => WorkloadResult | ClearWorkloadResult,
  ) => {
    setIsWorking(true);

    requestAnimationFrame(() => {
      const startedAt = performance.now();
      const result = workload();
      const durationMs = performance.now() - startedAt;

      setLastRun({ label, durationMs, result });
      setIsWorking(false);
    });
  };

  const runCustomWorkload = () => {
    runMeasured("custom batch", () =>
      generateWorkload(projectCount, tasksPerProject),
    );
  };

  const runTenThousandTasks = () => {
    runMeasured("10,000 task batch", () => generateWorkload(20, 500));
  };

  const clearAll = () => {
    setSelectedProjectId(null);
    setTaskLimit(LIST_PAGE_SIZE);
    setProjectLimit(LIST_PAGE_SIZE);
    runMeasured("clear", clearWorkload);
  };

  const selectProject = (projectId: string) => {
    setSelectedProjectId(projectId);
    setTaskLimit(LIST_PAGE_SIZE);
  };

  return (
    <main className="app-shell">
      <nav className="route-tabs" aria-label="Backend comparison">
        <a href="/" aria-current={backendName === "HyperDB" ? "page" : undefined}>
          HyperDB
        </a>
        <a
          href="/redux"
          aria-current={backendName === "Redux Toolkit" ? "page" : undefined}
        >
          Redux
        </a>
        <a
          href="/db"
          aria-current={backendName === "TanStack DB" ? "page" : undefined}
        >
          TanStack DB
        </a>
      </nav>

      <header className="topbar">
        <div>
          <p className="eyebrow">{backendName} Demo</p>
          <h1>Project/task stress bench</h1>
        </div>
        <div className="run-status" data-working={isWorking}>
          <span>{isWorking ? "Running" : "Idle"}</span>
          <strong>{lastRun ? formatDuration(lastRun.durationMs) : "--"}</strong>
        </div>
      </header>

      <section className="controls-band" aria-label="Workload controls">
        <label className="number-field">
          <span>Projects</span>
          <input
            min="1"
            step="1"
            type="number"
            value={projectCount}
            onChange={(event) =>
              setProjectCount(clampInteger(event.currentTarget.valueAsNumber, 1))
            }
          />
        </label>
        <label className="number-field">
          <span>Tasks / project</span>
          <input
            min="0"
            step="1"
            type="number"
            value={tasksPerProject}
            onChange={(event) =>
              setTasksPerProject(
                clampInteger(event.currentTarget.valueAsNumber, 0),
              )
            }
          />
        </label>
        <div className="queued-total">
          <span>Queued rows</span>
          <strong>{formatNumber(projectCount + queuedTasks)}</strong>
        </div>
        <div className="button-group">
          <button type="button" onClick={runCustomWorkload} disabled={isWorking}>
            Generate batch
          </button>
          <button
            type="button"
            className="secondary"
            onClick={runTenThousandTasks}
            disabled={isWorking}
          >
            Generate 10,000 tasks
          </button>
          <button
            type="button"
            className="danger"
            onClick={clearAll}
            disabled={
              isWorking || dashboard.totalTasks + dashboard.totalProjects === 0
            }
          >
            Clear
          </button>
        </div>
      </section>

      <section className="metrics-grid" aria-label="Database metrics">
        <article>
          <span>Projects</span>
          <strong>{formatNumber(dashboard.totalProjects)}</strong>
        </article>
        <article>
          <span>Tasks</span>
          <strong>{formatNumber(dashboard.totalTasks)}</strong>
        </article>
        <article>
          <span>Doing</span>
          <strong>{formatNumber(dashboard.doingTasks)}</strong>
        </article>
        <article>
          <span>Done</span>
          <strong>{formatNumber(dashboard.doneTasks)}</strong>
        </article>
      </section>

      {lastRun ? (
        <section className="last-run" aria-label="Last run">
          <span>{lastRun.label}</span>
          <strong>{formatDuration(lastRun.durationMs)}</strong>
          <code>{JSON.stringify(lastRun.result)}</code>
        </section>
      ) : null}

      <section className="content-grid">
        <div className="data-panel">
          <div className="panel-heading">
            <h2>
              {dashboard.selectedProject
                ? `${formatNumber(visibleTaskCount)} of ${formatNumber(
                    dashboard.selectedTaskCount,
                  )} tasks`
                : "Project tasks"}
            </h2>
            <span>{dashboard.selectedProject?.name ?? "Select a project"}</span>
          </div>
          <div className="task-list">
            {dashboard.selectedTasks.length === 0 ? (
              <p className="empty-state">
                {dashboard.selectedProject
                  ? "No tasks in this project."
                  : "No project selected."}
              </p>
            ) : (
              dashboard.selectedTasks.map((task) => (
                <article className="task-row" key={task.id}>
                  <div>
                    <strong>{task.title}</strong>
                    <span>
                      {dashboard.selectedProject?.name ??
                        dashboard.projectNamesById[task.projectId] ??
                        task.projectId}
                    </span>
                  </div>
                  <button
                    className="status-pill"
                    data-status={task.status}
                    onClick={() => toggleTaskDone(task)}
                    type="button"
                  >
                    {task.status}
                  </button>
                  <span className="mono">p{task.priority}</span>
                </article>
              ))
            )}
            {dashboard.selectedTasks.length < dashboard.selectedTaskCount ? (
              <div className="show-more-row">
                <button
                  className="secondary"
                  onClick={() => setTaskLimit((limit) => limit + LIST_PAGE_SIZE)}
                  type="button"
                >
                  Show more
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="data-panel">
          <div className="panel-heading">
            <h2>
              First {formatNumber(visibleProjectCount || LIST_PAGE_SIZE)} projects
            </h2>
            <span>{formatNumber(dashboard.totalProjects)} total</span>
          </div>
          <div className="project-list">
            {dashboard.projects.length === 0 ? (
              <p className="empty-state">No projects loaded.</p>
            ) : (
              dashboard.projects.map((project) => (
                <button
                  className="project-row"
                  data-selected={project.id === dashboard.selectedProject?.id}
                  key={project.id}
                  onClick={() => selectProject(project.id)}
                  type="button"
                >
                  <span
                    className="project-swatch"
                    style={{ backgroundColor: project.color }}
                  />
                  <strong>{project.name}</strong>
                  <span>
                    {formatNumber(
                      dashboard.projectTaskCountsById[project.id] ?? 0,
                    )}{" "}
                    tasks
                  </span>
                </button>
              ))
            )}
            {dashboard.projects.length < dashboard.totalProjects ? (
              <div className="show-more-row">
                <button
                  className="secondary"
                  onClick={() =>
                    setProjectLimit((limit) => limit + LIST_PAGE_SIZE)
                  }
                  type="button"
                >
                  Show more
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
