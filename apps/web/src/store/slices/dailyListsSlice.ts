import { createSlice } from "@will-be-done/hyperstate";
import { appSlice } from "@/store/slices/appSlice.ts";
import { shouldNeverHappen } from "@/utils.ts";
import { deepEqual, shallowEqual } from "fast-equals";
import { generateJitteredKeyBetween } from "fractional-indexing-jittered";
import uuidByString from "uuid-by-string";
import {
  fractionalCompare,
  generateOrderTokenPositioned,
  OrderableItem,
  timeCompare,
} from "@/store/order.ts";
import {
  isTaskProjection,
  projectionsSlice,
  TaskProjection,
} from "@/store/slices/projectionsSlice.ts";
import { isTask, Task, tasksSlice } from "@/store/slices/tasksSlice.ts";
import { projectsSlice } from "@/store/slices/projectsSlice.ts";
import { format } from "date-fns";
import { appAction, appQuerySelector } from "@/store/z.selectorAction.ts";
import { isObjectType } from "@/store/z.utils.ts";
import { RootState } from "@/store/store.ts";
import { SyncMapping } from "../sync/mapping.ts";
import { projectItemsSlice } from "./projectItemsSlice.ts";

export const getDMY = (date: Date) => {
  return format(date, "yyyy-MM-dd");
};
export const dailyListType = "dailyList";
const isDailyList = isObjectType<DailyList>(dailyListType);

export type DailyList = {
  type: typeof dailyListType;
  id: string;
  date: string;
};
export type DailyListData = {
  id: string;
  date: string;
};
export const dailyListsTable = "daily_lists";
export const dailyListSyncMap: SyncMapping<
  typeof dailyListsTable,
  typeof dailyListType
> = {
  table: dailyListsTable,
  modelType: dailyListType,
  mapDataToModel(data) {
    return {
      type: dailyListType,
      id: data.id,
      date: data.date,
    };
  },
  mapModelToData(entity) {
    return {
      id: entity.id,
      date: entity.date,
    };
  },
};

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
    canDrop: appQuerySelector(
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

    childrenIds: appQuerySelector(
      (
        query,
        dailyListId: string,
        includeOnlyProjectIds: string[] = [],
      ): string[] => {
        const byIds = query((state) => state.projection.byIds);
        const tasksByIds = query((state) => state.task.byIds);

        const projections = Object.values(byIds).filter(
          (proj) => proj.dailyListId === dailyListId,
        );

        const todoProjections: TaskProjection[] = [];
        for (const proj of projections) {
          const task = tasksByIds[proj.taskId];

          if (
            task?.state === "todo" &&
            (includeOnlyProjectIds.length > 0
              ? includeOnlyProjectIds.includes(task.projectId)
              : true)
          ) {
            todoProjections.push(proj);
          }
        }

        return todoProjections.sort(fractionalCompare).map((proj) => proj.id);
      },
      shallowEqual,
    ),
    doneChildrenIds: appQuerySelector(
      (
        query,
        dailyListId: string,
        includeOnlyProjectIds: string[] = [],
      ): string[] => {
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

          if (
            task?.state === "done" &&
            (includeOnlyProjectIds.length > 0
              ? includeOnlyProjectIds.includes(task.projectId)
              : true)
          ) {
            todoProjections.push({
              id: proj.id,
              lastToggledAt: task.lastToggledAt,
            });
          }
        }

        return todoProjections.sort(timeCompare).map((proj) => proj.id);
      },
      shallowEqual,
    ),
    taskIds: appQuerySelector((query, dailyListId: string): string[] => {
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
    notDoneTaskIdsExceptDailies: appQuerySelector(
      (
        query,
        projectId: string,
        exceptDailyListIds: string[],
        taskHorizons: Task["horizon"][],
        alwaysIncludeTaskIds: string[] = [],
      ): string[] => {
        const exceptTaskIds = query((state) =>
          dailyListsSlice.allTaskIds(state, exceptDailyListIds),
        );
        const notDoneTaskIds = query((state) =>
          projectItemsSlice.notDoneTaskIds(
            state,
            projectId,
            taskHorizons,
            alwaysIncludeTaskIds,
          ),
        );

        return notDoneTaskIds.filter((id) => !exceptTaskIds.has(id));
      },
      shallowEqual,
    ),
    allTaskIds: appQuerySelector(
      (query, dailyListIds: string[]): Set<string> => {
        const taskIds = query((state) =>
          dailyListIds.flatMap((id) => dailyListsSlice.taskIds(state, id)),
        );

        return new Set(taskIds);
      },
      shallowEqual,
    ),
    firstChild: appQuerySelector(
      (query, dailyListId: string): TaskProjection | undefined => {
        const childrenIds = query((state) =>
          dailyListsSlice.childrenIds(state, dailyListId),
        );
        const firstChildId = childrenIds[0];
        if (!firstChildId) return undefined;

        return query((state) => projectionsSlice.byId(state, firstChildId));
      },
    ),
    lastChild: appQuerySelector(
      (query, dailyListId: string): TaskProjection | undefined => {
        const childrenIds = query((state) =>
          dailyListsSlice.childrenIds(state, dailyListId),
        );
        const lastChildId = childrenIds[childrenIds.length - 1];
        if (!lastChildId) return undefined;

        return query((state) => projectionsSlice.byId(state, lastChildId));
      },
    ),
    dateIdsMap: appQuerySelector((query): Record<string, string> => {
      const byIds = query((state) => state.dailyList.byIds);

      return Object.fromEntries(
        Object.values(byIds).map((d) => [d.date, d.id]),
      );
    }, deepEqual),
    idByDate: appQuerySelector((query, date: Date): string | undefined => {
      const allDailyLists = query((state) => dailyListsSlice.dateIdsMap(state));
      const dmy = getDMY(date);

      return allDailyLists[dmy];
    }),
    idsByDates: appQuerySelector((query, dates: Date[]): string[] => {
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
        const task = projectItemsSlice.createTask(
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
