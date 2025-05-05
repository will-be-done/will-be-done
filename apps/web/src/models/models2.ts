import {
  createActionCreator,
  createSelectorCreator,
  createSlice,
  withoutUndoAction,
} from "@will-be-done/hyperstate";
import { format } from "date-fns";
import { generateJitteredKeyBetween } from "fractional-indexing-jittered";
import { uuidv7 } from "uuidv7";
import uuidByString from "uuid-by-string";
import { shouldNeverHappen } from "@/utils";
import { deepEqual, shallowEqual } from "fast-equals";
import { FocusState } from "@/states/FocusManager";
import { sortBy } from "es-toolkit";

export const inboxId = "01965eb2-7d13-727f-9f50-3d565d0ce2ef";

export const getDMY = (date: Date) => {
  return format(date, "yyyy-MM-dd");
};

export const appSelector = createSelectorCreator<RootState>();
export const appAction = createActionCreator<RootState>();

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

export const timeCompare = <T extends { lastToggledAt: number; id: string }>(
  item1: T,
  item2: T,
): number => {
  if (item1.lastToggledAt === item2.lastToggledAt) {
    return item1.id > item2.id ? 1 : -1;
  }

  return item1.lastToggledAt < item2.lastToggledAt ? 1 : -1;
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

export type SyncableState = {
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
export type RootState = SyncableState & {
  focus: FocusState;
};

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
  lastToggledAt: number;
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

export type AnyModel =
  | Project
  | Task
  | TaskTemplate
  | TaskProjection
  | DailyList;

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

export const appSlice = createSlice(
  {
    resetAndApplyChanges: withoutUndoAction(
      appAction((state: RootState, changes: AppModelChange[]) => {
        for (const t of allTypes) {
          for (const id of Object.keys(state[t].byIds)) {
            delete state[t].byIds[id];
          }
        }

        appSlice.applyChanges(state, changes);
      }),
    ),
    applyChanges: withoutUndoAction(
      appAction((state: RootState, changes: AppModelChange[]) => {
        for (const ch of changes) {
          if (ch.isDeleted) {
            delete state[ch.modelType].byIds[ch.id];
          } else {
            if (isTask(ch.model) && !ch.model.lastToggledAt) {
              ch.model.lastToggledAt = new Date().getTime();
            }

            state[ch.modelType].byIds[ch.id] = ch.model;
          }
        }
      }),
    ),
    // NOTE: some models have extra logic to delete them, so maybe it's better to avoid such way
    // delete: appAction((state: RootState, id: string) => {
    //   const item = appSlice.byId(state, id);
    //   if (!item) return shouldNeverHappen("item not found");
    //
    //   delete state[item.type].byIds[item.id];
    // }),
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
          lastToggledAt: 0,
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
    taskOfModelId(state: RootState, id: string): Task | undefined {
      const model = appSlice.byId(state, id);
      if (!model) return undefined;

      return appSlice.taskOfModel(state, model);
    },

    taskOfModel(state: RootState, model: AnyModel): Task | undefined {
      if (isTask(model)) {
        return model;
      } else if (isTaskProjection(model)) {
        return tasksSlice.byId(state, model.taskId);
      } else {
        return undefined;
      }
    },
  },
  "appSlice",
);

export const taskBoxesSlice = createSlice(
  {
    delete: appAction((state: RootState, id: string) => {
      const taskBox = appSlice.byId(state, id);
      if (!taskBox) return shouldNeverHappen("entity not found");

      if (isTask(taskBox)) {
        return tasksSlice.delete(state, taskBox.id);
      } else if (isTaskProjection(taskBox)) {
        return projectionsSlice.delete(state, taskBox.id);
      } else {
        shouldNeverHappen("unknown taskBox type", { taskBox });
      }
    }),
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
  },
  "taskBoxesSlice",
);

export const dailyListsSlice = createSlice(
  {
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
    canDrop: appSelector(
      (query, dailyListId: string, dropId: string): boolean => {
        const model = query((state) => appSlice.byId(state, dropId));
        if (!model) return shouldNeverHappen("target not found");

        const childrenIds = query((state) =>
          dailyListsSlice.childrenIds(state, dailyListId),
        );

        if (!isTaskProjection(model) && !isTask(model)) {
          return false;
        }

        if (isTask(model) && model.state === "done") {
          return true;
        }

        if (isTaskProjection(model)) {
          const task = query((state) => tasksSlice.byId(state, model.taskId));
          if (!task) return shouldNeverHappen("task not found");

          if (task.state === "done") {
            return true;
          }
        }

        return childrenIds.length === 0;
      },
    ),

    childrenIds: appSelector((query, dailyListId: string): string[] => {
      const byIds = query((state) => state.projection.byIds);
      const tasksByIds = query((state) => state.task.byIds);

      const projections = Object.values(byIds).filter(
        (proj) => proj.dailyListId === dailyListId,
      );

      const todoProjections: TaskProjection[] = [];
      for (const proj of projections) {
        const task = tasksByIds[proj.taskId];

        if (task?.state === "todo") {
          todoProjections.push(proj);
        }
      }

      return todoProjections.sort(fractionalCompare).map((proj) => proj.id);
    }, shallowEqual),
    doneChildrenIds: appSelector((query, dailyListId: string): string[] => {
      const byIds = query((state) => state.projection.byIds);
      const tasksByIds = query((state) => state.task.byIds);

      const projections = Object.values(byIds).filter(
        (proj) => proj.dailyListId === dailyListId,
      );

      const todoProjections: {
        id: string;
        lastToggledAt: number;
      }[] = [];
      for (const proj of projections) {
        const task = tasksByIds[proj.taskId];

        if (task?.state === "done") {
          todoProjections.push({
            id: proj.id,
            lastToggledAt: task.lastToggledAt,
          });
        }
      }

      return todoProjections.sort(timeCompare).map((proj) => proj.id);
    }, shallowEqual),
    taskIds: appSelector((query, dailyListId: string): string[] => {
      const childrenIds = query((state) =>
        dailyListsSlice.childrenIds(state, dailyListId),
      );

      return query((state) =>
        childrenIds
          .map((id) => projectionsSlice.byId(state, id))
          .map((proj) => proj?.taskId)
          .filter((t) => t !== undefined),
      );
    }, shallowEqual),
    notDoneTaskIdsExceptDailies: appSelector(
      (query, projectId: string, dailyListIds: string[]): string[] => {
        const exceptTaskIds = query((state) =>
          dailyListsSlice.allTaskIds(state, dailyListIds),
        );
        const notDoneTaskIds = query((state) =>
          projectsSlice.notDoneTaskIds(state, projectId),
        );

        return notDoneTaskIds.filter((id) => !exceptTaskIds.has(id));
      },
      shallowEqual,
    ),
    allTaskIds: appSelector((query, dailyListIds: string[]): Set<string> => {
      const taskIds = query((state) =>
        dailyListIds.flatMap((id) => dailyListsSlice.taskIds(state, id)),
      );

      return new Set(taskIds);
    }, shallowEqual),
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
    dateIdsMap: appSelector((query): Record<string, string> => {
      const byIds = query((state) => state.dailyList.byIds);

      return Object.fromEntries(
        Object.values(byIds).map((d) => [d.date, d.id]),
      );
    }, deepEqual),
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
        dropId: string,
        _edge: "top" | "bottom",
      ) => {
        const firstChild = dailyListsSlice.firstChild(state, dailyListId);
        const between: [string | null, string | null] = [
          null,
          firstChild?.orderToken || null,
        ];

        const orderToken = generateJitteredKeyBetween(
          between[0] || null,
          between[1] || null,
        );

        const dailyList = dailyListsSlice.byId(state, dailyListId);
        if (!dailyList) return shouldNeverHappen("dailyList not found");

        const drop = appSlice.byId(state, dropId);
        if (!drop) return shouldNeverHappen("drop not found", { dropId });

        if (isTaskProjection(drop)) {
          drop.orderToken = orderToken;
          drop.dailyListId = dailyList.id;
        } else if (isTask(drop)) {
          projectionsSlice.create(state, {
            taskId: drop.id,
            dailyListId: dailyList.id,
            orderToken: orderToken,
          });
        } else {
          shouldNeverHappen("unknown drop item type", drop);
        }
      },
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
        const task = projectsSlice.createTask(
          state,
          projectId,
          projectPosition,
        );

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
  },
  "dailyListsSlice",
);
// export const dailyListSlice = {};

export const projectionsSlice = createSlice(
  {
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
    canDrop(state: RootState, taskProjectionId: string, dropId: string) {
      const model = appSlice.byId(state, dropId);
      if (!model) return shouldNeverHappen("target not found");

      const projection = projectionsSlice.byId(state, taskProjectionId);
      if (!projection) return shouldNeverHappen("projection not found");

      const projectionTask = tasksSlice.byId(state, projection.taskId);
      if (!projectionTask) return shouldNeverHappen("task not found");

      if (projectionTask.state === "done") {
        return false;
      }

      if (isTaskProjection(model)) {
        const modelTask = tasksSlice.byId(state, model.taskId);
        if (!modelTask) return shouldNeverHappen("task not found");

        if (modelTask.state === "done") {
          return false;
        }
      }

      return isTaskProjection(model) || isTask(model);
    },
    siblings: appSelector(
      (
        query,
        taskProjectionId: string,
      ): [TaskProjection | undefined, TaskProjection | undefined] => {
        const item = query((state) =>
          projectionsSlice.byId(state, taskProjectionId),
        );
        if (!item)
          return shouldNeverHappen("item not found", { taskProjectionId });

        const items = query((state) =>
          dailyListsSlice.childrenIds(state, item.dailyListId),
        );
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

    projectionIdsByTaskId: appSelector((query, taskId: string): string[] => {
      const byIds = query((state) => state.projection.byIds);

      return Object.values(byIds)
        .filter((proj) => proj.taskId === taskId)
        .map((p) => p.id);
    }, shallowEqual),

    // --actions
    delete: appAction((state: RootState, id: string) => {
      const proj = projectionsSlice.byId(state, id);
      if (!proj) return shouldNeverHappen("projection not found");

      delete state.projection.byIds[proj.id];
    }),
    deleteProjectionsOfTask: appAction((state: RootState, taskId: string) => {
      const projectionIds = projectionsSlice.projectionIdsByTaskId(
        state,
        taskId,
      );

      for (const id of projectionIds) {
        projectionsSlice.delete(state, id);
      }
    }),
    handleDrop: appAction(
      (
        state: RootState,
        taskProjectionId: string,
        dropId: string,
        edge: "top" | "bottom",
      ) => {
        if (!projectionsSlice.canDrop(state, taskProjectionId, dropId)) {
          return;
        }

        const taskProjection = projectionsSlice.byId(state, taskProjectionId);
        if (!taskProjection) return shouldNeverHappen("task not found");

        const dropItem = appSlice.byId(state, dropId);
        if (!dropItem) return shouldNeverHappen("drop item not found");

        const [up, down] = projectionsSlice.siblings(state, taskProjectionId);

        let between: [string | undefined, string | undefined] = [
          taskProjection.orderToken,
          down?.orderToken,
        ];

        if (edge == "top") {
          between = [up?.orderToken, taskProjection.orderToken];
        }

        const orderToken = generateJitteredKeyBetween(
          between[0] || null,
          between[1] || null,
        );

        if (isTaskProjection(dropItem)) {
          dropItem.orderToken = orderToken;
          dropItem.dailyListId = taskProjection.dailyListId;
        } else if (isTask(dropItem)) {
          projectionsSlice.create(state, {
            taskId: dropItem.id,
            dailyListId: taskProjection.dailyListId,
            orderToken: orderToken,
          });
        } else {
          shouldNeverHappen("unknown drop item type", dropItem);
        }
      },
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
        const newTask = tasksSlice.createSibling(
          state,
          taskProjection.taskId,
          position,
        );

        return projectionsSlice.create(state, {
          taskId: newTask.id,
          dailyListId: taskProjection.dailyListId,
          orderToken: generateKeyPositionedBetween(
            taskProjection,
            projectionsSlice.siblings(state, taskProjectionId),
            position,
          ),
        });
      },
    ),
  },
  "projectionsSlice",
);

export const tasksSlice = createSlice(
  {
    canDrop(state: RootState, taskId: string, dropId: string) {
      const model = appSlice.byId(state, dropId);
      if (!model) return shouldNeverHappen("target not found");

      const task = tasksSlice.byId(state, taskId);
      if (!task) return shouldNeverHappen("task not found");

      if (task.state === "done") {
        return false;
      }

      if (isTask(model) && model.state === "done") {
        return false;
      }

      return isTaskProjection(model) || isTask(model);
    },
    byId: (state: RootState, id: string): Task | undefined =>
      state.task.byIds[id],
    byIdOrDefault: appSelector((query, id: string): Task => {
      const task = query((state) => tasksSlice.byId(state, id));
      if (!task)
        return {
          type: taskType,
          id,
          title: "",
          state: "todo",
          projectId: "",
          orderToken: "",
          lastToggledAt: 0,
        };

      return task;
    }),
    siblings: appSelector(
      (
        query,
        taskId: string,
      ): [ProjectItem | undefined, ProjectItem | undefined] => {
        const task = query((state) => tasksSlice.byId(state, taskId));
        if (!task) return shouldNeverHappen("task not found", { taskId });

        const items = query((state) =>
          projectsSlice.childrenIds(state, task.projectId),
        );
        const i = items.findIndex((it: string) => it === taskId);
        const beforeId = items[i - 1];
        const afterId = items[i + 1];

        return [
          beforeId
            ? query((state) => tasksSlice.byId(state, beforeId))
            : undefined,
          afterId
            ? query((state) => tasksSlice.byId(state, afterId))
            : undefined,
        ];
      },
    ),

    // --actions

    delete: appAction((state: RootState, id: string) => {
      const task = tasksSlice.byId(state, id);
      if (!task) return shouldNeverHappen("task not found");

      delete state.task.byIds[task.id];

      projectionsSlice.deleteProjectionsOfTask(state, task.id);
    }),
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
          lastToggledAt: Date.now(),
          ...task,
        };

        state.task.byIds[id] = newTask;

        return newTask;
      },
    ),
    createSibling: appAction(
      (
        state: RootState,
        taskId: string,
        position: "before" | "after",
      ): Task => {
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
        dropId: string,
        edge: "top" | "bottom",
      ) => {
        if (!tasksSlice.canDrop(state, taskId, dropId)) return;

        const task = tasksSlice.byId(state, taskId);
        if (!task) return shouldNeverHappen("task not found");

        const dropItem = appSlice.byId(state, dropId);
        if (!dropItem) return shouldNeverHappen("drop item not found");

        const [up, down] = tasksSlice.siblings(state, taskId);

        let between: [string | undefined, string | undefined] = [
          task.orderToken,
          down?.orderToken,
        ];

        if (edge == "top") {
          between = [up?.orderToken, task.orderToken];
        }

        const orderToken = generateJitteredKeyBetween(
          between[0] || null,
          between[1] || null,
        );

        if (isTask(dropItem) || isTaskTemplate(dropItem)) {
          dropItem.orderToken = orderToken;
          dropItem.projectId = task.projectId;
        } else if (isTaskProjection(dropItem)) {
          const taskOfDrop = tasksSlice.byId(state, dropItem.taskId);
          if (!taskOfDrop) return shouldNeverHappen("task not found", dropItem);

          taskOfDrop.orderToken = orderToken;
          taskOfDrop.projectId = task.projectId;

          projectionsSlice.delete(state, dropItem.id);
        } else {
          shouldNeverHappen("unknown drop item type", dropItem);
        }
      },
    ),
    toggleState: appAction((state: RootState, taskId: string) => {
      const task = tasksSlice.byId(state, taskId);
      if (!task) throw new Error("Task not found");

      task.state = task.state === "todo" ? "done" : "todo";
      task.lastToggledAt = Date.now();
    }),
  },
  "tasksSlice",
);

export const allProjectsSlice = createSlice(
  {
    all: appSelector((query): Project[] => {
      const byIds = query((state) => state.project.byIds);

      return Object.values(byIds);
    }, shallowEqual),
    allSorted: appSelector((query): Project[] => {
      const all = query((state) => allProjectsSlice.all(state));

      return all.sort(fractionalCompare);
    }, shallowEqual),
    childrenIds: appSelector((query): string[] => {
      const all = query((state) => allProjectsSlice.all(state));

      const allIdsAndTokens = all.map((p) => ({
        id: p.id,
        orderToken: p.orderToken,
      }));
      return allIdsAndTokens.sort(fractionalCompare).map((p) => p.id);
    }, shallowEqual),
    childrenIdsWithoutInbox: appSelector((query): string[] => {
      const childrenIds = query((state) => allProjectsSlice.childrenIds(state));

      return childrenIds.filter((id) => id !== inboxId);
    }, shallowEqual),
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
  },
  "allProjectsSlice",
);

export const projectsSlice = createSlice(
  {
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
    canDrop(state: RootState, projectId: string, dropTargetId: string) {
      const target = appSlice.byId(state, dropTargetId);

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
      (
        query,
        projectId: string,
      ): [Project | undefined, Project | undefined] => {
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
      const tasksByIds = query((state) => state.task.byIds);
      const tasks = Object.values(tasksByIds).filter(
        (task) => task.projectId === projectId,
      );

      const todoTasks = tasks.filter((t) => t.state === "todo");

      const templatesByIds = query((state) => state.template.byIds);
      const templates = Object.values(templatesByIds).filter(
        (template) => template.projectId === projectId,
      );

      return [...todoTasks, ...templates]
        .sort(fractionalCompare)
        .map((p) => p.id);
    }, shallowEqual),
    doneChildrenIds: appSelector((query, projectId: string): string[] => {
      const tasksByIds = query((state) => state.task.byIds);
      const tasks = Object.values(tasksByIds).filter(
        (task) => task.projectId === projectId,
      );

      const doneTasks = tasks.filter((t) => t.state === "done");
      const sortedDoneTasks = doneTasks.sort(timeCompare);

      return sortedDoneTasks.map((p) => p.id);
    }, shallowEqual),
    childrenCount: appSelector((query, projectId: string): number => {
      return query(
        (state) => projectsSlice.childrenIds(state, projectId).length,
      );
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
      return query((state) =>
        childrenIds
          .map((id) => tasksSlice.byId(state, id))
          .map((t) => t?.id)
          .filter((t) => t !== undefined),
      );
    }, shallowEqual),
    notDoneTaskIds: appSelector((query, projectId: string): string[] => {
      const taskIds = query((state) =>
        projectsSlice.tasksIds(state, projectId),
      );
      const byIds = query((state) => state.task.byIds);

      return taskIds.filter((id) => {
        const task = byIds[id];
        if (!task) return false;

        return task.state !== "done";
      });
    }, shallowEqual),
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
        dropItemId: string,
        edge: "top" | "bottom",
      ) => {
        if (!projectsSlice.canDrop(state, projectId, dropItemId)) {
          return;
        }

        const project = projectsSlice.byId(state, projectId);
        if (!project) throw new Error("Project not found");
        const dropItem = appSlice.byId(state, dropItemId);
        if (!dropItem) throw new Error("Target not found");

        if (isProject(dropItem)) {
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

          dropItem.orderToken = orderToken;
        } else if (isTask(dropItem) || isTaskTemplate(dropItem)) {
          dropItem.projectId = project.id;
        } else if (isTaskProjection(dropItem)) {
          const task = tasksSlice.byId(state, dropItem.taskId);
          if (!task) return shouldNeverHappen("task not found", dropItem);

          task.projectId = project.id;
        } else {
          shouldNeverHappen("unknown drop item type", dropItem);
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
  },
  "projectsSlice",
);

const handleDropsByType = {
  [taskType]: tasksSlice.handleDrop,
  [projectionType]: projectionsSlice.handleDrop,
  [dailyListType]: dailyListsSlice.handleDrop,
  [projectType]: projectsSlice.handleDrop,
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

export const dropSlice = createSlice(
  {
    canDrop: (state: RootState, id: string, targetId: string) => {
      const model = appSlice.byId(state, id);
      if (!model) return false;

      const canDropFunction =
        canDropsByType[model.type as keyof typeof canDropsByType];
      if (!canDropFunction)
        return shouldNeverHappen("Drop type not found" + model.type);

      return canDropFunction(state, id, targetId);
    },
    handleDrop: appAction(
      (
        state: RootState,
        id: string,
        dropId: string,
        edge: "top" | "bottom",
      ) => {
        const model = appSlice.byId(state, id);
        if (!model) return;

        const dropFunction =
          handleDropsByType[model.type as keyof typeof handleDropsByType];
        if (!dropFunction)
          return shouldNeverHappen("Drop type not found" + model.type);

        return dropFunction(state, id, dropId, edge);
      },
    ),
  },
  "dropSlice",
);
