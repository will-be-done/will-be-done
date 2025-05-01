import {
  createActionCreator,
  createSelectorCreator,
} from "@will-be-done/hyperstate";
import { format } from "date-fns";
import { generateJitteredKeyBetween } from "fractional-indexing-jittered";
import { uuidv7 } from "uuidv7";
import uuidByString from "uuid-by-string";
import { shouldNeverHappen } from "@/utils";
import { deepEqual, shallowEqual } from "fast-equals";

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

export const projectType = "project";
export const taskType = "task";
export const taskTemplateType = "template";
export const projectionType = "projection";
export const dailyListType = "dailyList";
export const allTypes = [
  projectType,
  taskType,
  taskTemplateType,
  projectionType,
  dailyListType,
] as const;

export type RootState = {
  [projectType]: {
    byIds: Record<string, Project>;
  };
  [taskType]: {
    byIds: Record<string, Task>;
  };
  [taskTemplateType]: {
    byIds: Record<string, TaskTemplate>;
  };
  [projectionType]: {
    byIds: Record<string, TaskProjection>;
  };
  [dailyListType]: {
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
  type: typeof projectType;
  id: string;
  title: string;
  icon: string;
  isInbox: boolean;
  orderToken: string;
};

type ProjectItem = Task | TaskTemplate;

export type TaskState = "todo" | "done";
export type Task = {
  type: typeof taskType;
  id: string;
  title: string;
  state: TaskState;
  projectId: string;
  orderToken: string;
};

export type TaskTemplate = {
  type: typeof taskTemplateType;
  id: string;
  projectId: string;
  orderToken: string;
};

export type TaskProjection = {
  type: typeof projectionType;
  id: string;
  taskId: string;
  orderToken: string;
  dailyListId: string;
};

export type TaskBox = Task | TaskProjection;

export type DailyList = {
  type: typeof dailyListType;
  id: string;
  date: string;
};

type AnyModel = Project | Task | TaskTemplate | TaskProjection | DailyList;

type ModelType<T> = T extends { type: infer U } ? U : never;
type ModelTypeUnion = ModelType<AnyModel>;
export type ModelsMap = {
  [K in ModelTypeUnion]: Extract<AnyModel, { type: K }>;
};

function assertUnreachable(x: never): never {
  throw new Error("Didn't expect to get here");
}

export const isProject = isObjectType<Project>(projectType);
export const isTask = isObjectType<Task>(taskType);
export const isTaskTemplate = isObjectType<TaskTemplate>(taskTemplateType);
export const isTaskProjection = isObjectType<TaskProjection>(projectionType);
export const isDailyList = isObjectType<DailyList>(dailyListType);

export function getSiblingIds(
  items: string[],
  itemId: string,
): [string | undefined, string | undefined] {
  const i = items.findIndex((it) => it === itemId);

  return [items[i - 1], items[i + 1]] as const;
}

export type AppModelChange = {
  id: string;
  modelType: ModelTypeUnion;
  isDeleted: boolean;
  model: AnyModel;
};

export const appSlice = {
  resetAndApplyChanges: appAction(
    (state: RootState, changes: AppModelChange[]) => {
      for (const t of allTypes) {
        for (const id of Object.keys(state[t].byIds)) {
          delete state[t].byIds[id];
        }
      }

      appSlice.applyChanges(state, changes);
    },
  ),
  applyChanges: appAction((state: RootState, changes: AppModelChange[]) => {
    console.log("applyChanges", changes);

    for (const ch of changes) {
      if (ch.isDeleted) {
        delete state[ch.modelType].byIds[ch.id];
      } else {
        state[ch.modelType].byIds[ch.id] = ch.model;
      }
    }
  }),
  taskBoxById(state: RootState, id: string) {
    const storages = [state.task, state.projection];
    for (const storage of storages) {
      const entity = storage.byIds[id];

      if (entity) {
        return entity;
      }
    }

    return undefined;
  },
  taskBoxByIdOrDefault(state: RootState, id: string): Task | TaskProjection {
    const entity = appSlice.taskBoxById(state, id);
    if (!entity)
      return {
        type: taskType,
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
      state.project,
      state.task,
      state.template,
      state.projection,
      state.dailyList,
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
    const entity = appSlice.byId(state, id);
    if (!entity) {
      const project: Project = {
        type: projectType,
        id,
        title: "",
        icon: "",
        isInbox: false,
        orderToken: "",
      };

      return project;
    }

    return entity;
  },
};

export const taskBoxesSlice = {
  create: appAction((state: RootState, taskBox: TaskBox) => {
    if (isTask(taskBox)) {
      return tasksSlice.createTask(state, taskBox);
    } else if (isTaskProjection(taskBox)) {
      return projectionsSlice.create(state, taskBox);
    } else {
      assertUnreachable(taskBox);
    }
  }),
  createSibling: appAction(
    (state: RootState, taskBox: TaskBox, position: "before" | "after") => {
      if (isTask(taskBox)) {
        return tasksSlice.createSibling(state, taskBox.id, position);
      } else if (isTaskProjection(taskBox)) {
        return projectionsSlice.createSibling(state, taskBox.id, position);
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
        return tasksSlice.handleDrop(state, taskBox.id, targetId, edge);
      } else if (isTaskProjection(taskBox)) {
        return projectionsSlice.handleDrop(state, taskBox.id, targetId, edge);
      } else {
        assertUnreachable(taskBox);
      }
    },
  ),
};

export const dailyListsSlice = {
  byId: (state: RootState, id: string) => state.dailyList.byIds[id],
  byIdOrDefault: (state: RootState, id: string): DailyList => {
    const dailyList = dailyListsSlice.byId(state, id);
    if (!dailyList)
      return {
        type: dailyListType,
        id,
        date: "",
      };

    return dailyList;
  },
  canDrop(state: RootState, dailyListId: string, targetId: string) {
    const model = appSlice.byId(state, targetId);
    if (!model) return shouldNeverHappen("target not found");

    return isTaskProjection(model) || isTask(model);
  },
  childrenIds: appSelector((query, dailyListId: string): string[] => {
    return query(
      (state) =>
        Object.values(state.projection.byIds)
          .filter((proj) => proj.dailyListId === dailyListId)
          .sort(fractionalCompare)
          .map((proj) => proj.id),
      shallowEqual,
    );
  }),
  taskIds: appSelector((query, dailyListId: string): string[] => {
    const childrenIds = query((state) =>
      dailyListsSlice.childrenIds(state, dailyListId),
    );

    return query(
      (state) =>
        childrenIds
          .map((id) => projectionsSlice.byId(state, id))
          .map((proj) => proj?.taskId)
          .filter((t) => t !== undefined),
      shallowEqual,
    );
  }),
  notDoneTaskIdsExceptDailies: appSelector(
    (query, projectId: string, dailyListIds: string[]): string[] => {
      const exceptTaskIds = query(
        (state) => dailyListsSlice.allTaskIds(state, dailyListIds),
        shallowEqual,
      );
      const notDoneTaskIds = query((state) =>
        projectsSlice.notDoneTaskIds(state, projectId),
      );

      return notDoneTaskIds.filter((id) => !exceptTaskIds.has(id));
    },
    shallowEqual,
  ),
  allTaskIds: appSelector((query, dailyListIds: string[]): Set<string> => {
    return query((state) => {
      return new Set(
        dailyListIds.flatMap((id) => dailyListsSlice.taskIds(state, id)),
      );
    }, shallowEqual);
  }),
  firstChild: appSelector(
    (query, dailyListId: string): TaskProjection | undefined => {
      const childrenIds = query((state) =>
        dailyListsSlice.childrenIds(state, dailyListId),
      );
      const firstChildId = childrenIds[0];
      if (!firstChildId) return undefined;

      return query((state) => projectionsSlice.byId(state, firstChildId));
    },
  ),
  lastChild: appSelector(
    (query, dailyListId: string): TaskProjection | undefined => {
      const childrenIds = query((state) =>
        dailyListsSlice.childrenIds(state, dailyListId),
      );
      const lastChildId = childrenIds[childrenIds.length - 1];
      if (!lastChildId) return undefined;

      return query((state) => projectionsSlice.byId(state, lastChildId));
    },
  ),
  firstDoneChild: appSelector(
    (query, dailyListId: string): TaskProjection | undefined => {
      return query((state) => {
        const childrenIds = dailyListsSlice.childrenIds(state, dailyListId);
        const projections = childrenIds
          .map((id) => projectionsSlice.byId(state, id))
          .filter((p) => p !== undefined);

        const tasksWithProjections = projections.map(
          (proj) => [proj, tasksSlice.byId(state, proj.taskId)] as const,
        );

        return tasksWithProjections.find(
          ([proj, task]) => task?.state === "done",
        )?.[0];
      });
    },
  ),
  dateIdsMap: appSelector((query): Record<string, string> => {
    return query(
      (state) =>
        Object.fromEntries(
          Object.values(state.dailyList.byIds).map((d) => [d.date, d.id]),
        ),
      deepEqual,
    );
  }),
  idByDate: appSelector((query, date: Date): string | undefined => {
    const allDailyLists = query((state) => dailyListsSlice.dateIdsMap(state));
    const dmy = getDMY(date);

    return allDailyLists[dmy];
  }),
  idsByDates: appSelector((query, dates: Date[]): string[] => {
    const allDailyLists = query((state) => dailyListsSlice.dateIdsMap(state));

    return dates
      .map((date) => {
        const dmy = getDMY(date);
        return allDailyLists[dmy];
      })
      .filter((d) => d != undefined);
  }),

  // ----

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
      dailyListId: string,
      projectId: string,
      listPosition:
        | [OrderableItem | undefined, OrderableItem | undefined]
        | "append"
        | "prepend",
      projectPosition:
        | [OrderableItem | undefined, OrderableItem | undefined]
        | "append"
        | "prepend",
    ) => {
      const task = projectsSlice.createTask(state, projectId, projectPosition);

      const orderToken = generateOrderTokenPositioned(
        state,
        dailyListId,
        dailyListsSlice,
        listPosition,
      );

      return projectionsSlice.create(state, {
        taskId: task.id,
        dailyListId: dailyListId,
        orderToken: orderToken,
      });
    },
  ),
  create: appAction(
    (
      state: RootState,
      dailyList: {
        date: string;
      },
    ): DailyList => {
      const id = uuidByString(dailyList.date);

      const list: DailyList = {
        type: dailyListType,
        id,
        ...dailyList,
      };
      state.dailyList.byIds[id] = list;

      return list;
    },
  ),
  createIfNotPresent: appAction((state: RootState, date: Date): DailyList => {
    const dailyListId = dailyListsSlice.idByDate(state, date);

    if (!dailyListId) {
      const newList = dailyListsSlice.create(state, {
        date: getDMY(date),
      });

      return newList;
    } else {
      return dailyListsSlice.byId(state, dailyListId)!;
    }
  }),
  createManyIfNotPresent: appAction(
    (state: RootState, dates: Date[]): DailyList[] => {
      // TODO: make it spawns a lot of Map in dailyListSelectors.idByDate
      return dates.map((date) =>
        dailyListsSlice.createIfNotPresent(state, date),
      );
    },
  ),
};
// export const dailyListSlice = {};

export const projectionsSlice = {
  byId: (state: RootState, id: string) => state.projection.byIds[id],
  byIdOrDefault: (state: RootState, id: string): TaskProjection => {
    const proj = projectionsSlice.byId(state, id);
    if (!proj)
      return {
        type: projectionType,
        id,
        taskId: "",
        orderToken: "",
        dailyListId: "",
      };

    return proj;
  },
  canDrop(state: RootState, taskProjectionId: string, targetId: string) {
    const model = appSlice.byId(state, targetId);
    if (!model) return shouldNeverHappen("target not found");

    return isTaskProjection(model) || isTask(model);
  },
  siblings: appSelector(
    (
      query,
      taskProjectionId: string,
    ): [TaskProjection | undefined, TaskProjection | undefined] => {
      const items = query((state) => allProjectsSlice.childrenIds(state));
      const i = items.findIndex((it: string) => it === taskProjectionId);

      const beforeId = items[i - 1];
      const afterId = items[i + 1];

      return [
        beforeId
          ? query((state) => projectionsSlice.byId(state, beforeId))
          : undefined,
        afterId
          ? query((state) => projectionsSlice.byId(state, afterId))
          : undefined,
      ];
    },
  ),

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
        type: projectionType,
        id,
        ...taskProjection,
      };

      state.projection.byIds[id] = newTaskProjection;

      return newTaskProjection;
    },
  ),
  createSibling: appAction(
    (
      state: RootState,
      taskProjectionId: string,
      position: "before" | "after",
    ): TaskProjection => {
      const taskProjection = projectionsSlice.byId(state, taskProjectionId);

      if (!taskProjection) throw new Error("TaskProjection not found");

      return projectionsSlice.create(state, {
        taskId: taskProjection.taskId,
        dailyListId: taskProjection.dailyListId,
        orderToken: generateKeyPositionedBetween(
          taskProjection,
          projectionsSlice.siblings(state, taskProjectionId),
          position,
        ),
      });
    },
  ),
};

export const tasksSlice = {
  canDrop(state: RootState, taskId: string, targetId: string) {
    const model = appSlice.byId(state, targetId);
    if (!model) return shouldNeverHappen("target not found");

    return isTaskProjection(model) || isTask(model);
  },
  byId: (state: RootState, id: string): Task | undefined =>
    state.task.byIds[id],
  byIdOrDefault: (state: RootState, id: string): Task => {
    const task = tasksSlice.byId(state, id);
    if (!task)
      return {
        type: taskType,
        id,
        title: "",
        state: "todo",
        projectId: "",
        orderToken: "",
      };

    return task;
  },
  siblings: appSelector(
    (
      query,
      taskId: string,
    ): [ProjectItem | undefined, ProjectItem | undefined] => {
      const items = query((state) => allProjectsSlice.childrenIds(state));
      const i = items.findIndex((it: string) => it === taskId);
      const beforeId = items[i - 1];
      const afterId = items[i + 1];

      return [
        beforeId
          ? query((state) => tasksSlice.byId(state, beforeId))
          : undefined,
        afterId ? query((state) => tasksSlice.byId(state, afterId)) : undefined,
      ];
    },
  ),

  // --actions

  update: appAction(
    (state: RootState, id: string, task: Partial<Task>): Task => {
      const taskInState = tasksSlice.byId(state, id);
      if (!taskInState) throw new Error("Task not found");

      Object.assign(taskInState, task);

      return taskInState;
    },
  ),

  createTask: appAction(
    (
      state: RootState,
      task: Partial<Task> & { projectId: string; orderToken: string },
    ) => {
      const id = task.id || uuidv7();
      const newTask: Task = {
        type: taskType,
        id,
        title: "",
        state: "todo",
        ...task,
      };

      state.task.byIds[id] = newTask;

      return newTask;
    },
  ),
  createSibling: appAction(
    (state: RootState, taskId: string, position: "before" | "after"): Task => {
      const task = tasksSlice.byId(state, taskId);

      if (!task) throw new Error("Task not found");

      return tasksSlice.createTask(state, {
        projectId: task.projectId,
        orderToken: generateKeyPositionedBetween(
          task,
          tasksSlice.siblings(state, taskId),
          position,
        ),
      });
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
    const task = tasksSlice.byId(state, taskId);
    if (!task) throw new Error("Task not found");

    task.state = task.state === "todo" ? "done" : "todo";
  }),
};

export const allProjectsSlice = {
  all: appSelector((query): Project[] => {
    return query(
      (state) => Object.values(state.project.byIds).sort(fractionalCompare),
      shallowEqual,
    );
  }),
  childrenIds: appSelector((query): string[] => {
    return query((state) => {
      const allIdsAndTokens = allProjectsSlice.all(state).map((p) => ({
        id: p.id,
        orderToken: p.orderToken,
      }));

      return allIdsAndTokens.sort(fractionalCompare).map((p) => p.id);
    }, shallowEqual);
  }),
  childrenIdsWithoutInbox: appSelector((query): string[] => {
    return query(
      (state) =>
        allProjectsSlice.childrenIds(state).filter((id) => id !== inboxId),
      shallowEqual,
    );
  }),
  firstChild: appSelector((query): Project | undefined => {
    const childrenIds = query((state) => allProjectsSlice.childrenIds(state));
    const firstChildId = childrenIds[0];

    return firstChildId
      ? query((state) => projectsSlice.byId(state, firstChildId))
      : undefined;
  }),
  lastChild: appSelector((query): Project | undefined => {
    return query((state) => {
      const childrenIds = allProjectsSlice.childrenIds(state);
      const lastChildId = childrenIds[childrenIds.length - 1];

      return lastChildId ? projectsSlice.byId(state, lastChildId) : undefined;
    });
  }),
  inbox: appSelector((query): Project => {
    return query((state) => {
      const inbox = projectsSlice.byId(state, inboxId);
      if (!inbox) throw new Error("Inbox not found");
      return inbox;
    });
  }),
};

export const projectsSlice = {
  byId: (state: RootState, id: string): Project | undefined =>
    state.project.byIds[id],
  byIdOrDefault: (state: RootState, id: string): Project => {
    const project = projectsSlice.byId(state, id);
    if (!project)
      return {
        type: projectType,
        id,
        title: "",
        icon: "",
        isInbox: false,
        orderToken: "",
      };

    return project;
  },
  canDrop(state: RootState, projectId: string, targetId: string) {
    const target = appSlice.byId(state, targetId);

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
  siblings: appSelector(
    (query, projectId: string): [Project | undefined, Project | undefined] => {
      const items = query((state) => allProjectsSlice.childrenIds(state));
      const i = items.findIndex((it: string) => it === projectId);

      const beforeId = items[i - 1];
      const afterId = items[i + 1];

      return [
        beforeId
          ? query((state) => projectsSlice.byId(state, beforeId))
          : undefined,
        afterId
          ? query((state) => projectsSlice.byId(state, afterId))
          : undefined,
      ];
    },
  ),
  childrenIds: appSelector((query, projectId: string): string[] => {
    const tasks = query(
      (state) =>
        Object.values(state.task.byIds)
          .filter((task) => task.projectId === projectId)
          .map((p) => ({ id: p.id, orderToken: p.orderToken })),
      deepEqual,
    );
    const templates = query(
      (state) =>
        Object.values(state.template.byIds)
          .filter((template) => template.projectId === projectId)
          .map((p) => ({ id: p.id, orderToken: p.orderToken })),
      deepEqual,
    );

    return [...tasks, ...templates].sort(fractionalCompare).map((p) => p.id);
  }),
  childrenCount: appSelector((query, projectId: string): number => {
    return query((state) => projectsSlice.childrenIds(state, projectId).length);
  }),
  firstChild: appSelector(
    (query, projectId: string): ProjectItem | undefined => {
      const childrenIds = query((state) =>
        projectsSlice.childrenIds(state, projectId),
      );
      const firstChildId = childrenIds[0];
      if (!firstChildId) return undefined;

      return query((state) => projectsSlice.getItemById(state, firstChildId));
    },
  ),
  lastChild: appSelector(
    (query, projectId: string): ProjectItem | undefined => {
      const childrenIds = query((state) =>
        projectsSlice.childrenIds(state, projectId),
      );
      const lastChildId = childrenIds[childrenIds.length - 1];
      if (!lastChildId) return undefined;

      return query((state) => projectsSlice.getItemById(state, lastChildId));
    },
  ),
  tasksIds: appSelector((query, projectId: string): string[] => {
    const childrenIds = query((state) =>
      projectsSlice.childrenIds(state, projectId),
    );
    return query(
      (state) =>
        childrenIds
          .map((id) => tasksSlice.byId(state, id))
          .map((t) => t?.id)
          .filter((t) => t !== undefined),
      shallowEqual,
    );
  }),
  notDoneTaskIds: appSelector((query, projectId: string): string[] => {
    return query((state) => {
      const taskIds = projectsSlice.tasksIds(state, projectId);
      return taskIds.filter((id) => {
        const task = query((state) => tasksSlice.byId(state, id));
        if (!task) return false;

        return task.state !== "done";
      });
    }, shallowEqual);
  }),
  withoutTasksByIds: appSelector(
    (query, projectId: string, ids: string[]): string[] => {
      const childrenIds = query((state) =>
        projectsSlice.childrenIds(state, projectId),
      );
      const setIds = new Set(ids);
      return childrenIds.filter((id) => !setIds.has(id));
    },
  ),
  getItemById: appSelector((query, id: string): ProjectItem | undefined => {
    return query((state) => tasksSlice.byId(state, id));
  }),

  // --actions

  create: appAction(
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
        allProjectsSlice,
        position,
      );

      const id = newProject.id || uuidv7();
      const project: Project = {
        type: projectType,
        id: id,
        orderToken: orderToken,
        title: "New project",
        icon: "",
        isInbox: false,
        ...newProject,
      };

      state.project.byIds[id] = project;
    },
  ),
  delete: appAction((state: RootState, id: string) => {
    delete state.project.byIds[id];
  }),
  update: appAction(
    (state: RootState, id: string, project: Partial<Project>): Project => {
      const projInState = projectsSlice.byId(state, id);
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
      if (!projectsSlice.canDrop(state, projectId, targetId)) {
        return;
      }

      const project = projectsSlice.byId(state, projectId);
      if (!project) throw new Error("Project not found");
      const target = projectsSlice.byId(state, targetId);
      if (!target) throw new Error("Target not found");

      if (isProject(target)) {
        const [up, down] = projectsSlice.siblings(state, project.id);

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
    ): Task => {
      const project = projectsSlice.byId(state, projectId);
      if (!project) throw new Error("Project not found");

      const orderToken = generateOrderTokenPositioned(
        state,
        projectId,
        projectsSlice,
        position,
      );

      return tasksSlice.createTask(state, {
        projectId: projectId,
        orderToken: orderToken,
      });
    },
  ),
};

const handleDropsByType = {
  task: tasksSlice.handleDrop,
  taskProjection: projectionsSlice.handleDrop,
  dailyList: dailyListsSlice.handleDrop,
  project: projectsSlice.handleDrop,
};

const canDropsByType = {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  [taskType]: tasksSlice.canDrop,
  // eslint-disable-next-line @typescript-eslint/unbound-method
  [projectionType]: projectionsSlice.canDrop,
  // eslint-disable-next-line @typescript-eslint/unbound-method
  [dailyListType]: dailyListsSlice.canDrop,
  // eslint-disable-next-line @typescript-eslint/unbound-method
  [projectType]: projectsSlice.canDrop,
};

export const dropSelectors = {
  canDrop: (state: RootState, id: string, targetId: string) => {
    const model = appSlice.byId(state, id);
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
      const model = appSlice.byId(state, id);
      if (!model) return;

      const dropFunction =
        handleDropsByType[model.type as keyof typeof handleDropsByType];
      if (!dropFunction)
        return shouldNeverHappen("Drop type not found" + model.type);

      return dropFunction(state, id, targetId, edge);
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
