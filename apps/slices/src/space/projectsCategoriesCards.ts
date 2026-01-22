import { runQuery, selector, selectFrom, action } from "@will-be-done/hyperdb";
import { generateKeyPositionedBetween, GenReturn } from "./utils";
import { dailyListsSlice } from "./dailyLists";
import { defaultTask, Task, cardsTasksSlice, tasksTable } from "./cardsTasks";
import {
  TaskTemplate,
  cardsTaskTemplatesSlice,
  taskTemplatesTable,
} from "./cardsTaskTemplates";

export type Card = Task | TaskTemplate;

// TODO: check if all items renamed to card

export const projectCategoryCardsSlice = {
  firstChild: selector(function* (projectCategoryId: string): GenReturn<Card> {
    const ids = yield* projectCategoryCardsSlice.childrenIds(projectCategoryId);
    if (ids.length === 0) return defaultTask;

    return yield* projectCategoryCardsSlice.byIdOrDefault(ids[0]);
  }),
  lastChild: selector(function* (projectCategoryId: string): GenReturn<Card> {
    const ids = yield* projectCategoryCardsSlice.childrenIds(projectCategoryId);
    if (ids.length === 0) return defaultTask;

    return yield* projectCategoryCardsSlice.byIdOrDefault(ids[ids.length - 1]);
  }),

  childrenIdsExceptDailies: selector(function* (
    projectCategoryId: string,
    exceptDailyListIds: string[],
  ): GenReturn<string[]> {
    // TODO: use merge sort
    const exceptTaskIds = yield* dailyListsSlice.allTaskIds(exceptDailyListIds);
    const tasks = yield* runQuery(
      selectFrom(tasksTable, "byCategoryIdOrderStates").where((q) =>
        q.eq("projectCategoryId", projectCategoryId).eq("state", "todo"),
      ),
    );

    const finalTasks = tasks.filter((task) => !exceptTaskIds.has(task.id));

    const templates = yield* runQuery(
      selectFrom(taskTemplatesTable, "byCategoryIdOrderStates").where((q) =>
        q.eq("projectCategoryId", projectCategoryId),
      ),
    );

    const allCards = [...finalTasks, ...templates];

    return allCards
      .sort((a, b) => {
        if (a.orderToken > b.orderToken) {
          return 1;
        }
        if (a.orderToken < b.orderToken) {
          return -1;
        }

        return 0;
      })
      .map((card) => card.id);
  }),
  childrenIds: selector(function* (
    projectCategoryId: string,
  ): GenReturn<string[]> {
    // TODO: use merge sort
    const tasks = yield* runQuery(
      selectFrom(tasksTable, "byCategoryIdOrderStates").where((q) =>
        q.eq("projectCategoryId", projectCategoryId).eq("state", "todo"),
      ),
    );

    const templates = yield* runQuery(
      selectFrom(taskTemplatesTable, "byCategoryIdOrderStates").where((q) =>
        q.eq("projectCategoryId", projectCategoryId),
      ),
    );

    const allCards = [...tasks, ...templates];

    return allCards
      .sort((a, b) => {
        if (a.orderToken > b.orderToken) {
          return 1;
        }
        if (a.orderToken < b.orderToken) {
          return -1;
        }

        return 0;
      })
      .map((card) => card.id);
  }),

  doneChildrenIds: selector(function* (
    projectCategoryId: string,
  ): GenReturn<string[]> {
    const tasks = yield* runQuery(
      selectFrom(tasksTable, "byCategoryIdOrderStates").where((q) =>
        q.eq("projectCategoryId", projectCategoryId).eq("state", "done"),
      ),
    );

    return tasks.map((p) => p.id);
  }),
  doneChildrenIdsExceptDailies: selector(function* (
    projectCategoryId: string,
    exceptDailyListIds: string[],
  ): GenReturn<string[]> {
    const exceptTaskIds = yield* dailyListsSlice.allTaskIds(exceptDailyListIds);

    const taskIds =
      yield* projectCategoryCardsSlice.doneChildrenIds(projectCategoryId);

    return taskIds.filter((id) => !exceptTaskIds.has(id));
  }),
  byId: selector(function* (id: string): GenReturn<Card | undefined> {
    const task = yield* cardsTasksSlice.byId(id);
    if (task) return task;

    const template = yield* cardsTaskTemplatesSlice.byId(id);
    if (template) return template;

    return undefined;
  }),
  byIdOrDefault: selector(function* (id: string): GenReturn<Card> {
    return (yield* projectCategoryCardsSlice.byId(id)) || defaultTask;
  }),

  siblings: selector(function* (
    cardId: string,
  ): GenReturn<[Card | undefined, Card | undefined]> {
    const card = yield* projectCategoryCardsSlice.byIdOrDefault(cardId);
    if (!card) return [undefined, undefined];

    const childrenIds = yield* projectCategoryCardsSlice.childrenIds(
      card.projectCategoryId,
    );
    const index = childrenIds.findIndex((id) => id === cardId);

    const beforeId = index > 0 ? childrenIds[index - 1] : undefined;
    const afterId =
      index < childrenIds.length - 1 ? childrenIds[index + 1] : undefined;

    const before = beforeId
      ? yield* projectCategoryCardsSlice.byIdOrDefault(beforeId)
      : undefined;
    const after = afterId
      ? yield* projectCategoryCardsSlice.byIdOrDefault(afterId)
      : undefined;

    return [before, after];
  }),

  createSiblingTask: action(function* (
    cardId: string,
    position: "before" | "after",
    taskParams?: Partial<Task>,
  ): GenReturn<Task> {
    const card = yield* projectCategoryCardsSlice.byIdOrDefault(cardId);
    if (!card) throw new Error("Card not found");

    return yield* cardsTasksSlice.createTask({
      projectCategoryId: card.projectCategoryId,
      orderToken: generateKeyPositionedBetween(
        card,
        yield* projectCategoryCardsSlice.siblings(cardId),
        position,
      ),
      ...taskParams,
    });
  }),
};
