import {
  createActionCreator,
  createSelectorCreator,
  createStore,
  StoreApi,
} from "@will-be-done/hyperstate";
import { format } from "date-fns";
import { generateJitteredKeyBetween } from "fractional-indexing-jittered";
import { uuidv7 } from "uuidv7";
import uuidByString from "uuid-by-string";
import AwaitLock from "await-lock";
import { getDbCtx } from "@/sync/db";
import { shouldNeverHappen } from "@/utils";
import { shallowEqual } from "fast-equals";

export const inboxId = "01965eb2-7d13-727f-9f50-3d565d0ce2ef";

export const getDMY = (date: Date) => {
  return format(date, "yyyy-MM-dd");
};
const makeDailyListId = (date: Date) => {
  return uuidByString(getDMY(date));
};

const appSelector = createSelectorCreator<RootState>();

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

export type TaskState = "todo" | "done";
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

export type TaskBox = Task | TaskProjection;

export type DailyList = {
  type: "dailyList";
  id: string;
  date: string;
};

type AnyModel = Project | Task | TaskTemplate | TaskProjection | DailyList;
function assertUnreachable(x: never): never {
  throw new Error("Didn't expect to get here");
}

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
  taskBoxById(state: RootState, id: string) {
    const storages = [state.tasks, state.taskProjections];
    for (const storage of storages) {
      const entity = storage.byIds[id];

      if (entity) {
        return entity;
      }
    }

    return undefined;
  },
  taskBoxByIdOrDefault(state: RootState, id: string): Task | TaskProjection {
    const entity = appSelectors.taskBoxById(state, id);
    if (!entity)
      return {
        type: "task",
        id,
        title: "",
        state: "todo",
        projectId: "",
        orderToken: "",
      };

    return entity;
  },
  byId(state: RootState, id: string) {
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
  byIdOrDefault(state: RootState, id: string): AnyModel {
    const entity = appSelectors.byId(state, id);
    if (!entity)
      return {
        type: "project",
        id,
        title: "",
        icon: "",
        isInbox: false,
        orderToken: "",
      };

    return entity;
  },
};

export const todoItemActions = {
  create: appAction((state: RootState, taskBox: TaskBox) => {
    if (isTask(taskBox)) {
      return taskActions.createTask(state, taskBox);
    } else if (isTaskProjection(taskBox)) {
      return taskProjectionActions.create(state, taskBox);
    } else {
      assertUnreachable(taskBox);
    }
  }),
  createSibling: appAction(
    (state: RootState, taskBox: TaskBox, position: "before" | "after") => {
      if (isTask(taskBox)) {
        return taskActions.createSibling(state, taskBox.id, position);
      } else if (isTaskProjection(taskBox)) {
        return taskProjectionActions.createSibling(state, taskBox.id, position);
      } else {
        assertUnreachable(taskBox);
      }
    },
  ),
  handleDrop: appAction(
    (
      state: RootState,

      taskBox: TaskBox,
      targetId: string,
      edge: "top" | "bottom",
    ) => {
      if (isTask(taskBox)) {
        return taskActions.handleDrop(state, taskBox.id, targetId, edge);
      } else if (isTaskProjection(taskBox)) {
        return taskProjectionActions.handleDrop(
          state,
          taskBox.id,
          targetId,
          edge,
        );
      } else {
        assertUnreachable(taskBox);
      }
    },
  ),
};

export const dailyListSelectors = {
  byId: (state: RootState, id: string) => state.dailyLists.byIds[id],
  canDrop(state: RootState, dailyListId: string, targetId: string) {
    return false;
  },
  childrenIds: appSelector((query, dailyListId: string): string[] => {
    return query(
      (state) =>
        Object.values(state.taskProjections.byIds)
          .filter((proj) => proj.dailyListId === dailyListId)
          .map((proj) => proj.id),
      shallowEqual,
    );
  }),
  taskIds: appSelector((query, dailyListId: string): string[] => {
    return query(
      (state) =>
        dailyListSelectors
          .childrenIds(state, dailyListId)
          .map((id) => taskProjectionSelectors.byId(state, id)?.taskId)
          .filter((t) => t !== undefined),
      shallowEqual,
    );
  }),
  firstChild: appSelector(
    (query, dailyListId: string): TaskProjection | undefined => {
      const childrenIds = query((state) =>
        dailyListSelectors.childrenIds(state, dailyListId),
      );
      const firstChildId = childrenIds[0];

      return firstChildId
        ? query((state) => taskProjectionSelectors.byId(state, firstChildId))
        : undefined;
    },
  ),
  lastChild: appSelector(
    (query, dailyListId: string): TaskProjection | undefined => {
      const childrenIds = query((state) =>
        dailyListSelectors.childrenIds(state, dailyListId),
      );
      const lastChildId = childrenIds[childrenIds.length - 1];

      return lastChildId
        ? query((state) => taskProjectionSelectors.byId(state, lastChildId))
        : undefined;
    },
  ),
  firstDoneChild: appSelector(
    (query, dailyListId: string): TaskProjection | undefined => {
      return query((state) => {
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
      });
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

      dailyListId: string,
      targetId: string,
      edge: "top" | "bottom",
    ) => {},
  ),
  createProjection: appAction(
    (
      state: RootState,

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
  createIfNotPresent: appAction((state: RootState, date: Date): DailyList => {
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
  }),
  createManyIfNotPresent: appAction(
    (state: RootState, dates: Date[]): DailyList[] => {
      return dates.map((date) =>
        dispatch(dailyListActions.createIfNotPresent(date)),
      );
    },
  ),
};

export const taskProjectionSelectors = {
  byId: (state: RootState, id: string) => state.taskProjections.byIds[id],
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

      taskProjectionId: string,
      targetId: string,
      edge: "top" | "bottom",
    ) => {},
  ),
  create: appAction(
    (
      state: RootState,

      taskProjection: Partial<TaskProjection> & {
        taskId: string;
        dailyListId: string;
        orderToken: string;
      },
    ) => {
      const id = taskProjection.id || uuidv7();

      const newTaskProjection: TaskProjection = {
        type: "projection",
        id,
        ...taskProjection,
      };

      state.taskProjections.byIds[id] = newTaskProjection;

      return newTaskProjection;
    },
  ),
  createSibling: appAction(
    (
      state: RootState,

      taskProjectionId: string,
      position: "before" | "after",
    ): TaskProjection => {
      const taskProjection = taskProjectionSelectors.byId(
        state,
        taskProjectionId,
      );

      if (!taskProjection) throw new Error("TaskProjection not found");

      return dispatch(
        taskProjectionActions.create({
          taskId: taskProjection.taskId,
          dailyListId: taskProjection.dailyListId,
          orderToken: generateKeyPositionedBetween(
            taskProjection,
            taskProjectionSelectors.siblings(state, taskProjectionId),
            position,
          ),
        }),
      );
    },
  ),
};

export const taskSelectors = {
  canDrop(state: RootState, taskId: string, targetId: string) {
    const model = appSelectors.byId(state, targetId);
    if (!model) return shouldNeverHappen("target not found");

    return isTaskProjection(model) || isTask(model);
  },
  byId: (state: RootState, id: string) => state.tasks.byIds[id],
  byIdOrDefault: (state: RootState, id: string): Task => {
    const task = taskSelectors.byId(state, id);
    if (!task)
      return {
        type: "task",
        id,
        title: "",
        state: "todo",
        projectId: "",
        orderToken: "",
      };

    return task;
  },
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
  update: appAction((state: RootState, id: string, task: Partial<Task>) => {
    const taskInState = taskSelectors.byId(state, id);
    if (!taskInState) throw new Error("Task not found");

    Object.assign(taskInState, task);

    return taskInState;
  }),
  createTask: appAction(
    (
      state: RootState,

      task: Partial<Task> & { projectId: string; orderToken: string },
    ) => {
      const id = task.id || uuidv7();
      const newTask: Task = {
        type: "task",
        id,
        title: "",
        state: "todo",
        ...task,
      };

      state.tasks.byIds[id] = newTask;

      return newTask;
    },
  ),
  createSibling: appAction(
    (
      state: RootState,

      taskId: string,
      position: "before" | "after",
    ): Task => {
      const task = taskSelectors.byId(state, taskId);

      if (!task) throw new Error("Task not found");

      return dispatch(
        taskActions.createTask({
          projectId: task.projectId,
          orderToken: generateKeyPositionedBetween(
            task,
            taskSelectors.siblings(state, taskId),
            position,
          ),
        }),
      );
    },
  ),
  handleDrop: appAction(
    (
      state: RootState,

      taskId: string,
      targetId: string,
      edge: "top" | "bottom",
    ) => {},
  ),
  toggleState: appAction((state: RootState, taskId: string) => {
    const task = taskSelectors.byId(state, taskId);
    if (!task) throw new Error("Task not found");

    task.state = task.state === "todo" ? "done" : "todo";
  }),
};
export const projectsListActions = {
  createProject: appAction(
    (
      state: RootState,

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
  all: memoize((state: RootState): Project[] => {
    return Object.values(state.projects.byIds);
  }),
  childrenIds: memoize((state: RootState): string[] => {
    const allIdsAndTokens = Object.values(state.projects.byIds).map((p) => ({
      id: p.id,
      orderToken: p.orderToken,
    }));

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
  byIdOrDefault: (state: RootState, id: string): Project => {
    const project = projectsSelectors.byId(state, id);
    if (!project)
      return {
        type: "project",
        id,
        title: "",
        icon: "",
        isInbox: false,
        orderToken: "",
      };

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
  create: appAction((state: RootState, project: Project) => {
    state.projects.byIds[project.id] = project;
    return project;
  }),
  delete: appAction((state: RootState, id: string) => {
    delete state.projects.byIds[id];
  }),
  update: appAction(
    (state: RootState, id: string, project: Partial<Project>) => {
      const projInState = projectsSelectors.byId(state, id);
      if (!projInState) throw new Error("Project not found");

      Object.assign(projInState, project);

      return projInState;
    },
  ),
  handleDrop: appAction(
    (
      state: RootState,
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

      return dispatch(
        taskActions.createTask({
          projectId: projectId,
          orderToken: orderToken,
        }),
      );
    },
  ),
};

const handleDropsByType = {
  task: taskActions.handleDrop,
  taskProjection: taskProjectionActions.handleDrop,
  dailyList: dailyListActions.handleDrop,
  project: projectsActions.handleDrop,
};

const canDropsByType = {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  task: taskSelectors.canDrop,
  // eslint-disable-next-line @typescript-eslint/unbound-method
  taskProjection: taskProjectionSelectors.canDrop,
  // eslint-disable-next-line @typescript-eslint/unbound-method
  dailyList: dailyListSelectors.canDrop,
  // eslint-disable-next-line @typescript-eslint/unbound-method
  project: projectsSelectors.canDrop,
};

export const dropSelectors = {
  canDrop: (state: RootState, id: string, targetId: string) => {
    const model = appSelectors.byId(state, id);
    if (!model) return false;

    const canDropFunction =
      canDropsByType[model.type as keyof typeof canDropsByType];
    if (!canDropFunction)
      return shouldNeverHappen("Drop type not found" + model.type);

    return canDropFunction(state, id, targetId);
  },
};

export const dropActions = {
  handleDrop: appAction(
    (
      state: RootState,

      id: string,
      targetId: string,
      edge: "top" | "bottom",
    ) => {
      const model = appSelectors.byId(state, id);
      if (!model) return;

      const dropFunction =
        handleDropsByType[model.type as keyof typeof handleDropsByType];
      if (!dropFunction)
        return shouldNeverHappen("Drop type not found" + model.type);

      return dispatch(dropFunction(id, targetId, edge));
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
