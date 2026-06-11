import { Provider as ReduxProvider } from "react-redux";
import {
  useDispatch as useHyperdbDispatch,
  useSyncSelector,
} from "@will-be-done/hyperdb-lib/react";
import { BenchmarkApp } from "./BenchmarkApp";
import {
  clearWorkload as clearHyperdbWorkload,
  generateWorkload as generateHyperdbWorkload,
  getDashboardSnapshot,
  toggleTaskDone as toggleHyperdbTaskDone,
} from "./db";
import {
  clearReduxWorkload,
  generateReduxWorkload,
  reduxStore,
  selectReduxDashboardSnapshot,
  toggleReduxTaskDone,
  useReduxAppDispatch,
  useReduxAppSelector,
} from "./reduxStore";
import { useBenchmarkState } from "./useBenchmarkState";
import type { Task } from "./workload";
import "./App.css";

function HyperdbBenchmark() {
  const dispatch = useHyperdbDispatch();
  const benchmarkState = useBenchmarkState();
  const dashboard = useSyncSelector(
    () =>
      getDashboardSnapshot(
        benchmarkState.taskLimit,
        benchmarkState.projectLimit,
        benchmarkState.selectedProjectId,
      ),
    [
      benchmarkState.taskLimit,
      benchmarkState.projectLimit,
      benchmarkState.selectedProjectId,
    ],
  );

  return (
    <BenchmarkApp
      backendName="HyperDB"
      benchmarkState={benchmarkState}
      dashboard={dashboard}
      generateWorkload={(projectCount, tasksPerProject) =>
        dispatch(generateHyperdbWorkload(projectCount, tasksPerProject))
      }
      clearWorkload={() => dispatch(clearHyperdbWorkload())}
      toggleTaskDone={(task: Task) => {
        dispatch(toggleHyperdbTaskDone(task));
      }}
    />
  );
}

function ReduxBenchmarkContent() {
  const dispatch = useReduxAppDispatch();
  const benchmarkState = useBenchmarkState();
  const dashboard = useReduxAppSelector((state) =>
    selectReduxDashboardSnapshot(
      state,
      benchmarkState.taskLimit,
      benchmarkState.projectLimit,
      benchmarkState.selectedProjectId,
    ),
  );

  return (
    <BenchmarkApp
      backendName="Redux Toolkit"
      benchmarkState={benchmarkState}
      dashboard={dashboard}
      generateWorkload={(projectCount, tasksPerProject) =>
        dispatch(generateReduxWorkload({ projectCount, tasksPerProject })).payload
          .result
      }
      clearWorkload={() =>
        dispatch(
          clearReduxWorkload({
            projectsDeleted: dashboard.totalProjects,
            tasksDeleted: dashboard.totalTasks,
          }),
        ).payload
      }
      toggleTaskDone={(task) => {
        dispatch(toggleReduxTaskDone(task.id));
      }}
    />
  );
}

function ReduxBenchmark() {
  return (
    <ReduxProvider store={reduxStore}>
      <ReduxBenchmarkContent />
    </ReduxProvider>
  );
}

function App() {
  return window.location.pathname === "/redux" ? (
    <ReduxBenchmark />
  ) : (
    <HyperdbBenchmark />
  );
}

export default App;
