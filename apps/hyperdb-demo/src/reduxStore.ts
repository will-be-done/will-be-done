import {
  configureStore,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";
import { useDispatch, useSelector } from "react-redux";
import {
  createWorkloadRows,
  type ClearWorkloadResult,
  type DashboardSnapshot,
  type Project,
  type Task,
  type WorkloadResult,
} from "./workload";

type ReduxWorkloadState = {
  projects: Project[];
  tasks: Task[];
  projectTaskCountsById: Record<string, number>;
  stats: {
    totalTasks: number;
    todoTasks: number;
    doingTasks: number;
    doneTasks: number;
  };
};

const initialState: ReduxWorkloadState = {
  projects: [],
  tasks: [],
  projectTaskCountsById: {},
  stats: {
    totalTasks: 0,
    todoTasks: 0,
    doingTasks: 0,
    doneTasks: 0,
  },
};

function addTaskStats(
  stats: ReduxWorkloadState["stats"],
  tasks: Task[],
  delta: 1 | -1,
) {
  for (const task of tasks) {
    if (task.status === "todo") {
      stats.todoTasks += delta;
    } else if (task.status === "doing") {
      stats.doingTasks += delta;
    } else {
      stats.doneTasks += delta;
    }
  }

  stats.totalTasks += tasks.length * delta;
}

export const workloadSlice = createSlice({
  name: "reduxWorkload",
  initialState,
  reducers: {
    generateReduxWorkload: {
      reducer(
        state,
        action: PayloadAction<{
          projects: Project[];
          tasks: Task[];
          result: WorkloadResult;
        }>,
      ) {
        state.projects.push(...action.payload.projects);
        state.tasks.push(...action.payload.tasks);

        for (const task of action.payload.tasks) {
          state.projectTaskCountsById[task.projectId] =
            (state.projectTaskCountsById[task.projectId] ?? 0) + 1;
        }

        addTaskStats(state.stats, action.payload.tasks, 1);
      },
      prepare(payload: { projectCount: number; tasksPerProject: number }) {
        const rows = createWorkloadRows(
          payload.projectCount,
          payload.tasksPerProject,
        );

        return {
          payload: {
            projects: rows.projects,
            tasks: rows.tasks,
            result: rows.result,
          },
        };
      },
    },
    clearReduxWorkload(
      state,
      action: PayloadAction<ClearWorkloadResult>,
    ) {
      void action.payload;
      state.projects = [];
      state.tasks = [];
      state.projectTaskCountsById = {};
      state.stats = { ...initialState.stats };
    },
    toggleReduxTaskDone(state, action: PayloadAction<string>) {
      const task = state.tasks.find((item) => item.id === action.payload);

      if (!task) return;

      if (task.status === "done") {
        task.status = "todo";
        state.stats.doneTasks -= 1;
        state.stats.todoTasks += 1;
      } else if (task.status === "doing") {
        state.stats.doingTasks -= 1;
        task.status = "done";
        state.stats.doneTasks += 1;
      } else {
        state.stats.todoTasks -= 1;
        task.status = "done";
        state.stats.doneTasks += 1;
      }
    },
  },
});

export const {
  clearReduxWorkload,
  generateReduxWorkload,
  toggleReduxTaskDone,
} = workloadSlice.actions;

export const reduxStore = configureStore({
  reducer: {
    reduxWorkload: workloadSlice.reducer,
  },
});

export type ReduxRootState = ReturnType<typeof reduxStore.getState>;
export type ReduxAppDispatch = typeof reduxStore.dispatch;

export const useReduxAppDispatch = useDispatch.withTypes<ReduxAppDispatch>();
export const useReduxAppSelector = useSelector.withTypes<ReduxRootState>();

export function selectReduxDashboardSnapshot(
  state: ReduxRootState,
  taskLimit = 10,
  projectLimit = 10,
  selectedProjectId: string | null = null,
): DashboardSnapshot {
  const projects = state.reduxWorkload.projects.slice(0, projectLimit);
  const selectedProject = selectedProjectId
    ? state.reduxWorkload.projects.find(
        (project) => project.id === selectedProjectId,
      ) ?? null
    : projects[0] ?? null;
  const selectedTasks = selectedProject
    ? state.reduxWorkload.tasks
        .filter((task) => task.projectId === selectedProject.id)
        .sort((left, right) => left.position - right.position)
        .slice(0, taskLimit)
    : [];
  const projectNamesById = Object.fromEntries(
    projects.map((project) => [project.id, project.name]),
  );

  return {
    projects,
    selectedProject,
    selectedTasks,
    selectedTaskCount: selectedProject
      ? state.reduxWorkload.projectTaskCountsById[selectedProject.id] ?? 0
      : 0,
    projectTaskCountsById: Object.fromEntries(
      projects.map((project) => [
        project.id,
        state.reduxWorkload.projectTaskCountsById[project.id] ?? 0,
      ]),
    ),
    projectNamesById,
    totalProjects: state.reduxWorkload.projects.length,
    totalTasks: state.reduxWorkload.stats.totalTasks,
    todoTasks: state.reduxWorkload.stats.todoTasks,
    doingTasks: state.reduxWorkload.stats.doingTasks,
    doneTasks: state.reduxWorkload.stats.doneTasks,
  };
}
