import { selector, selectFrom, action } from "@will-be-done/hyperdb-lib";
import { dailyDateFormat, generateKeyPositionedBetween } from "./utils";
import { generateJitteredKeyBetween } from "fractional-indexing-jittered";
import { dailyListsSlice } from ".";
import { cardsTasksSlice } from ".";
import { defaultTask, Task, tasksTable } from "./cardsTasks";
import { cardsTaskTemplatesSlice } from ".";
import { TaskTemplate, taskTemplatesTable } from "./cardsTaskTemplates";
import { Project, projectsTable } from "./projects";
import { parse } from "date-fns";
import { ProjectCategory, projectCategoriesTable } from "./projectsCategories";
import { DailyList, dailyListsTable } from "./dailyLists";
import { TaskProjection, taskProjectionsTable } from "./dailyListsProjections";
import { CardWrapper } from "./cards";

export type Card = Task | TaskTemplate;
export type CardForDisplay = {
  card: Card;
  category: ProjectCategory;
  cardWrapper: CardWrapper;
  project: Project;
  dailyList: DailyList | undefined;
  dateOfTask: Date | undefined;
  lastScheduleTime: Date | undefined;
};

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
  const tasks = yield* selectFrom(tasksTable, "byCategoryIdOrderStates").where((q) =>
      q.eq("projectCategoryId", projectCategoryId).eq("state", "todo"),
    );

  const finalTasks = tasks.filter((task) => !exceptTaskIds.has(task.id));

  const templates = yield* selectFrom(taskTemplatesTable, "byCategoryIdOrderStates").where((q) =>
      q.eq("projectCategoryId", projectCategoryId),
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
  const tasks = yield* selectFrom(tasksTable, "byCategoryIdOrderStates").where((q) =>
      q.eq("projectCategoryId", projectCategoryId).eq("state", "todo"),
    );

  const templates = yield* selectFrom(taskTemplatesTable, "byCategoryIdOrderStates").where((q) =>
      q.eq("projectCategoryId", projectCategoryId),
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

export const cardsForDisplay = selector(function* (
  cards: Card[],
  cardWrappers: CardWrapper[],
): Generator<unknown, CardForDisplay[], unknown> {
  const categoryIds = [...new Set(cards.map((card) => card.projectCategoryId))];
  const categories = categoryIds.length
    ? yield* selectFrom(projectCategoriesTable, "byId").where((q) =>
          categoryIds.map((id) => q.eq("id", id)),
        )
    : [];
  const categoryMap = new Map(
    (categories as ProjectCategory[]).map((category) => [
      category.id,
      category,
    ]),
  );

  const projectIds = [
    ...new Set((categories as ProjectCategory[]).map((c) => c.projectId)),
  ];
  const projects = projectIds.length
    ? yield* selectFrom(projectsTable, "byId").where((q) =>
          projectIds.map((id) => q.eq("id", id)),
        )
    : [];
  const projectMap = new Map(
    (projects as Project[]).map((project) => [project.id, project]),
  );

  const cardIds = cards.map((card) => card.id);
  const projections = cardIds.length
    ? yield* selectFrom(taskProjectionsTable, "byId").where((q) =>
          cardIds.map((id) => q.eq("id", id)),
        )
    : [];
  const projectionMap = new Map(
    (projections as TaskProjection[]).map((projection) => [
      projection.id,
      projection,
    ]),
  );

  const dailyListIds = [
    ...new Set(
      (projections as TaskProjection[]).map(
        (projection) => projection.dailyListId,
      ),
    ),
  ];
  const dailyLists = dailyListIds.length
    ? yield* selectFrom(dailyListsTable, "byId").where((q) =>
          dailyListIds.map((id) => q.eq("id", id)),
        )
    : [];
  const dailyListMap = new Map(
    (dailyLists as DailyList[]).map((dailyList) => [dailyList.id, dailyList]),
  );
  const wrapperMap = new Map(
    cardWrappers.map((wrapper) => [`${wrapper.type}:${wrapper.id}`, wrapper]),
  );

  return cards.map((card) => {
    const category = categoryMap.get(card.projectCategoryId);
    if (!category) throw new Error("failed to find project category");

    const project = projectMap.get(category.projectId);
    if (!project) throw new Error("failed to find project");

    const cardWrapper =
      wrapperMap.get(`${card.type}:${card.id}`) ||
      wrapperMap.get(`projection:${card.id}`);
    if (!cardWrapper) throw new Error("failed to find card wrapper");

    const projection = projectionMap.get(card.id);
    const dailyList = projection
      ? dailyListMap.get(projection.dailyListId)
      : undefined;
    const dateOfTask = dailyList
      ? parse(dailyList.date, dailyDateFormat, new Date())
      : undefined;

    return {
      card,
      category,
      project,
      cardWrapper,
      dailyList,
      dateOfTask,
      lastScheduleTime: dateOfTask,
    };
  });
});

export const childrenForDisplay = selector(function* (
  projectCategoryId: string,
) {
  const cards = yield* children(projectCategoryId);
  return yield* cardsForDisplay(cards, cards);
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
  const tasks = yield* selectFrom(tasksTable, "byCategoryIdOrderStates").where((q) =>
      q.eq("projectCategoryId", projectCategoryId).eq("state", "done"),
    );

  return tasks
    .sort((a, b) => b.lastToggledAt - a.lastToggledAt)
    .map((p) => p.id);
});

export const doneChildrenForDisplay = selector(function* (
  projectCategoryId: string,
) {
  const tasks = yield* selectFrom(tasksTable, "byCategoryIdOrderStates").where((q) =>
      q.eq("projectCategoryId", projectCategoryId).eq("state", "done"),
    );
  const cards = (tasks as Task[]).sort(
    (a, b) => b.lastToggledAt - a.lastToggledAt,
  );

  return yield* cardsForDisplay(cards, cards);
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
    ...taskParams,
    projectCategoryId: card.projectCategoryId,
    orderToken: generateKeyPositionedBetween(
      card,
      yield* siblings(cardId),
      position,
    ),
  });
});

export const createTaskCardAfter = action(function* (
  cardId: string,
  taskParams?: Partial<Task>,
) {
  const card = yield* byIdOrDefault(cardId);
  if (!card) throw new Error("Card not found");

  const [, after] = yield* siblings(cardId);
  const orderToken = generateJitteredKeyBetween(
    card.orderToken,
    after?.orderToken || null,
  );

  return yield* cardsTasksSlice.createTask({
    ...taskParams,
    projectCategoryId: card.projectCategoryId,
    orderToken,
  });
});
