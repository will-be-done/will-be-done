import { selectFrom, v } from "@will-be-done/hyperdb";
import { action, selector } from "../builders";
import { dailyDateFormat, generateKeyPositionedBetween } from "./utils";
import { generateJitteredKeyBetween } from "fractional-indexing-jittered";
import { createTask, taskById, defaultTask } from "./cardsTasks";
import { taskTemplateById } from "./cardsTaskTemplates";
import { parse } from "date-fns";
import {
  tasksTable,
  taskTemplatesTable,
  taskProjectionsTable,
  projectSectionsTable,
  projectsTable,
  dailyListsTable,
  checklistItemsTable,
  cardWrapper,
  stashProjectionType,
  type CardWrapper,
  type Task,
  type TaskTemplate,
  type Project,
  type ProjectSection,
  type DailyList,
  type TaskProjection,
  Card,
} from "./tables";

export type CardForDisplay = {
  card: Card;
  section: ProjectSection;
  cardWrapper: CardWrapper;
  project: Project;
  dailyList: DailyList | undefined;
  dateOfTask: Date | undefined;
  lastScheduleTime: Date | undefined;
  hasChecklist: boolean;
};

// TODO: check if all items renamed to card

export const firstProjectSectionCard = selector({
  name: "firstProjectSectionCard",
  args: { projectSectionId: v.string() },
  handler: function* firstProjectSectionCard({
    projectSectionId,
  }): Generator<unknown, Card, unknown> {
    const ids = yield* projectSectionCardIds({ projectSectionId });
    if (ids.length === 0) return defaultTask;

    return yield* projectSectionCardByIdOrDefault({ id: ids[0] });
  },
});

export const lastProjectSectionCard = selector({
  name: "lastProjectSectionCard",
  args: { projectSectionId: v.string() },
  handler: function* lastProjectSectionCard({
    projectSectionId,
  }): Generator<unknown, Card, unknown> {
    const ids = yield* projectSectionCardIds({ projectSectionId });
    if (ids.length === 0) return defaultTask;

    return yield* projectSectionCardByIdOrDefault({ id: ids[ids.length - 1] });
  },
});

export const projectSectionCards = selector({
  name: "projectSectionCards",
  args: { projectSectionId: v.string() },
  memoization: { selfChild: true },
  handler: function* ({ projectSectionId }) {
    // TODO: make separate table that will maintain list
    // of all cards in a project section
    // or you merge sort
    const tasks = yield* selectFrom(
      tasksTable,
      "byProjectSectionIdOrderStates",
    ).where((q) =>
      q.eq("projectSectionId", projectSectionId).eq("state", "todo"),
    );

    const templates = yield* selectFrom(
      taskTemplatesTable,
      "byProjectSectionIdOrderStates",
    ).where((q) => q.eq("projectSectionId", projectSectionId));

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
  },
});

export const projectSectionCardsForDisplay = selector({
  name: "projectSectionCardsForDisplay",
  args: {
    cards: v.array(v.union(tasksTable.v(), taskTemplatesTable.v())),
    cardWrappers: v.array(cardWrapper),
  },
  handler: function* projectSectionCardsForDisplay({
    cards,
    cardWrappers,
  }): Generator<unknown, CardForDisplay[], unknown> {
    const projectSectionIds = [
      ...new Set(cards.map((card) => card.projectSectionId)),
    ];
    const sections = projectSectionIds.length
      ? yield* selectFrom(projectSectionsTable, "byId").where((q) =>
          projectSectionIds.map((id) => q.eq("id", id)),
        )
      : [];
    const sectionMap = new Map(
      (sections as ProjectSection[]).map((section) => [section.id, section]),
    );

    const projectIds = [
      ...new Set((sections as ProjectSection[]).map((c) => c.projectId)),
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

    const checklistItems = cards.length
      ? yield* selectFrom(checklistItemsTable, "byParentOrder").where((q) =>
          cards.map((card) =>
            q.eq("parentType", card.type).eq("parentId", card.id),
          ),
        )
      : [];
    const hasChecklistMap = new Map(
      checklistItems.map((item) => [
        `${item.parentId}:${item.parentType}`,
        true,
      ]),
    );

    return cards
      .map((card) => {
        const section = sectionMap.get(card.projectSectionId);
        if (!section) return;

        const project = projectMap.get(section.projectId);
        if (!project) return;

        const cardWrapper =
          wrapperMap.get(`${card.type}:${card.id}`) ||
          wrapperMap.get(`projection:${card.id}`) ||
          wrapperMap.get(`${stashProjectionType}:${card.id}`);
        if (!cardWrapper) return;

        const projection = projectionMap.get(card.id);
        const dailyList = projection
          ? dailyListMap.get(projection.dailyListId)
          : undefined;
        const dateOfTask = dailyList
          ? parse(dailyList.date, dailyDateFormat, new Date())
          : undefined;

        return {
          card,
          section,
          project,
          cardWrapper,
          dailyList,
          dateOfTask,
          lastScheduleTime: dateOfTask,
          hasChecklist: hasChecklistMap.get(`${card.id}:${card.type}`) ?? false,
        };
      })
      .filter((card) => !!card);
  },
});

export const projectSectionCardsForDisplayChildren = selector({
  name: "projectSectionCardsForDisplayChildren",
  args: { projectSectionId: v.string() },
  handler: function* projectSectionCardsForDisplayChildren({
    projectSectionId,
  }) {
    const cards = yield* projectSectionCards({ projectSectionId });
    return yield* projectSectionCardsForDisplay({
      cards,
      cardWrappers: cards,
    });
  },
});

export const projectSectionCardIds = selector({
  name: "projectSectionCardIds",
  args: { projectSectionId: v.string() },
  handler: function* projectSectionCardIds({ projectSectionId }) {
    return (yield* projectSectionCards({ projectSectionId })).map(
      (card) => card.id,
    );
  },
});

export const doneProjectSectionCardsForDisplay = selector({
  name: "doneProjectSectionCardsForDisplay",
  args: { projectSectionId: v.string(), limited: v.boolean() },
  handler: function* doneProjectSectionCardsForDisplay({
    projectSectionId,
    limited,
  }) {
    const tasks = yield* selectFrom(
      tasksTable,
      "byProjectSectionIdStatesToggledAt",
    )
      .where((q) =>
        q.eq("projectSectionId", projectSectionId).eq("state", "done"),
      )
      // fetch one more, so UI will show "Show more" button and limit to show only 5 cards
      .limit(limited ? 6 : 9999)
      .order("desc");

    return yield* projectSectionCardsForDisplay({
      cards: tasks,
      cardWrappers: tasks,
    });
  },
});

export const projectSectionCardById = selector({
  name: "projectSectionCardById",
  args: { id: v.string() },
  handler: function* projectSectionCardById({
    id,
  }): Generator<unknown, Card | undefined, unknown> {
    const task = yield* taskById({ id });
    if (task) return task;

    const template = yield* taskTemplateById({ id });
    if (template) return template;

    return undefined;
  },
});

export const projectSectionCardByIdOrDefault = selector({
  name: "projectSectionCardByIdOrDefault",
  args: { id: v.string() },
  handler: function* projectSectionCardByIdOrDefault({
    id,
  }): Generator<unknown, Card, unknown> {
    return (yield* projectSectionCardById({ id })) || defaultTask;
  },
});

export const projectSectionCardSiblings = selector({
  name: "projectSectionCardSiblings",
  args: { cardId: v.string() },
  handler: function* projectSectionCardSiblings({
    cardId,
  }): Generator<unknown, [Card | undefined, Card | undefined], unknown> {
    const card = yield* projectSectionCardByIdOrDefault({ id: cardId });
    if (!card) return [undefined, undefined];

    const ids = yield* projectSectionCardIds({
      projectSectionId: card.projectSectionId,
    });
    const index = ids.findIndex((id) => id === cardId);

    const beforeId = index > 0 ? ids[index - 1] : undefined;
    const afterId = index < ids.length - 1 ? ids[index + 1] : undefined;

    const before = beforeId
      ? yield* projectSectionCardByIdOrDefault({ id: beforeId })
      : undefined;
    const after = afterId
      ? yield* projectSectionCardByIdOrDefault({ id: afterId })
      : undefined;

    return [before, after];
  },
});

export const createSiblingTask = action({
  name: "createSiblingTask",
  args: {
    cardId: v.string(),
    position: v.union(v.literal("before"), v.literal("after")),
    taskParams: v.optional(v.partial(tasksTable.v())),
  },
  handler: function* createSiblingTask({ cardId, position, taskParams }) {
    const card = yield* projectSectionCardById({ id: cardId });
    if (!card) throw new Error("Card not found");

    return yield* createTask({
      task: {
        ...taskParams,
        projectSectionId: card.projectSectionId,
        orderToken: generateKeyPositionedBetween(
          card,
          yield* projectSectionCardSiblings({ cardId }),
          position,
        ),
      },
    });
  },
});

export const createTaskCardAfter = action({
  name: "createTaskCardAfter",
  args: {
    cardId: v.string(),
    taskParams: v.optional(v.partial(tasksTable.v())),
  },
  handler: function* createTaskCardAfter({ cardId, taskParams }) {
    const card = yield* projectSectionCardById({ id: cardId });
    if (!card) throw new Error("Card not found");

    const [, after] = yield* projectSectionCardSiblings({ cardId });
    const orderToken = generateJitteredKeyBetween(
      card.orderToken,
      after?.orderToken || null,
    );

    return yield* createTask({
      task: {
        ...taskParams,
        projectSectionId: card.projectSectionId,
        orderToken,
      },
    });
  },
});
