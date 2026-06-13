import { selector, selectFrom, action } from "@will-be-done/hyperdb-lib";
import { dailyDateFormat, generateKeyPositionedBetween } from "./utils";
import { generateJitteredKeyBetween } from "fractional-indexing-jittered";
import { createTask, taskById } from "./cardsTasks";
import { taskTemplateById } from "./cardsTaskTemplates";
import { dailyListAllTaskIds } from "./dailyLists";

import { defaultTask, Task, tasksTable } from "./cardsTasks";

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

export const firstProjectCategoryCard = selector(function* firstProjectCategoryCard(
  projectCategoryId: string,
): Generator<unknown, Card, unknown> {
  const ids = yield* projectCategoryCardIds(projectCategoryId);
  if (ids.length === 0) return defaultTask;

  return yield* projectCategoryCardByIdOrDefault(ids[0]);
});

export const lastProjectCategoryCard = selector(function* lastProjectCategoryCard(
  projectCategoryId: string,
): Generator<unknown, Card, unknown> {
  const ids = yield* projectCategoryCardIds(projectCategoryId);
  if (ids.length === 0) return defaultTask;

  return yield* projectCategoryCardByIdOrDefault(ids[ids.length - 1]);
});

export const projectCategoryCardIdsExceptDailies = selector(function* projectCategoryCardIdsExceptDailies(
  projectCategoryId: string,
  exceptDailyListIds: string[],
): Generator<unknown, string[], unknown> {
  // TODO: use merge sort
  const exceptTaskIds = yield* dailyListAllTaskIds(exceptDailyListIds);
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

export const projectCategoryCards = selector(function* projectCategoryCards(projectCategoryId: string) {
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

export const projectCategoryCardsForDisplay = selector(function* projectCategoryCardsForDisplay(
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

export const projectCategoryCardsForDisplayChildren = selector(function* projectCategoryCardsForDisplayChildren(
  projectCategoryId: string,
) {
  const cards = yield* projectCategoryCards(projectCategoryId);
  return yield* projectCategoryCardsForDisplay(cards, cards);
});

export const projectCategoryCardIdsWithTypes = selector(function* projectCategoryCardIdsWithTypes(
  projectCategoryId: string,
) {
  return (yield* projectCategoryCards(projectCategoryId)).map((card) => ({
    id: card.id,
    type: card.type as "task" | "template",
  }));
});

export const projectCategoryCardIds = selector(function* projectCategoryCardIds(projectCategoryId: string) {
  return (yield* projectCategoryCards(projectCategoryId)).map((card) => card.id);
});

export const doneProjectCategoryCardIds = selector(function* doneProjectCategoryCardIds(projectCategoryId: string) {
  const tasks = yield* selectFrom(tasksTable, "byCategoryIdOrderStates").where((q) =>
      q.eq("projectCategoryId", projectCategoryId).eq("state", "done"),
    );

  return tasks
    .sort((a, b) => b.lastToggledAt - a.lastToggledAt)
    .map((p) => p.id);
});

export const doneProjectCategoryCardsForDisplay = selector(function* doneProjectCategoryCardsForDisplay(
  projectCategoryId: string,
) {
  const tasks = yield* selectFrom(tasksTable, "byCategoryIdOrderStates").where((q) =>
      q.eq("projectCategoryId", projectCategoryId).eq("state", "done"),
    );
  const cards = (tasks as Task[]).sort(
    (a, b) => b.lastToggledAt - a.lastToggledAt,
  );

  return yield* projectCategoryCardsForDisplay(cards, cards);
});

export const doneProjectCategoryCardIdsExceptDailies = selector(function* doneProjectCategoryCardIdsExceptDailies(
  projectCategoryId: string,
  exceptDailyListIds: string[],
): Generator<unknown, string[], unknown> {
  const exceptTaskIds = yield* dailyListAllTaskIds(exceptDailyListIds);

  const taskIds = yield* doneProjectCategoryCardIds(projectCategoryId);

  return taskIds.filter((id) => !exceptTaskIds.has(id));
});

export const projectCategoryCardById = selector(function* projectCategoryCardById(
  id: string,
): Generator<unknown, Card | undefined, unknown> {
  const task = yield* taskById(id);
  if (task) return task;

  const template = yield* taskTemplateById(id);
  if (template) return template;

  return undefined;
});

export const projectCategoryCardByIdOrDefault = selector(function* projectCategoryCardByIdOrDefault(
  id: string,
): Generator<unknown, Card, unknown> {
  return (yield* projectCategoryCardById(id)) || defaultTask;
});

export const projectCategoryCardSiblings = selector(function* projectCategoryCardSiblings(
  cardId: string,
): Generator<unknown, [Card | undefined, Card | undefined], unknown> {
  const card = yield* projectCategoryCardByIdOrDefault(cardId);
  if (!card) return [undefined, undefined];

  const ids = yield* projectCategoryCardIds(card.projectCategoryId);
  const index = ids.findIndex((id) => id === cardId);

  const beforeId = index > 0 ? ids[index - 1] : undefined;
  const afterId = index < ids.length - 1 ? ids[index + 1] : undefined;

  const before = beforeId ? yield* projectCategoryCardByIdOrDefault(beforeId) : undefined;
  const after = afterId ? yield* projectCategoryCardByIdOrDefault(afterId) : undefined;

  return [before, after];
});

export const createSiblingTask = action(function* createSiblingTask(
  cardId: string,
  position: "before" | "after",
  taskParams?: Partial<Task>,
) {
  const card = yield* projectCategoryCardByIdOrDefault(cardId);
  if (!card) throw new Error("Card not found");

  return yield* createTask({
    ...taskParams,
    projectCategoryId: card.projectCategoryId,
    orderToken: generateKeyPositionedBetween(
      card,
      yield* projectCategoryCardSiblings(cardId),
      position,
    ),
  });
});

export const createTaskCardAfter = action(function* createTaskCardAfter(
  cardId: string,
  taskParams?: Partial<Task>,
) {
  const card = yield* projectCategoryCardByIdOrDefault(cardId);
  if (!card) throw new Error("Card not found");

  const [, after] = yield* projectCategoryCardSiblings(cardId);
  const orderToken = generateJitteredKeyBetween(
    card.orderToken,
    after?.orderToken || null,
  );

  return yield* createTask({
    ...taskParams,
    projectCategoryId: card.projectCategoryId,
    orderToken,
  });
});
