// import { createSelectorCreator } from "reselect";
// import { createSelectorCreator } from "reselect";
import {
  createActionCreator,
  createActions,
  createSelectors,
  createStore,
  createSelectorCreator,
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
const appSelector = createSelectorCreator<RootState>();
// const appSelector = <TResult>(
//   selectionLogic: SelectionLogic<RootState, TResult>,
// ) => {
//   return selector(selectionLogic);
// };
// const appArgsSelector = <TArgs extends (string | number)[], TResult>(
//   selectionLogicGenerator: (
//     ...args: TArgs
//   ) => SelectionLogic<RootState, TResult>,
// ) => {
//   return argSelector(selectionLogicGenerator);
// };

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
  // getSortedProjectIdsRaw: (state: RootState): string[] => {
  //   const allIdsAndTokens = Object.values(state.projects.byIds).map((p) => ({
  //     id: p.id,
  //     orderToken: p.orderToken,
  //   }));
  //
  //   return allIdsAndTokens
  //     .sort(fractionalCompare)
  //     .map((p) => p.id)
  //     .slice(0, 100);
  // },
  allIdsAndTokens: appSelector(
    (_state, select): { id: string; orderToken: string }[] => {
      return select((state) =>
        Object.values(state.projects.byIds).map((p) => ({
          id: p.id,
          orderToken: p.orderToken,
        })),
      );
    },
  ),
  getSortedProjectIds: appSelector((_state, select): string[] => {
    const allIdsAndTokens = select(projectsListSelectors.allIdsAndTokens());
    // const byIds = query(projectsListSelectors.all);
    // const allIdsAndTokens = byIds.map((p) => ({
    //   id: p.id,
    //   orderToken: p.orderToken,
    // }));

    console.log("SORITNG PROJECTS", allIdsAndTokens);

    return [...allIdsAndTokens]
      .sort(fractionalCompare)
      .map((p) => p.id)
      .slice(0, 10);
  }),
  getLastChildId: appSelector((_state, select): string | undefined => {
    const sortedProjects = select(projectsListSelectors.getSortedProjectIds());

    if (sortedProjects.length === 0) return undefined;

    return sortedProjects[sortedProjects.length - 1];
  }),
  getFirstChildId: appSelector((_state, select): string | undefined => {
    const sortedProjects = select(projectsListSelectors.getSortedProjectIds());

    return sortedProjects[0];
  }),
});

export const projectsSelectors = createSelectors({
  getById: appSelector((_state, select, id: string) => {
    return select((state) => state.projects.byIds[id]);
  }),
  canDrop(
    _project: string,
    target: { id: string; type: string },
  ): target is Project | TaskTemplate | Task | TaskProjection {
    return true;
  },
});

export const projectsActions = createActions({
  insertMillion: appAction((select) => {
    const byIds = select((state) => state.projects.byIds);
    for (let i = 0; i < 100000; i++) {
      const id = Math.random().toString(36).slice(2);
      byIds[id] = {
        id,
        title: "Project 1" + id,
        orderToken: id,
        type: "project",
      };
    }
  }),
  create: appAction((select, _dispatch, project: Project) => {
    const byIds = select((state) => state.projects.byIds);
    byIds[project.id] = project;
    return project;
  }),
  update: appAction((select, _dispatch, project: Project) => {
    const projInState = select(projectsSelectors.getById(project.id));
    if (!projInState) throw new Error("Project not found");

    Object.assign(projInState, project);

    return projInState;
  }),
  createWithTask: appAction(
    (select, dispatch, project: Project, task: Task) => {
      const byIds = select((state) => state.projects.byIds);
      byIds[project.id] = project;

      dispatch(taskActions.createTask(task));
      return project;
    },
  ),
});

export const taskActions = {
  createTask: appAction((select, _dispatch, task: Task) => {
    const byIds = select((state) => state.tasks.byIds);
    byIds[task.id] = task;

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

  // store.subscribe((state, prevState, patches, reversePatches) => {
  //   // console.log("!!!!!!!!!!!!!NEW STATE!!!!!!!!!!!!!!");
  //   // console.log(
  //   //   "new state",
  //   //   JSON.stringify(state, null, 2),
  //   //
  //   //   "prev state",
  //   //   JSON.stringify(prevState, null, 2),
  //   // );
  //   // console.log(
  //   //   "subscribe soring!",
  //   //   projectsListSelectors.getSortedProjectIds(state),
  //   // );
  //   // console.log("state", state);
  //   // console.log("prevState", prevState);
  //   // console.log("patches", patches);
  //   // console.log("reversePatches", reversePatches);
  //   // console.log("!!!!!!!!!!!!!NEW STATE END!!!!!!!!!!!!!!");
  // });

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
    store.select(projectsListSelectors.getSortedProjectIds()),
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
    store.select(projectsListSelectors.getSortedProjectIds()),
  );

  console.log("store", store.getState());
  // console.log(projectsListSelectors.getIndexesById(store.getState()));
  // console.log(projectsListSelectors.getIndexById(store.getState(), "1"));
  console.log(store.select(projectsSelectors.getById("2")));

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
