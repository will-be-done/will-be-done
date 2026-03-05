import { runQuery, selector, selectFrom, action } from "@will-be-done/hyperdb";
import { generateKeyPositionedBetween } from "./utils";
import { dailyListsSlice } from ".";
import { cardsTasksSlice } from ".";
import { defaultTask, Task, tasksTable } from "./cardsTasks";
import { cardsTaskTemplatesSlice } from ".";
import { TaskTemplate, taskTemplatesTable } from "./cardsTaskTemplates";

export type Card = Task | TaskTemplate;

// TODO: check if all items renamed to card

export const firstChild = selector(function* (
  projectCategoryId: string,
): Generator<unknown, Card, unknown> {
  const ids = yield* childrenIds(projectCategoryId);
  if (ids.length === 0) return defaultTask;

  return yield* byIdOrDefault(ids[0]);
});

export const lastChild = selector(function* (
  projectCategoryId: string,
): Generator<unknown, Card, unknown> {
  const ids = yield* childrenIds(projectCategoryId);
  if (ids.length === 0) return defaultTask;

  return yield* byIdOrDefault(ids[ids.length - 1]);
});

export const childrenIdsExceptDailies = selector(function* (
  projectCategoryId: string,
  exceptDailyListIds: string[],
): Generator<unknown, string[], unknown> {
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
});

export const children = selector(function* (projectCategoryId: string) {
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

  return allCards.sort((a, b) => {
    if (a.orderToken > b.orderToken) {
      return 1;
    }
    if (a.orderToken < b.orderToken) {
      return -1;
    }

    return 0;
  }) as (Task | TaskTemplate)[];
});

export const childrenIdsWithTypes = selector(function* (
  projectCategoryId: string,
) {
  return (yield* children(projectCategoryId)).map((card) => ({
    id: card.id,
    type: card.type as "task" | "template",
  }));
});

export const childrenIds = selector(function* (projectCategoryId: string) {
  return (yield* children(projectCategoryId)).map((card) => card.id);
});

export const doneChildrenIds = selector(function* (projectCategoryId: string) {
  const tasks = yield* runQuery(
    selectFrom(tasksTable, "byCategoryIdOrderStates").where((q) =>
      q.eq("projectCategoryId", projectCategoryId).eq("state", "done"),
    ),
  );

  return tasks
    .sort((a, b) => b.lastToggledAt - a.lastToggledAt)
    .map((p) => p.id);
});

export const doneChildrenIdsExceptDailies = selector(function* (
  projectCategoryId: string,
  exceptDailyListIds: string[],
): Generator<unknown, string[], unknown> {
  const exceptTaskIds = yield* dailyListsSlice.allTaskIds(exceptDailyListIds);

  const taskIds = yield* doneChildrenIds(projectCategoryId);

  return taskIds.filter((id) => !exceptTaskIds.has(id));
});

export const byId = selector(function* (
  id: string,
): Generator<unknown, Card | undefined, unknown> {
  const task = yield* cardsTasksSlice.byId(id);
  if (task) return task;

  const template = yield* cardsTaskTemplatesSlice.byId(id);
  if (template) return template;

  return undefined;
});

export const byIdOrDefault = selector(function* (
  id: string,
): Generator<unknown, Card, unknown> {
  return (yield* byId(id)) || defaultTask;
});

export const siblings = selector(function* (
  cardId: string,
): Generator<unknown, [Card | undefined, Card | undefined], unknown> {
  const card = yield* byIdOrDefault(cardId);
  if (!card) return [undefined, undefined];

  const ids = yield* childrenIds(card.projectCategoryId);
  const index = ids.findIndex((id) => id === cardId);

  const beforeId = index > 0 ? ids[index - 1] : undefined;
  const afterId = index < ids.length - 1 ? ids[index + 1] : undefined;

  const before = beforeId ? yield* byIdOrDefault(beforeId) : undefined;
  const after = afterId ? yield* byIdOrDefault(afterId) : undefined;

  return [before, after];
});

export const createSiblingTask = action(function* (
  cardId: string,
  position: "before" | "after",
  taskParams?: Partial<Task>,
) {
  const card = yield* byIdOrDefault(cardId);
  if (!card) throw new Error("Card not found");

  return yield* cardsTasksSlice.createTask({
    projectCategoryId: card.projectCategoryId,
    orderToken: generateKeyPositionedBetween(
      card,
      yield* siblings(cardId),
      position,
    ),
    ...taskParams,
  });
});
