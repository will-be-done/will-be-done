import {
  createActionCreator,
  createStore,
  memoize,
  memoizeWithArgs,
  StoreApi,
} from "@will-be-done/hyperstate";
import { format } from "date-fns";
import { generateJitteredKeyBetween } from "fractional-indexing-jittered";
import { uuidv7 } from "uuidv7";
import uuidByString from "uuid-by-string";
import AwaitLock from "await-lock";
import { getDbCtx } from "@/sync/db";

export const inboxId = "01965eb2-7d13-727f-9f50-3d565d0ce2ef";

export const getDMY = (date: Date) => {
  return format(date, "yyyy-MM-dd");
};
const makeDailyListId = (date: Date) => {
  return uuidByString(getDMY(date));
};

export const generateKeyPositionedBetween = (
  current: OrderableItem,
  siblings: [OrderableItem | undefined, OrderableItem | undefined],
  position: "before" | "after",
) => {
  const [up, down] = siblings;

  let between: [OrderableItem | undefined, OrderableItem | undefined] = [
    up,
    current,
  ];
  if (position === "after") {
    between = [current, down] as const;
  }
  const orderToken = generateJitteredKeyBetween(
    between[0]?.orderToken || null,
    between[1]?.orderToken || null,
  );

  return orderToken;
};

const generateOrderTokenPositioned = (
  state: RootState,
  parentId: string,
  current: {
    lastChild(state: RootState, parentId: string): OrderableItem | undefined;
    firstChild(state: RootState, parentId: string): OrderableItem | undefined;
  },
  position:
    | [OrderableItem | undefined, OrderableItem | undefined]
    | "append"
    | "prepend",
) => {
  if (position === "append") {
    return generateJitteredKeyBetween(
      current.lastChild(state, parentId)?.orderToken || null,
      null,
    );
  }

  if (position === "prepend") {
    return generateJitteredKeyBetween(
      null,
      current.firstChild(state, parentId)?.orderToken || null,
    );
  }

  return generateJitteredKeyBetween(
    position[0]?.orderToken || null,
    position[1]?.orderToken || null,
  );
};
export const fractionalCompare = <T extends { id: string; orderToken: string }>(
  item1: T,
  item2: T,
): number => {
  if (item1.orderToken === item2.orderToken) {
    return item1.id > item2.id ? 1 : -1;
  }

  return item1.orderToken > item2.orderToken ? 1 : -1;
};

interface OrderableItem {
  id: string;
  orderToken: string;
}

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
  icon: string;
  isInbox: boolean;
  orderToken: string;
};

type ProjectItem = Task | TaskTemplate;

type TaskState = "todo" | "done";
export type Task = {
  type: "task";
  id: string;
  title: string;
  state: TaskState;
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

type AnyModel = Project | Task | TaskTemplate | TaskProjection | DailyList;

export const isProject = isObjectType<Project>("project");
export const isTask = isObjectType<Task>("task");
export const isTaskTemplate = isObjectType<TaskTemplate>("template");
export const isTaskProjection = isObjectType<TaskProjection>("projection");
export const isDailyList = isObjectType<DailyList>("dailyList");

export function getSiblingIds(
  items: string[],
  itemId: string,
): [string | undefined, string | undefined] {
  const i = items.findIndex((it) => it === itemId);

  return [items[i - 1], items[i + 1]] as const;
}

export const appSelectors = {
  getEntityById(state: RootState, id: string) {
    const storages = [
      state.projects,
      state.tasks,
      state.taskTemplates,
      state.taskProjections,
      state.dailyLists,
    ];
    for (const storage of storages) {
      const entity = storage.byIds[id];

      if (entity) {
        return entity;
      }
    }

    return undefined;
  },
};

export const dailyListSelectors = {
  byId: memoizeWithArgs(
    (state: RootState, id: string) => state.dailyLists.byIds[id],
  ),
  canDrop(state: RootState, dailyListId: string, targetId: string) {
    return false;
  },
  childrenIds: memoizeWithArgs(
    (state: RootState, dailyListId: string): string[] => {
      return Object.values(state.taskProjections.byIds)
        .filter((proj) => proj.dailyListId === dailyListId)
        .map((proj) => proj.id);
    },
  ),
  taskIds: memoizeWithArgs(
    (state: RootState, dailyListId: string): string[] => {
      return dailyListSelectors
        .childrenIds(state, dailyListId)
        .map((id) => taskProjectionSelectors.byId(state, id)?.taskId)
        .filter((t) => t !== undefined);
    },
  ),
  firstChild: memoizeWithArgs(
    (state: RootState, dailyListId: string): TaskProjection | undefined => {
      const childrenIds = dailyListSelectors.childrenIds(state, dailyListId);
      const firstChildId = childrenIds[0];

      return firstChildId
        ? taskProjectionSelectors.byId(state, firstChildId)
        : undefined;
    },
  ),
  lastChild: memoizeWithArgs(
    (state: RootState, dailyListId: string): TaskProjection | undefined => {
      const childrenIds = dailyListSelectors.childrenIds(state, dailyListId);
      const lastChildId = childrenIds[childrenIds.length - 1];

      return lastChildId
        ? taskProjectionSelectors.byId(state, lastChildId)
        : undefined;
    },
  ),
  firstDoneChild: memoizeWithArgs(
    (state: RootState, dailyListId: string): TaskProjection | undefined => {
      const childrenIds = dailyListSelectors.childrenIds(state, dailyListId);

      const projections = childrenIds
        .map((id) => taskProjectionSelectors.byId(state, id))
        .filter((p) => p !== undefined);
      const tasksWithProjections = projections.map(
        (proj) => [proj, taskSelectors.byId(state, proj.taskId)] as const,
      );

      return tasksWithProjections.find(
        ([proj, task]) => task?.state === "done",
      )?.[0];
    },
  ),
  byDate: memoizeWithArgs(
    (state: RootState, date: Date): DailyList | undefined => {
      const allDailyLists = Object.values(state.dailyLists.byIds);
      const dmy = getDMY(date);

      for (const dailyList of allDailyLists) {
        if (dmy === dailyList.date) {
          return dailyList;
        }
      }
    },
  ),
  byDates: memoizeWithArgs((state: RootState, dates: Date[]): DailyList[] => {
    return dates
      .map((date) => dailyListSelectors.byDate(state, date))
      .filter((d) => d != undefined);
  }),
};
export const dailyListActions = {
  handleDrop: appAction(
    (
      state: RootState,
      _dispatch,
      dailyListId: string,
      targetId: string,
      edge: "top" | "bottom",
    ) => {},
  ),
  createProjection: appAction(
    (
      state: RootState,
      _dispatch,
      dailyList: Partial<DailyList> & {
        projectId: string;
        orderToken: string;
      },
    ) => {
      // TODO
      // const id = dailyList.id || uuidv7();
      // state.dailyLists.byIds[id] = {
      //   type: "dailyList",
      //   id,
      //   date: dailyList.date,
      //   ...dailyList,
      // };
      //
      // return id;
    },
  ),
  create: appAction(
    (
      state: RootState,
      _dispatch,
      dailyList: Partial<DailyList> & {
        date: string;
      },
    ): DailyList => {
      const id = dailyList.id || uuidv7();

      const list: DailyList = {
        type: "dailyList",
        id,
        ...dailyList,
      };
      state.dailyLists.byIds[id] = list;

      return list;
    },
  ),
  createIfNotPresent: appAction(
    (state: RootState, dispatch, date: Date): DailyList => {
      const dailyList = dailyListSelectors.byDate(state, date);

      if (!dailyList) {
        const newList = dispatch(
          dailyListActions.create({
            id: makeDailyListId(date),
            date: getDMY(date),
          }),
        );

        return newList;
      } else {
        return dailyList;
      }
    },
  ),
  createManyIfNotPresent: appAction(
    (state: RootState, dispatch, dates: Date[]): DailyList[] => {
      return dates.map((date) =>
        dispatch(dailyListActions.createIfNotPresent(date)),
      );
    },
  ),
};

export const taskProjectionSelectors = {
  byId: memoizeWithArgs(
    (state: RootState, id: string) => state.taskProjections.byIds[id],
  ),
  canDrop(state: RootState, taskProjectionId: string, targetId: string) {
    return false;
  },
  siblings: memoizeWithArgs(
    (
      state: RootState,
      taskProjectionId: string,
    ): [TaskProjection | undefined, TaskProjection | undefined] => {
      const items = projectsListSelectors.childrenIds(state);

      const i = items.findIndex((it) => it === taskProjectionId);

      const beforeId = items[i - 1];
      const afterId = items[i + 1];

      return [
        beforeId ? taskProjectionSelectors.byId(state, beforeId) : undefined,
        afterId ? taskProjectionSelectors.byId(state, afterId) : undefined,
      ];
    },
  ),
};

export const taskProjectionActions = {
  handleDrop: appAction(
    (
      state: RootState,
      _dispatch,
      taskProjectionId: string,
      targetId: string,
      edge: "top" | "bottom",
    ) => {},
  ),
  create: appAction(
    (
      state: RootState,
      _dispatch,
      taskProjection: Partial<TaskProjection> & {
        taskId: string;
        dailyListId: string;
        orderToken: string;
      },
    ) => {
      const id = taskProjection.id || uuidv7();

      state.taskProjections.byIds[id] = {
        type: "projection",
        id,
        ...taskProjection,
      };
    },
  ),
  createSibling: appAction(
    (
      state: RootState,
      _dispatch,
      taskProjectionId: string,
      position: "before" | "after",
    ) => {
      const taskProjection = taskProjectionSelectors.byId(
        state,
        taskProjectionId,
      );

      if (!taskProjection) throw new Error("TaskProjection not found");

      taskProjectionActions.create({
        taskId: taskProjection.taskId,
        dailyListId: taskProjection.dailyListId,
        orderToken: generateKeyPositionedBetween(
          taskProjection,
          taskProjectionSelectors.siblings(state, taskProjectionId),
          position,
        ),
      });
    },
  ),
};

export const taskSelectors = {
  canDrop(state: RootState, taskId: string, targetId: string) {
    return false;
  },
  byId: memoizeWithArgs(
    (state: RootState, id: string) => state.tasks.byIds[id],
  ),
  siblings: memoizeWithArgs(
    (
      state: RootState,
      taskId: string,
    ): [ProjectItem | undefined, ProjectItem | undefined] => {
      const items = projectsListSelectors.childrenIds(state);

      const i = items.findIndex((it) => it === taskId);
      const beforeId = items[i - 1];
      const afterId = items[i + 1];

      return [
        beforeId ? taskSelectors.byId(state, beforeId) : undefined,
        afterId ? taskSelectors.byId(state, afterId) : undefined,
      ];
    },
  ),
};
export const taskActions = {
  createTask: appAction(
    (
      state: RootState,
      _dispatch,
      task: Partial<Task> & { projectId: string; orderToken: string },
    ) => {
      const id = task.id || uuidv7();
      state.tasks.byIds[id] = {
        type: "task",
        id,
        title: "",
        state: "todo",
        ...task,
      };

      return task;
    },
  ),
  createSibling: appAction(
    (
      state: RootState,
      _dispatch,
      taskId: string,
      position: "before" | "after",
    ) => {
      const task = taskSelectors.byId(state, taskId);

      if (!task) throw new Error("Task not found");

      taskActions.createTask({
        projectId: task.projectId,
        orderToken: generateKeyPositionedBetween(
          task,
          taskSelectors.siblings(state, taskId),
          position,
        ),
      });
    },
  ),
  handleDrop: appAction(
    (
      state: RootState,
      _dispatch,
      taskId: string,
      targetId: string,
      edge: "top" | "bottom",
    ) => {},
  ),
};
export const projectsListActions = {
  createProject: appAction(
    (
      state: RootState,
      _dispatch,
      newProject: Partial<Project>,
      position:
        | [OrderableItem | undefined, OrderableItem | undefined]
        | "append"
        | "prepend",
    ) => {
      const orderToken = generateOrderTokenPositioned(
        state,
        "all-projects-list",
        projectsListSelectors,
        position,
      );

      const id = newProject.id || uuidv7();
      const project: Project = {
        type: "project",
        id: id,
        orderToken: orderToken,
        title: "New project",
        icon: "",
        isInbox: false,
        ...newProject,
      };

      state.projects.byIds[id] = project;
    },
  ),
};

export const projectsListSelectors = {
  childrenIds: memoize((state: RootState): string[] => {
    const allIdsAndTokens = Object.values(state.projects.byIds).map((p) => ({
      id: p.id,
      orderToken: p.orderToken,
    }));

    console.log("SORITNG PROJECTS", allIdsAndTokens);

    return allIdsAndTokens.sort(fractionalCompare).map((p) => p.id);
  }),
  childrenIdsWithoutInbox: memoize((state: RootState): string[] => {
    return projectsListSelectors
      .childrenIds(state)
      .filter((id) => id !== inboxId);
  }),
  firstChild: memoize((state: RootState): Project | undefined => {
    const childrenIds = projectsListSelectors.childrenIds(state);
    const firstChildId = childrenIds[0];

    return firstChildId
      ? projectsSelectors.byId(state, firstChildId)
      : undefined;
  }),
  lastChild: memoize((state: RootState): Project | undefined => {
    const childrenIds = projectsListSelectors.childrenIds(state);
    const lastChildId = childrenIds[childrenIds.length - 1];

    return lastChildId ? projectsSelectors.byId(state, lastChildId) : undefined;
  }),
  inbox: memoize((state: RootState): Project => {
    const inbox = projectsSelectors.byId(state, inboxId);
    if (!inbox) throw new Error("Inbox not found");
    return inbox;
  }),
};

export const projectsSelectors = {
  byId: (state: RootState, id: string) => state.projects.byIds[id],
  byIdOrThrow: (state: RootState, id: string) => {
    const project = projectsSelectors.byId(state, id);
    if (!project) throw new Error("Project not found");

    return project;
  },
  canDrop(state: RootState, projectId: string, targetId: string) {
    const target = projectsSelectors.byId(state, targetId);
    if (isProject(target) && target.isInbox) {
      return false;
    }

    return (
      isProject(target) ||
      isTask(target) ||
      isTaskTemplate(target) ||
      isTaskProjection(target)
    );
  },
  siblings: memoizeWithArgs(
    (
      state: RootState,
      projectId: string,
    ): [Project | undefined, Project | undefined] => {
      const items = projectsListSelectors.childrenIds(state);
      const i = items.findIndex((it) => it === projectId);

      const beforeId = items[i - 1];
      const afterId = items[i + 1];

      return [
        beforeId ? projectsSelectors.byId(state, beforeId) : undefined,
        afterId ? projectsSelectors.byId(state, afterId) : undefined,
      ];
    },
  ),
  childrenIds: memoizeWithArgs(
    (state: RootState, projectId: string): string[] => {
      const tasks = Object.values(state.tasks.byIds).filter(
        (task) => task.projectId === projectId,
      );
      const templates = Object.values(state.taskTemplates.byIds).filter(
        (template) => template.projectId === projectId,
      );

      return [...tasks, ...templates].sort(fractionalCompare).map((p) => p.id);
    },
  ),
  childrenCount: memoizeWithArgs(
    (state: RootState, projectId: string): number => {
      return projectsSelectors.childrenIds(state, projectId).length;
    },
  ),
  firstChild: memoizeWithArgs(
    (state: RootState, projectId: string): ProjectItem | undefined => {
      const childrenIds = projectsSelectors.childrenIds(state, projectId);
      const firstChildId = childrenIds[0];

      return firstChildId
        ? projectsSelectors.getItemById(state, firstChildId)
        : undefined;
    },
  ),
  lastChild: memoizeWithArgs(
    (state: RootState, projectId: string): ProjectItem | undefined => {
      const childrenIds = projectsSelectors.childrenIds(state, projectId);

      const lastChildId = childrenIds[childrenIds.length - 1];

      return lastChildId
        ? projectsSelectors.getItemById(state, lastChildId)
        : undefined;
    },
  ),
  tasksIds: memoizeWithArgs((state: RootState, projectId: string): string[] => {
    return projectsSelectors
      .childrenIds(state, projectId)
      .map((id) => taskSelectors.byId(state, id))
      .map((task) => task?.id)
      .filter((task) => task !== undefined);
  }),
  notDoneTaskIds: memoizeWithArgs(
    (state: RootState, projectId: string): string[] => {
      return projectsSelectors.tasksIds(state, projectId).filter((id) => {
        const task = taskSelectors.byId(state, id);
        if (!task) return false;

        return task.state !== "done";
      });
    },
  ),
  withoutTasksByIds: memoizeWithArgs(
    (state: RootState, projectId: string, ids: string[]): string[] => {
      const setIds = new Set(ids);
      return projectsSelectors.childrenIds(state, projectId).filter((id) => {
        return !setIds.has(id);
      });
    },
  ),
  getItemById: memoizeWithArgs(
    (state: RootState, id: string): ProjectItem | undefined => {
      const task = taskSelectors.byId(state, id);
      if (!task) return undefined;

      // TODO: add template support
      //
      return task;
    },
  ),
};

export const projectsActions = {
  create: appAction((state: RootState, _dispatch, project: Project) => {
    state.projects.byIds[project.id] = project;
    return project;
  }),
  delete: appAction((state: RootState, _dispatch, id: string) => {
    delete state.projects.byIds[id];
  }),
  update: appAction(
    (state: RootState, _dispatch, id: string, project: Partial<Project>) => {
      const projInState = projectsSelectors.byId(state, id);
      if (!projInState) throw new Error("Project not found");

      Object.assign(projInState, project);

      return projInState;
    },
  ),
  handleDrop: appAction(
    (
      state: RootState,
      _dispatch,
      projectId: string,
      targetId: string,
      edge: "top" | "bottom",
    ) => {
      if (!projectsSelectors.canDrop(state, projectId, targetId)) {
        return;
      }

      const project = projectsSelectors.byId(state, projectId);
      if (!project) throw new Error("Project not found");
      const target = projectsSelectors.byId(state, targetId);
      if (!target) throw new Error("Target not found");

      if (isProject(target)) {
        const [up, down] = projectsSelectors.siblings(state, project.id);

        let between: [string | undefined, string | undefined] = [
          project.orderToken,
          down?.orderToken,
        ];
        if (edge == "top") {
          between = [up?.orderToken, project.orderToken];
        }

        const orderToken = generateJitteredKeyBetween(
          between[0] || null,
          between[1] || null,
        );

        target.orderToken = orderToken;
      }
    },
  ),
  createTask: appAction(
    (
      state: RootState,
      dispatch,
      projectId: string,
      position:
        | [OrderableItem | undefined, OrderableItem | undefined]
        | "append"
        | "prepend",
    ) => {
      const project = projectsSelectors.byId(state, projectId);
      if (!project) throw new Error("Project not found");

      const orderToken = generateOrderTokenPositioned(
        state,
        projectId,
        projectsSelectors,
        position,
      );

      dispatch(
        taskActions.createTask({
          projectId: projectId,
          orderToken: orderToken,
        }),
      );
    },
  ),
};

// export const store = (() => {
//   const state: RootState = {
//     projects: { byIds: {} },
//     tasks: { byIds: {} },
//     taskTemplates: { byIds: {} },
//     taskProjections: { byIds: {} },
//     dailyLists: { byIds: {} },
//   };
//
//   const store = createStore(state);
//
//   store.subscribe((state, prevState, patches, reversePatches) => {
//     // console.log("!!!!!!!!!!!!!NEW STATE!!!!!!!!!!!!!!");
//     // console.log(
//     //   "subscribe soring!",
//     //   projectsListSelectors.getSortedProjectIds(state),
//     // );
//     // console.log("state", state);
//     // console.log("prevState", prevState);
//     // console.log("patches", patches);
//     // console.log("reversePatches", reversePatches);
//     // console.log("!!!!!!!!!!!!!NEW STATE END!!!!!!!!!!!!!!");
//   });
//
//   store.dispatch(
//     projectsActions.create({
//       id: "1",
//       title: "Project 1",
//       orderToken: "1",
//       type: "project",
//     }),
//   );
//   const res = store.dispatch(
//     projectsActions.createWithTask(
//       {
//         id: "2",
//         title: "Project 1",
//         orderToken: "2",
//         type: "project",
//       },
//       {
//         type: "task",
//         id: "1",
//         title: "Task 1",
//         projectId: "2",
//         orderToken: "0",
//       },
//     ),
//   );
//
//   console.log(
//     "sorted projects beforr update",
//     projectsListSelectors.getSortedProjectIds(store.getState()),
//   );
//
//   console.log("res", res);
//   store.dispatch(
//     projectsActions.update({
//       ...res,
//       title: "Project 2",
//       // orderToken: "0",
//     }),
//   );
//
//   console.log(
//     "sorted projects after update",
//     projectsListSelectors.getSortedProjectIds(store.getState()),
//   );
//
//   console.log("store", store.getState());
//   // console.log(projectsListSelectors.getIndexesById(store.getState()));
//   // console.log(projectsListSelectors.getIndexById(store.getState(), "1"));
//   console.log(projectsSelectors.getById(store.getState(), "2"));
//
//   return store;
// })();
//
// // export const projectsSelectors = {
// //   getSiblingsIds(state: RootState, projectId: string) {
// //     const sortedProjects = projectsListSelectors.getSortedProjectIds(state);
// //     const i = sortedProjects.findIndex((it) => it === projectId);
// //
// //     return [sortedProjects[i - 1], sortedProjects[i + 1]] as const;
// //   },
// //   lastChildId(state: RootState, projectId: string) {
// //     const projects = projectsSelectors.childrenIds(state, projectId);
// //
// //     if (projects.length === 0) return undefined;
// //
// //     return projects[projects.length - 1];
// //   },
// //   firstChildId(state: RootState, projectId: string) {
// //     const projects = projectsSelectors.childrenIds(state, projectId);
// //
// //     return projects[0];
// //   },
// //   childrenIds(state: RootState, projectId: string) {
// //     const tasks = Object.values(state.tasks).filter(
// //       (task) => task.projectId === projectId,
// //     );
// //     const templates = Object.values(state.taskTemplates).filter(
// //       (template) => template.projectId === projectId,
// //     );
// //
// //     return [...tasks, ...templates].sort(fractionalCompare).map((p) => p.id);
// //   },
// // };
