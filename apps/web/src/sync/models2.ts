import { applyPatches, Patch, produce } from "immer";

import { enablePatches } from "immer";
enablePatches();

type RootState = {
  projects: Record<string, Project>;
  tasks: Record<string, Task>;
};

type Project = {
  id: string;
  title: string;
};

type Task = {
  id: string;
  title: string;
  projectId: string;
};

export const getProjectTasks = (state: RootState, projectId: string) => {
  for (const project of Object.values(state.projects)) {
    if (project.id === projectId) {
      return state.tasks;
    }
  }
};

type Dispatch = <TActionReturn, TActionParams extends unknown[]>(
  action: ActionFn<TActionReturn, TActionParams>,
  ...actionParams: TActionParams
) => TActionReturn;

// Use the Dispatch type in the Action type definition
type ActionFn<TReturn = unknown, TParams extends unknown[] = unknown[]> = (
  state: RootState,
  dispatch: Dispatch,
  ...params: TParams
) => TReturn;

function action<TReturn = unknown, TParams extends unknown[] = unknown[]>(
  actionFn: ActionFn<TReturn, TParams>,
) {
  return (...params: TParams) => {
    return (state: RootState, dispatch: Dispatch) => {
      return actionFn(state, dispatch, ...params);
    };
  };
}

export const createTaskWithProject = action(
  (state: RootState, dispatch, task: Task, project: Project) => {
    state.tasks[task.id] = task;

    const newProject = dispatch(createProject(project));

    return { task, project: newProject };
  },
);

export const createProject = action(
  (state: RootState, dispatch, project: Project) => {
    state.projects[project.id] = project;

    return project;
  },
);

export function createStore(initialState: RootState) {
  let state = initialState;

  let currentDraft: RootState | undefined = undefined;
  const dispatch = (
    actionFn: (store: RootState, dispatch: Dispatch) => unknown,
  ) => {
    // NOTE: it's critical to keep it to have mutable state be same across all actions
    if (currentDraft) {
      return actionFn(currentDraft, dispatch);
    }

    let patches: Patch[] = [];
    let result: any;

    state = produce(
      state,
      (draft) => {
        currentDraft = draft;

        try {
          result = actionFn(draft, dispatch);
        } finally {
          currentDraft = undefined;
        }
      },
      (p, inversePatches) => {
        patches = p;
      },
    );

    console.log("patches", patches);

    return result;
  };

  return {
    getState() {
      return state;
    },
    dispatch: dispatch as Dispatch,
  };
}

const init = () => {
  const state: RootState = {
    projects: {},
    tasks: {},
  };

  const store = createStore(state);

  const res = store.dispatch(createProject({ id: "1", title: "Project 1" }));
};
