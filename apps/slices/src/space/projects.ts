import { isObjectType } from "../utils";
import { shouldNeverHappen } from "../utils";
import {
  action,
  deleteRows,
  insert,
  runQuery,
  selectFrom,
  selector,
  table,
  update,
} from "@will-be-done/hyperdb";
import { generateJitteredKeyBetween } from "fractional-indexing-jittered";
import { uuidv7 } from "uuidv7";
import type { OrderableItem } from "./utils";
import { generateOrderTokenPositioned } from "./utils";
import { appSlice } from ".";
import { projectsAllSlice } from ".";
import { cardsTasksSlice } from ".";
import { isTask, Task } from "./cardsTasks";
import { cardsTaskTemplatesSlice } from ".";
import { isTaskTemplate } from "./cardsTaskTemplates";
import { registerSpaceSyncableTable } from "./syncMap";
import { registerModelSlice, AnyModelType } from "./maps";
import { projectCategoriesSlice } from ".";
import { projectCategoryCardsSlice } from ".";
import { dailyListsSlice } from ".";
import { dailyListsProjectionsSlice } from ".";
import { stashProjectionsSlice } from ".";
import { isTaskProjection } from "./dailyListsProjections";
import { genUUIDV5 } from "../traits";
import { startOfDay } from "date-fns";

export const projectType = "project";
export type Project = {
  type: typeof projectType;
  id: string;
  title: string;
  icon: string;
  isInbox: boolean;
  orderToken: string;
  createdAt: number;
};

export const isProject = isObjectType<Project>(projectType);

export const defaultProject: Project = {
  type: projectType,
  id: "default-project-id",
  title: "default project",
  icon: "",
  isInbox: false,
  orderToken: "",
  createdAt: 0,
};

// Table definition
export const projectsTable = table<Project>("projects").withIndexes({
  byId: { cols: ["id"], type: "hash" },
  byIds: { cols: ["id"], type: "btree" },
  byOrderToken: { cols: ["orderToken"], type: "btree" },
  byIsInbox: { cols: ["isInbox"], type: "hash" },
});
registerSpaceSyncableTable(projectsTable, projectType);

// Selectors and actions
export const allIds = selector(function* () {
  const projects = yield* runQuery(
    selectFrom(projectsTable, "byOrderToken").where((q) => q),
  );

  return projects.map((p) => p.id);
});

export const byId = selector(function* (id: string) {
  const projects = yield* runQuery(
    selectFrom(projectsTable, "byId")
      .where((q) => q.eq("id", id))
      .limit(1),
  );
  return projects[0] as Project | undefined;
});

export const byIdOrDefault = selector(function* (id: string) {
  return (yield* byId(id)) || defaultProject;
});

export const canDrop = selector(function* (
  projectId: string,
  dropItemId: string,
  dropModelType: AnyModelType,
): Generator<unknown, boolean, unknown> {
  const project = yield* byId(projectId);
  if (!project) return false;

  const dropItem = yield* appSlice.byId(dropItemId, dropModelType);
  if (!dropItem) return false;

  // Projects can accept tasks, templates, projections, and other projects
  if (isProject(dropItem) || isTask(dropItem) || isTaskTemplate(dropItem)) {
    return true;
  }

  if (isTaskProjection(dropItem)) {
    const task = yield* cardsTasksSlice.byId(dropItem.id);
    return task !== undefined && task.state === "todo";
  }

  return false;
});

export const inboxProjectId = selector(function* () {
  return yield* genUUIDV5(projectType, "inbox");
});

export const overdueTasksCountExceptDailiesCount = selector(function* (
  projectId: string,
  exceptDailyListIds: string[],
  currentDate: Date,
): Generator<unknown, number, unknown> {
  currentDate = startOfDay(currentDate);

  const categories = yield* projectCategoriesSlice.byProjectId(projectId);

  const taskIds = yield* dailyListsSlice.allTaskIds(exceptDailyListIds);
  const exceptCardIds: Set<string> = new Set(taskIds);
  const exceptDailyListSet = new Set(exceptDailyListIds);

  // First pass: collect all unique dailyListIds that we need to check
  const dailyListIdsToFetch = new Set<string>();
  for (const category of categories) {
    const childrenIds = yield* projectCategoryCardsSlice.childrenIds(
      category.id,
    );

    for (const taskId of childrenIds) {
      if (exceptCardIds.has(taskId)) continue;

      const projection = yield* dailyListsProjectionsSlice.byTaskId(taskId);
      if (!projection) continue;
      if (exceptDailyListSet.has(projection.dailyListId)) continue;

      dailyListIdsToFetch.add(projection.dailyListId);
    }
  }

  // Batch fetch all daily lists at once
  const dailyLists = yield* dailyListsSlice.byIds(
    Array.from(dailyListIdsToFetch),
  );
  const dailyListMap = new Map(dailyLists.map((dl) => [dl.id, dl]));

  // Second pass: count overdue tasks
  let overdueCount = 0;
  for (const category of categories) {
    const childrenIds = yield* projectCategoryCardsSlice.childrenIds(
      category.id,
    );

    for (const taskId of childrenIds) {
      if (exceptCardIds.has(taskId)) continue;

      const projection = yield* dailyListsProjectionsSlice.byTaskId(taskId);
      if (!projection) continue;
      if (exceptDailyListSet.has(projection.dailyListId)) continue;

      const dailyList = dailyListMap.get(projection.dailyListId);
      if (!dailyList) continue;

      // Parse the date and check if it's before currentDate
      const listDate = new Date(dailyList.date);
      if (listDate < currentDate) {
        overdueCount++;
      }
    }
  }

  return overdueCount;
});

export const notDoneTasksCountExceptDailiesCount = selector(function* (
  projectId: string,
  exceptDailyListIds: string[],
): Generator<unknown, number, unknown> {
  const categories = yield* projectCategoriesSlice.byProjectId(projectId);

  const taskIds = yield* dailyListsSlice.allTaskIds(exceptDailyListIds);
  const exceptCardIds: Set<string> = new Set(taskIds);

  const finalChildrenIds: string[] = [];
  for (const category of categories) {
    const childrenIds = yield* projectCategoryCardsSlice.childrenIds(
      category.id,
    );

    finalChildrenIds.push(...childrenIds);
  }

  return finalChildrenIds.filter((id) => !exceptCardIds.has(id)).length;
});

export const overdueTasksCountExceptDailiesAndStashCount = selector(function* (
  projectId: string,
  exceptDailyListIds: string[],
  currentDate: Date,
): Generator<unknown, number, unknown> {
  currentDate = startOfDay(currentDate);

  const categories = yield* projectCategoriesSlice.byProjectId(projectId);

  const taskIds = yield* dailyListsSlice.allTaskIds(exceptDailyListIds);
  const stashTaskIds = yield* stashProjectionsSlice.allTaskIds();
  const exceptCardIds: Set<string> = new Set([...taskIds, ...stashTaskIds]);
  const exceptDailyListSet = new Set(exceptDailyListIds);

  const dailyListIdsToFetch = new Set<string>();
  for (const category of categories) {
    const childrenIds = yield* projectCategoryCardsSlice.childrenIds(
      category.id,
    );

    for (const taskId of childrenIds) {
      if (exceptCardIds.has(taskId)) continue;

      const projection = yield* dailyListsProjectionsSlice.byTaskId(taskId);
      if (!projection) continue;
      if (exceptDailyListSet.has(projection.dailyListId)) continue;

      dailyListIdsToFetch.add(projection.dailyListId);
    }
  }

  const dailyLists = yield* dailyListsSlice.byIds(
    Array.from(dailyListIdsToFetch),
  );
  const dailyListMap = new Map(dailyLists.map((dl) => [dl.id, dl]));

  let overdueCount = 0;
  for (const category of categories) {
    const childrenIds = yield* projectCategoryCardsSlice.childrenIds(
      category.id,
    );

    for (const taskId of childrenIds) {
      if (exceptCardIds.has(taskId)) continue;

      const projection = yield* dailyListsProjectionsSlice.byTaskId(taskId);
      if (!projection) continue;
      if (exceptDailyListSet.has(projection.dailyListId)) continue;

      const dailyList = dailyListMap.get(projection.dailyListId);
      if (!dailyList) continue;

      const listDate = new Date(dailyList.date);
      if (listDate < currentDate) {
        overdueCount++;
      }
    }
  }

  return overdueCount;
});

export const notDoneTasksCountExceptDailiesAndStashCount = selector(function* (
  projectId: string,
  exceptDailyListIds: string[],
): Generator<unknown, number, unknown> {
  const categories = yield* projectCategoriesSlice.byProjectId(projectId);

  const taskIds = yield* dailyListsSlice.allTaskIds(exceptDailyListIds);
  const stashTaskIds = yield* stashProjectionsSlice.allTaskIds();
  const exceptCardIds: Set<string> = new Set([...taskIds, ...stashTaskIds]);

  const finalChildrenIds: string[] = [];
  for (const category of categories) {
    const childrenIds = yield* projectCategoryCardsSlice.childrenIds(
      category.id,
    );

    finalChildrenIds.push(...childrenIds);
  }

  return finalChildrenIds.filter((id) => !exceptCardIds.has(id)).length;
});

export const create = action(function* (
  project: Partial<Project>,
  position:
    | [OrderableItem | undefined, OrderableItem | undefined]
    | "append"
    | "prepend",
): Generator<unknown, Project, unknown> {
  const orderToken = yield* generateOrderTokenPositioned(
    "all-projects-list",
    projectsAllSlice,
    position,
  );

  const id = project.id || uuidv7();
  const newProject: Project = {
    type: projectType,
    id,
    title: "New project",
    icon: "",
    isInbox: false,
    createdAt: Date.now(),
    orderToken: orderToken,
    ...project,
  };

  const isInbox = newProject.isInbox;

  yield* insert(projectsTable, [newProject]);
  if (isInbox) {
    yield* projectCategoriesSlice.createCategory(
      {
        projectId: newProject.id,
        title: "Inbox",
        id: yield* projectCategoriesSlice.inboxCategoryId(),
      },
      "append",
    );
  } else {
    yield* projectCategoriesSlice.createCategory(
      { projectId: newProject.id, title: "Week" },
      "append",
    );
    yield* projectCategoriesSlice.createCategory(
      { projectId: newProject.id, title: "Month" },
      "append",
    );
    yield* projectCategoriesSlice.createCategory(
      { projectId: newProject.id, title: "Ideas" },
      "append",
    );
  }

  return newProject;
});

export const createInboxIfNotExists = action(function* (): Generator<
  unknown,
  Project,
  unknown
> {
  const inbox = yield* byId(yield* inboxProjectId());
  if (inbox) {
    return inbox;
  }

  return yield* create(
    {
      id: yield* inboxProjectId(),
      title: "Inbox",
      icon: "",
      isInbox: true,
      orderToken: generateJitteredKeyBetween(null, null),
      createdAt: new Date().getTime(),
    },
    [undefined, undefined],
  );
});

export const updateProject = action(function* (
  id: string,
  project: Partial<Project>,
): Generator<unknown, void, unknown> {
  const projectInState = yield* byId(id);
  if (!projectInState) throw new Error("Project not found");

  yield* update(projectsTable, [{ ...projectInState, ...project }]);
});

export const deleteProjects = action(function* (
  ids: string[],
): Generator<unknown, void, unknown> {
  const projectCategories = yield* projectCategoriesSlice.byProjectIds(ids);

  yield* projectCategoriesSlice.deleteCategories(
    projectCategories.map((c) => c.id),
  );
  yield* deleteRows(projectsTable, ids);
});

export const handleDrop = action(function* (
  projectId: string,
  dropItemId: string,
  dropModelType: AnyModelType,
  edge: "top" | "bottom",
): Generator<unknown, void, unknown> {
  const canDropResult = yield* canDrop(projectId, dropItemId, dropModelType);
  if (!canDropResult) return;

  const project = yield* byId(projectId);
  if (!project) throw new Error("Project not found");

  const dropItem = yield* appSlice.byId(dropItemId, dropModelType);
  if (!dropItem) throw new Error("Target not found");

  if (isProject(dropItem)) {
    // Reorder projects - would need proper fractional indexing
    const [up, down] = yield* projectsAllSlice.siblings(project.id);

    let orderToken: string;
    if (edge === "top") {
      orderToken = generateJitteredKeyBetween(
        up?.orderToken || null,
        project.orderToken,
      );
    } else {
      orderToken = generateJitteredKeyBetween(
        project.orderToken,
        down?.orderToken || null,
      );
    }

    yield* updateProject(dropItem.id, { orderToken });
  } else if (
    isTask(dropItem) ||
    isTaskTemplate(dropItem) ||
    isTaskProjection(dropItem)
  ) {
    const category = yield* projectCategoriesSlice.firstChild(project.id);
    if (!category) throw new Error("No categories found in project");

    // Move task/template to this project
    if (isTask(dropItem)) {
      yield* cardsTasksSlice.updateTask(dropItem.id, {
        projectCategoryId: category.id,
      });
    } else if (isTaskTemplate(dropItem)) {
      yield* cardsTaskTemplatesSlice.updateTemplate(dropItem.id, {
        projectCategoryId: category.id,
      });
    } else if (isTaskProjection(dropItem)) {
      // When dropping a projection onto a project, move the underlying task
      const task = yield* cardsTasksSlice.byId(dropItem.id);
      if (task) {
        yield* cardsTasksSlice.updateTask(task.id, {
          projectCategoryId: category.id,
        });
        // Keep the projection in the daily list
      }
    }
  } else {
    shouldNeverHappen("unknown drop item type", dropItem);
  }
});

export const createTask = action(function* (
  projectId: string,
  position:
    | [OrderableItem | undefined, OrderableItem | undefined]
    | "append"
    | "prepend",
  taskAttrs?: Partial<Task>,
): Generator<unknown, Task, unknown> {
  const project = yield* byId(projectId);
  if (!project) throw new Error("Project not found");

  let projectCategoryId = taskAttrs?.projectCategoryId;
  if (!projectCategoryId) {
    const firstCategory = yield* projectCategoriesSlice.firstChild(projectId);
    if (!firstCategory) throw new Error("No categories found");
    projectCategoryId = firstCategory.id;
  }

  return yield* projectCategoriesSlice.createTask(
    projectCategoryId,
    position,
    taskAttrs,
  );
});

export const createTaskIfNotExists = action(function* (
  projectId: string,
  taskId: string,
  position:
    | [OrderableItem | undefined, OrderableItem | undefined]
    | "append"
    | "prepend",
  taskAttrs?: Partial<Task>,
): Generator<unknown, Task, unknown> {
  const task = yield* cardsTasksSlice.byId(taskId);
  if (task) {
    return task;
  }

  return yield* createTaskIfNotExists(projectId, taskId, position, taskAttrs);
});

// Local slice object for registerModelSlice (not exported)
const projectsSlice = {
  allIds,
  byId,
  byIdOrDefault,
  canDrop,
  inboxProjectId,
  overdueTasksCountExceptDailiesCount,
  notDoneTasksCountExceptDailiesCount,
  overdueTasksCountExceptDailiesAndStashCount,
  notDoneTasksCountExceptDailiesAndStashCount,
  createInboxIfNotExists,
  create,
  update: updateProject,
  delete: deleteProjects,
  handleDrop,
  createTask,
  createTaskIfNotExists,
};
registerModelSlice(projectsSlice, projectsTable, projectType);
