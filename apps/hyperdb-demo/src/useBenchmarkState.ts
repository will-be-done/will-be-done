import { useState } from "react";
import type { ClearWorkloadResult, WorkloadResult } from "./workload";

export const LIST_PAGE_SIZE = 10;

type LastRun = {
  label: string;
  durationMs: number;
  result: WorkloadResult | ClearWorkloadResult;
};

export function useBenchmarkState() {
  const [projectCount, setProjectCount] = useState(20);
  const [tasksPerProject, setTasksPerProject] = useState(500);
  const [taskLimit, setTaskLimit] = useState(LIST_PAGE_SIZE);
  const [projectLimit, setProjectLimit] = useState(LIST_PAGE_SIZE);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [lastRun, setLastRun] = useState<LastRun | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  return {
    projectCount,
    setProjectCount,
    tasksPerProject,
    setTasksPerProject,
    taskLimit,
    setTaskLimit,
    projectLimit,
    setProjectLimit,
    selectedProjectId,
    setSelectedProjectId,
    lastRun,
    setLastRun,
    isWorking,
    setIsWorking,
  };
}

export type BenchmarkState = ReturnType<typeof useBenchmarkState>;
