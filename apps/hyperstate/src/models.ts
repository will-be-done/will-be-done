// import { createSelectorCreator } from "reselect";
// import { createSelectorCreator } from "reselect";
import { connectToDevTools } from "./devtool";
import {
  createActionCreator,
  createStore,
  createSelectorCreator,
  createSlice,
  replaceSlices,
} from "./state";
import { deepEqual, shallowEqual } from "fast-equals";
import { withoutUndoAction, withUndoManager } from "./undoManager";
import { update, withEntityListener } from "./entity";

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
  project: {
    byIds: Record<string, Project>;
  };
  task: {
    byIds: Record<string, Task>;
  };
  taskTemplate: {
    byIds: Record<string, TaskTemplate>;
  };
  taskProjection: {
    byIds: Record<string, TaskProjection>;
  };
  dailyList: {
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

export const allProjectsSlice = createSlice({
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
    (query): { id: string; orderToken: string }[] => {
      const byIds = query((state) => state.project.byIds);

      console.log("getting all ids and tokens");
      return Object.values(byIds).map((p) => ({
        id: p.id,
        orderToken: p.orderToken,
      }));
    },
    deepEqual,
  ),
  getSortedProjectIds: appSelector((query): string[] => {
    const allIdsAndTokens = query(allProjectsSlice.allIdsAndTokens);
    // console.log({ allIdsAndTokens: allIdsAndTokens() });
    // const byIds = query(projectsListSelectors.all);
    // const allIdsAndTokens = byIds.map((p) => ({
    //   id: p.id,
    //   orderToken: p.orderToken,
    // }));

    console.log("SORTING!");
    return [...allIdsAndTokens]
      .sort(fractionalCompare)
      .map((p) => p.id)
      .slice(0, 10);
  }, shallowEqual),
  getLastChildId: appSelector((query): string | undefined => {
    const sortedProjects = query(allProjectsSlice.getSortedProjectIds);

    if (sortedProjects.length === 0) return undefined;

    return sortedProjects[sortedProjects.length - 1];
  }),
  getFirstChildId: appSelector((query): string | undefined => {
    const sortedProjects = query(allProjectsSlice.getSortedProjectIds);

    return sortedProjects[0];
  }),
});

export const projectsSlice = createSlice({
  getById: appSelector((query, id: string) => {
    const res = query((state) => state.project.byIds[id]);
    return res;
  }),
  canDrop(
    _project: string,
    target: { id: string; type: string },
  ): target is Project | TaskTemplate | Task | TaskProjection {
    console.log("canDrop", target);

    return true;
  },

  insertMillion: appAction((state) => {
    const byIds = state.project.byIds;
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
  create: appAction((state, project: Project) => {
    const byIds = state.project.byIds;
    byIds[project.id] = project;
    return project;
  }),
  createWithoutUndo: withoutUndoAction(
    appAction((state, project: Project) => {
      const byIds = state.project.byIds;
      byIds[project.id] = project;
      return project;
    }),
  ),
  update: appAction((state, project: Project): Project => {
    const projInState = projectsSlice.getById(state, project.id);
    if (!projInState) throw new Error("Project not found");

    update(state, project.id, { ...project, title: "New title 123" });
    // Object.assign(projInState, project);

    return projInState;
  }),
  createWithTask: appAction((state, project: Project, task: Task) => {
    const byIds = state.project.byIds;
    byIds[project.id] = project;

    taskSlice.createTask(state, task);
    return project;
  }),
});

export const taskSlice = createSlice({
  createTask: appAction((state, task: Task) => {
    const byIds = state.task.byIds;
    byIds[task.id] = task;

    return task;
  }),
});

export const allSlices = {
  taskSlice,
  projectsSlice,
  allProjectsSlice,
};

if (import.meta.hot) {
  import.meta.hot.accept((newModule) => {
    if (newModule) {
      const newAllSlices: typeof allSlices = newModule.allSlices;

      replaceSlices("allSlices", allSlices, newAllSlices);
    }
  });
}

export const appStore = () => {
  const state: RootState = {
    project: { byIds: {} },
    task: { byIds: {} },
    taskTemplate: { byIds: {} },
    taskProjection: { byIds: {} },
    dailyList: { byIds: {} },
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

  projectsSlice.create(store, {
    id: "1",
    title: "Project 1",
    orderToken: "1",
    type: "project",
  });

  const res = projectsSlice.createWithTask(
    store,
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
  );

  console.log(
    "sorted projects beforr update",
    allProjectsSlice.getSortedProjectIds(store.getState()),
  );

  console.log("res", res);
  // projectsSlice.update(store, {
  //   ...res,
  //   title: "Project 2",
  //   // orderToken: "0",
  // });
  //
  console.log(
    "sorted projects after update",
    allProjectsSlice.getSortedProjectIds(store.getState()),
  );

  console.log("store", store.getState());
  // console.log(projectsListSelectors.getIndexesById(store.getState()));
  // console.log(projectsListSelectors.getIndexById(store.getState(), "1"));
  console.log(projectsSlice.getById(store.getState(), "2"));
  console.log(projectsSlice.getById(store.getState(), "2"));

  connectToDevTools(store);

  return withEntityListener(withUndoManager(store), {
    project(state, action) {
      if (action.action === "create") {
        console.log("create", action.entityType, action.new);
      } else if (action.action === "update") {
        console.log("update", action.entityType, action.new, action.old);
      }
    },
  });
};

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
