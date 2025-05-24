import {createSlice} from "@will-be-done/hyperstate";
import {DailyList, dailyListType, isTask, isTaskProjection, RootState, Task, TaskProjection} from "@/store/models.ts";
import {appSlice} from "@/store/slices/appSlice.ts";
import {shouldNeverHappen} from "@/utils.ts";
import {deepEqual, shallowEqual} from "fast-equals";
import {generateJitteredKeyBetween} from "fractional-indexing-jittered";
import uuidByString from "uuid-by-string";
import {fractionalCompare, generateOrderTokenPositioned, OrderableItem, timeCompare} from "@/store/order.ts";
import {projectionsSlice} from "@/store/slices/projectionsSlice.ts";
import {tasksSlice} from "@/store/slices/tasksSlice.ts";
import {projectsSlice} from "@/store/slices/projectsSlice.ts";
import {format} from "date-fns";
import {appAction, appSelector} from "@/store/selectorAction.ts";

export const getDMY = (date: Date) => {
    return format(date, "yyyy-MM-dd");
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
            (
                query,
                projectId: string,
                exceptDailyListIds: string[],
                taskHorizons: Task["horizon"][],
            ): string[] => {
                const exceptTaskIds = query((state) =>
                    dailyListsSlice.allTaskIds(state, exceptDailyListIds),
                );
                const notDoneTaskIds = query((state) =>
                    projectsSlice.notDoneTaskIds(state, projectId, taskHorizons),
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
                if (!drop) return shouldNeverHappen("drop not found", {dropId});

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