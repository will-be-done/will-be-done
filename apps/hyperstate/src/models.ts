import {
  createActionCreator,
  createActions,
  createSelectors,
  createStore,
  memoize,
  memoizeWithArgs,
} from "./state";

export const fractionalCompare = <T extends { id: string; orderToken: string }>(
  item1: T,
  item2: T,
): number => {
  if (item1.orderToken === item2.orderToken) {
    return item1.id > item2.id ? 1 : -1;
  }

  return item1.orderToken > item2.orderToken ? 1 : -1;
};

export type RootState = {
  projects: {
    byIds: Record<string, Project>;
  };
  tasks: {
    byIds: Record<string, Task>;
  };
  taskTemplates: {
    byIds: Record<string, TaskTemplate>;
  };
  taskProjections: {
    byIds: Record<string, TaskProjection>;
  };
  dailyLists: {
    byIds: Record<string, DailyList>;
  };
};
const appAction = createActionCreator<RootState>();

const isObjectType =
  <T>(type: string) =>
  (p: unknown): p is T => {
    return typeof p == "object" && p !== null && "type" in p && p.type === type;
  };

export type Project = {
  type: "project";
  id: string;
  title: string;
  orderToken: string;
  // icon: string;
  // isInbox: boolean;
  // orderToken: string;
};

export type Task = {
  type: "task";
  id: string;
  title: string;
  projectId: string;
  orderToken: string;
};

export type TaskTemplate = {
  type: "template";
  id: string;
  projectId: string;
  orderToken: string;
};

export type TaskProjection = {
  type: "projection";
  id: string;
  taskId: string;
  orderToken: string;
  dailyListId: string;
};

export type DailyList = {
  type: "dailyList";
  id: string;
  date: string;
};

export const isProject = isObjectType<Project>("project");
export const isTask = isObjectType<Task>("task");
export const isTaskTemplate = isObjectType<TaskTemplate>("template");
export const isTaskProjection = isObjectType<TaskProjection>("projection");
export const isDailyList = isObjectType<DailyList>("dailyList");

export interface OrderableItem {
  id: string;
  orderToken: string;
}

export function getSiblings<K extends OrderableItem[]>(
  items: K,
): [K | undefined, K | undefined] {
  const children = listItem.listRef.current.children;

  const i = children.findIndex((it) => it.id === listItem.id);

  return [children[i - 1] as K, children[i + 1] as K];
}

// const createSelectorAutotrack = createSelectorCreator({
//   memoize: unstable_autotrackMemoize,
// });

// const projectsListSelectors = (() => {
//   const getIndexesById = createSelectorAutotrack(
//     [(state: RootState) => state.projects.list],
//     (projects) => {
//       return Object.fromEntries(projects.map((p, i) => [p.id, i]));
//     },
//   );
//
//   const getIndexById = createSelectorAutotrack(
//     [getIndexesById, (_state: RootState, id: string) => id],
//     (indexesById, id) => {
//       return indexesById[id];
//     },
//   );
//
//   const getProjectById = createSelector(
//     [(state: RootState) => state.projects.list, getIndexById],
//     (list, idx) => {
//       console.log("getProjectById", list, idx);
//
//       return list[idx];
//     },
//   );
//
//   const getSortedProjectIds = createSelectorAutotrack(
//     [(state: RootState) => state.projects.list],
//     (projects) => {
//       console.log("sorting!", projects);
//
//       return projects
//         .map((pr) => ({ id: pr.id, orderToken: pr.orderToken }))
//         .sort(fractionalCompare)
//         .map((p) => p.id);
//     },
//   );
//
//   const getLastChildId = createSelectorAutotrack(
//     [getSortedProjectIds],
//     (sortedProjectIds: string[]) => {
//       if (sortedProjectIds.length === 0) return undefined;
//
//       return sortedProjectIds[sortedProjectIds.length - 1];
//     },
//   );
//
//   const getFirstChildId = createSelectorAutotrack(
//     [getSortedProjectIds],
//     (sortedProjectIds: string[]) => {
//       return sortedProjectIds[0];
//     },
//   );
//
//   return {
//     getIndexesById,
//     getIndexById,
//     getProjectById,
//     getSortedProjectIds,
//     getLastChildId,
//     getFirstChildId,
//   };
// })();

export const projectsListSelectors = createSelectors({
  getAllIdsAndTokens: memoize(
    (state: RootState): { id: string; orderToken: string }[] => {
      console.log(" SORTING getAllIdsAndTokens", state);
      const allProjects = Object.values(state.projects.byIds);

      return allProjects.map((p) => ({ id: p.id, orderToken: p.orderToken }));
    },
  ),
  getSortedProjectIdsRaw: (state: RootState): string[] => {
    const allIdsAndTokens = Object.values(state.projects.byIds).map((p) => ({
      id: p.id,
      orderToken: p.orderToken,
    }));

    console.log("SORITNG PROJECTS", allIdsAndTokens);

    return allIdsAndTokens
      .sort(fractionalCompare)
      .map((p) => p.id)
      .slice(0, 100);
  },
  getSortedProjectIds: memoize((state: RootState): string[] => {
    const allIdsAndTokens = Object.values(state.projects.byIds).map((p) => ({
      id: p.id,
      orderToken: p.orderToken,
    }));

    console.log("SORITNG PROJECTS", allIdsAndTokens);

    return allIdsAndTokens
      .sort(fractionalCompare)
      .map((p) => p.id)
      .slice(0, 100);
  }),
  getLastChildId: memoize((state: RootState): string | undefined => {
    const sortedProjects = projectsListSelectors.getSortedProjectIds(state);

    if (sortedProjects.length === 0) return undefined;

    return sortedProjects[sortedProjects.length - 1];
  }),
  getFirstChildId: memoize((state: RootState): string | undefined => {
    const sortedProjects = projectsListSelectors.getSortedProjectIds(state);

    return sortedProjects[0];
  }),
});

export const projectsSelectors = {
  getById: (state: RootState, id: string) => state.projects.byIds[id],
  canDrop(
    project: string,
    target: { id: string; type: string },
  ): target is Project | TaskTemplate | Task | TaskProjection {
    return true;
  },
};

export const projectsActions = createActions({
  insertMillion: appAction((state: RootState) => {
    for (let i = 0; i < 100000; i++) {
      const id = Math.random().toString(36).slice(2);
      state.projects.byIds[id] = {
        id,
        title: "Project 1" + Math.random().toString(36).slice(2),
        orderToken: "1",
        type: "project",
      };
    }
  }),
  create: appAction((state: RootState, _dispatch, project: Project) => {
    state.projects.byIds[project.id] = project;
    return project;
  }),
  update: appAction((state: RootState, _dispatch, project: Project) => {
    const projInState = projectsSelectors.getById(state, project.id);
    if (!projInState) throw new Error("Project not found");

    Object.assign(projInState, project);

    return projInState;
  }),
  createWithTask: appAction(
    (state: RootState, dispatch, project: Project, task: Task) => {
      state.projects.byIds[project.id] = project;

      dispatch(taskActions.createTask(task));
      return project;
    },
  ),
  handleDrop: appAction(
    (state: RootState, dispatch, project: Project, target: AnyModel) => {},
  ),
});

export const taskActions = {
  createTask: appAction((state: RootState, _dispatch, task: Task) => {
    state.tasks.byIds[task.id] = task;

    return task;
  }),
};

export const store = (() => {
  const state: RootState = {
    projects: { byIds: {} },
    tasks: { byIds: {} },
    taskTemplates: { byIds: {} },
    taskProjections: { byIds: {} },
    dailyLists: { byIds: {} },
  };

  const store = createStore(state);

  store.subscribe((state, prevState, patches, reversePatches) => {
    // console.log("!!!!!!!!!!!!!NEW STATE!!!!!!!!!!!!!!");
    // console.log(
    //   "subscribe soring!",
    //   projectsListSelectors.getSortedProjectIds(state),
    // );
    // console.log("state", state);
    // console.log("prevState", prevState);
    // console.log("patches", patches);
    // console.log("reversePatches", reversePatches);
    // console.log("!!!!!!!!!!!!!NEW STATE END!!!!!!!!!!!!!!");
  });

  // setInterval(() => {
  //   projectsListSelectors.getSortedProjectIdsRaw(store.getState());
  // }, 1000);

  store.dispatch(
    projectsActions.create({
      id: "1",
      title: "Project 1",
      orderToken: "1",
      type: "project",
    }),
  );
  const res = store.dispatch(
    projectsActions.createWithTask(
      {
        id: "2",
        title: "Project 1",
        orderToken: "2",
        type: "project",
      },
      {
        type: "task",
        id: "1",
        title: "Task 1",
        projectId: "2",
        orderToken: "0",
      },
    ),
  );

  console.log(
    "sorted projects beforr update",
    projectsListSelectors.getSortedProjectIds(store.getState()),
  );

  console.log("res", res);
  store.dispatch(
    projectsActions.update({
      ...res,
      title: "Project 2",
      // orderToken: "0",
    }),
  );

  console.log(
    "sorted projects after update",
    projectsListSelectors.getSortedProjectIds(store.getState()),
  );

  console.log("store", store.getState());
  // console.log(projectsListSelectors.getIndexesById(store.getState()));
  // console.log(projectsListSelectors.getIndexById(store.getState(), "1"));
  console.log(projectsSelectors.getById(store.getState(), "2"));

  return store;
})();

// export const projectsSelectors = {
//   getSiblingsIds(state: RootState, projectId: string) {
//     const sortedProjects = projectsListSelectors.getSortedProjectIds(state);
//     const i = sortedProjects.findIndex((it) => it === projectId);
//
//     return [sortedProjects[i - 1], sortedProjects[i + 1]] as const;
//   },
//   lastChildId(state: RootState, projectId: string) {
//     const projects = projectsSelectors.childrenIds(state, projectId);
//
//     if (projects.length === 0) return undefined;
//
//     return projects[projects.length - 1];
//   },
//   firstChildId(state: RootState, projectId: string) {
//     const projects = projectsSelectors.childrenIds(state, projectId);
//
//     return projects[0];
//   },
//   childrenIds(state: RootState, projectId: string) {
//     const tasks = Object.values(state.tasks).filter(
//       (task) => task.projectId === projectId,
//     );
//     const templates = Object.values(state.taskTemplates).filter(
//       (template) => template.projectId === projectId,
//     );
//
//     return [...tasks, ...templates].sort(fractionalCompare).map((p) => p.id);
//   },
// };
