import { isObjectType } from "../utils";
import { shouldNeverHappen } from "../utils";
import {
  action,
  deleteRows,
  defineTable,
  type ExtractSchema,
  insert,
  selectFrom,
  selector,
  upsert,
  v,
} from "@will-be-done/hyperdb-lib";
import { generateJitteredKeyBetween } from "fractional-indexing-jittered";
import { uuidv7 } from "uuidv7";
import type { OrderableItem } from "./utils";
import { generateOrderTokenPositioned } from "./utils";
import { appById } from "./app";
import {
  createCategory,
  deleteCategories,
  firstProjectCategoryChild,
  inboxCategoryId,
  projectCategoriesByProjectId,
  projectCategoriesByProjectIds,
  createProjectCategoryTask,
} from "./projectsCategories";
import {
  projectCategoryCardIds,
} from "./projectsCategoriesCards";
import { firstProjectChild, lastProjectChild, projectSiblings } from "./projectsAll";
import {
  dailyListAllTaskIds,
  dailyListsByIds,
} from "./dailyLists";
import {
  dailyProjectionByTaskId,
} from "./dailyListsProjections";
import { stashProjectionAllTaskIds } from "./stashProjections";
import {
  taskById,
  updateTask,
  type Task,
  isTask,
} from "./cardsTasks";
import {
  updateTemplate,
  isTaskTemplate,
} from "./cardsTaskTemplates";
import { registerSpaceSyncableTable } from "./syncMap";
import { registerModelSlice, AnyModelType } from "./maps";





import { isTaskProjection } from "./dailyListsProjections";
import { genUUIDV5 } from "../traits";
import { startOfDay } from "date-fns";

export const projectType = "project";
export const projectsTable = defineTable("projects", {
  type: v.literal(projectType),
  id: v.string(),
  title: v.string(),
  icon: v.string(),
  isInbox: v.boolean(),
  orderToken: v.string(),
  createdAt: v.number(),
})
  .index("byIds", ["id"])
  .index("byOrderToken", ["orderToken"])
  .index("byIsInbox", ["isInbox"], { type: "hash" });
export type Project = ExtractSchema<typeof projectsTable>;

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

registerSpaceSyncableTable(projectsTable, projectType);

// Selectors and actions
export const projectAllIds = selector(function* projectAllIds() {
  const projects = yield* selectFrom(projectsTable, "byOrderToken").where((q) => q);

  return projects.map((p) => p.id);
});

export const projectById = selector(function* projectById(id: string) {
  const projects = yield* selectFrom(projectsTable, "byId")
      .where((q) => q.eq("id", id))
      .limit(1);
  return projects[0] as Project | undefined;
});

export const projectByIdOrDefault = selector(function* projectByIdOrDefault(id: string) {
  return (yield* projectById(id)) || defaultProject;
});

export const projectCanDrop = selector(function* projectCanDrop(
  projectId: string,
  dropItemId: string,
  dropModelType: AnyModelType,
): Generator<unknown, boolean, unknown> {
  const project = yield* projectById(projectId);
  if (!project) return false;

  const dropItem = yield* appById(dropItemId, dropModelType);
  if (!dropItem) return false;

  // Projects can accept tasks, templates, projections, and other projects
  if (isProject(dropItem) || isTask(dropItem) || isTaskTemplate(dropItem)) {
    return true;
  }

  if (isTaskProjection(dropItem)) {
    const task = yield* taskById(dropItem.id);
    return task !== undefined && task.state === "todo";
  }

  return false;
});

export const inboxProjectId = selector(function* inboxProjectId() {
  return yield* genUUIDV5(projectType, "inbox");
});

export const overdueTasksCountExceptDailiesCount = selector(function* overdueTasksCountExceptDailiesCount(
  projectId: string,
  exceptDailyListIds: string[],
  currentDate: Date,
): Generator<unknown, number, unknown> {
  currentDate = startOfDay(currentDate);

  const categories = yield* projectCategoriesByProjectId(projectId);

  const taskIds = yield* dailyListAllTaskIds(exceptDailyListIds);
  const exceptCardIds: Set<string> = new Set(taskIds);
  const exceptDailyListSet = new Set(exceptDailyListIds);

  // First pass: collect all unique dailyListIds that we need to check
  const dailyListIdsToFetch = new Set<string>();
  for (const category of categories) {
    const childrenIds = yield* projectCategoryCardIds(
      category.id,
    );

    for (const taskId of childrenIds) {
      if (exceptCardIds.has(taskId)) continue;

      const projection = yield* dailyProjectionByTaskId(taskId);
      if (!projection) continue;
      if (exceptDailyListSet.has(projection.dailyListId)) continue;

      dailyListIdsToFetch.add(projection.dailyListId);
    }
  }

  // Batch fetch all daily lists at once
  const dailyLists = yield* dailyListsByIds(
    Array.from(dailyListIdsToFetch),
  );
  const dailyListMap = new Map(dailyLists.map((dl) => [dl.id, dl]));

  // Second pass: count overdue tasks
  let overdueCount = 0;
  for (const category of categories) {
    const childrenIds = yield* projectCategoryCardIds(
      category.id,
    );

    for (const taskId of childrenIds) {
      if (exceptCardIds.has(taskId)) continue;

      const projection = yield* dailyProjectionByTaskId(taskId);
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

export const notDoneTasksCountExceptDailiesCount = selector(function* notDoneTasksCountExceptDailiesCount(
  projectId: string,
  exceptDailyListIds: string[],
): Generator<unknown, number, unknown> {
  const categories = yield* projectCategoriesByProjectId(projectId);

  const taskIds = yield* dailyListAllTaskIds(exceptDailyListIds);
  const exceptCardIds: Set<string> = new Set(taskIds);

  const finalChildrenIds: string[] = [];
  for (const category of categories) {
    const childrenIds = yield* projectCategoryCardIds(
      category.id,
    );

    finalChildrenIds.push(...childrenIds);
  }

  return finalChildrenIds.filter((id) => !exceptCardIds.has(id)).length;
});

export const overdueTasksCountExceptDailiesAndStashCount = selector(function* overdueTasksCountExceptDailiesAndStashCount(
  projectId: string,
  exceptDailyListIds: string[],
  currentDate: Date,
): Generator<unknown, number, unknown> {
  currentDate = startOfDay(currentDate);

  const categories = yield* projectCategoriesByProjectId(projectId);

  const taskIds = yield* dailyListAllTaskIds(exceptDailyListIds);
  const stashTaskIds = yield* stashProjectionAllTaskIds();
  const exceptCardIds: Set<string> = new Set([...taskIds, ...stashTaskIds]);
  const exceptDailyListSet = new Set(exceptDailyListIds);

  const dailyListIdsToFetch = new Set<string>();
  for (const category of categories) {
    const childrenIds = yield* projectCategoryCardIds(
      category.id,
    );

    for (const taskId of childrenIds) {
      if (exceptCardIds.has(taskId)) continue;

      const projection = yield* dailyProjectionByTaskId(taskId);
      if (!projection) continue;
      if (exceptDailyListSet.has(projection.dailyListId)) continue;

      dailyListIdsToFetch.add(projection.dailyListId);
    }
  }

  const dailyLists = yield* dailyListsByIds(
    Array.from(dailyListIdsToFetch),
  );
  const dailyListMap = new Map(dailyLists.map((dl) => [dl.id, dl]));

  let overdueCount = 0;
  for (const category of categories) {
    const childrenIds = yield* projectCategoryCardIds(
      category.id,
    );

    for (const taskId of childrenIds) {
      if (exceptCardIds.has(taskId)) continue;

      const projection = yield* dailyProjectionByTaskId(taskId);
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

export const notDoneTasksCountExceptDailiesAndStashCount = selector(function* notDoneTasksCountExceptDailiesAndStashCount(
  projectId: string,
  exceptDailyListIds: string[],
): Generator<unknown, number, unknown> {
  const categories = yield* projectCategoriesByProjectId(projectId);

  const taskIds = yield* dailyListAllTaskIds(exceptDailyListIds);
  const stashTaskIds = yield* stashProjectionAllTaskIds();
  const exceptCardIds: Set<string> = new Set([...taskIds, ...stashTaskIds]);

  const finalChildrenIds: string[] = [];
  for (const category of categories) {
    const childrenIds = yield* projectCategoryCardIds(
      category.id,
    );

    finalChildrenIds.push(...childrenIds);
  }

  return finalChildrenIds.filter((id) => !exceptCardIds.has(id)).length;
});

export const createProject = action(function* createProject(
  project: Partial<Project>,
  position:
    | [OrderableItem | undefined, OrderableItem | undefined]
    | "append"
    | "prepend",
): Generator<unknown, Project, unknown> {
  const orderToken = yield* generateOrderTokenPositioned(
    "all-projects-list",
    { firstChild: firstProjectChild, lastChild: lastProjectChild },
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
    yield* createCategory(
      {
        projectId: newProject.id,
        title: "Inbox",
        id: yield* inboxCategoryId(),
      },
      "append",
    );
  } else {
    yield* createCategory(
      { projectId: newProject.id, title: "Week" },
      "append",
    );
    yield* createCategory(
      { projectId: newProject.id, title: "Month" },
      "append",
    );
    yield* createCategory(
      { projectId: newProject.id, title: "Ideas" },
      "append",
    );
  }

  return newProject;
});

export const createInboxIfNotExists = action(function* createInboxIfNotExists(): Generator<
  unknown,
  Project,
  unknown
> {
  const inbox = yield* projectById(yield* inboxProjectId());
  if (inbox) {
    return inbox;
  }

  return yield* createProject(
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

export const updateProject = action(function* updateProject(
  id: string,
  project: Partial<Project>,
): Generator<unknown, void, unknown> {
  const projectInState = yield* projectById(id);
  if (!projectInState) throw new Error("Project not found");

  yield* upsert(projectsTable, [{ ...projectInState, ...project }]);
});

export const deleteProjects = action(function* deleteProjects(
  ids: string[],
): Generator<unknown, void, unknown> {
  const projectCategories = yield* projectCategoriesByProjectIds(ids);

  yield* deleteCategories(
    projectCategories.map((c) => c.id),
  );
  yield* deleteRows(projectsTable, ids);
});

export const projectHandleDrop = action(function* projectHandleDrop(
  projectId: string,
  dropItemId: string,
  dropModelType: AnyModelType,
  edge: "top" | "bottom",
): Generator<unknown, void, unknown> {
  const canDropResult = yield* projectCanDrop(projectId, dropItemId, dropModelType);
  if (!canDropResult) return;

  const project = yield* projectById(projectId);
  if (!project) throw new Error("Project not found");

  const dropItem = yield* appById(dropItemId, dropModelType);
  if (!dropItem) throw new Error("Target not found");

  if (isProject(dropItem)) {
    // Reorder projects - would need proper fractional indexing
    const [up, down] = yield* projectSiblings(project.id);

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
    const category = yield* firstProjectCategoryChild(project.id);
    if (!category) throw new Error("No categories found in project");

    // Move task/template to this project
    if (isTask(dropItem)) {
      yield* updateTask(dropItem.id, {
        projectCategoryId: category.id,
      });
    } else if (isTaskTemplate(dropItem)) {
      yield* updateTemplate(dropItem.id, {
        projectCategoryId: category.id,
      });
    } else if (isTaskProjection(dropItem)) {
      // When dropping a projection onto a project, move the underlying task
      const task = yield* taskById(dropItem.id);
      if (task) {
        yield* updateTask(task.id, {
          projectCategoryId: category.id,
        });
        // Keep the projection in the daily list
      }
    }
  } else {
    shouldNeverHappen("unknown drop item type", dropItem);
  }
});

export const createProjectTask = action(function* createProjectTask(
  projectId: string,
  position:
    | [OrderableItem | undefined, OrderableItem | undefined]
    | "append"
    | "prepend",
  taskAttrs?: Partial<Task>,
): Generator<unknown, Task, unknown> {
  const project = yield* projectById(projectId);
  if (!project) throw new Error("Project not found");

  let projectCategoryId = taskAttrs?.projectCategoryId;
  if (!projectCategoryId) {
    const firstCategory = yield* firstProjectCategoryChild(projectId);
    if (!firstCategory) throw new Error("No categories found");
    projectCategoryId = firstCategory.id;
  }

  return yield* createProjectCategoryTask(
    projectCategoryId,
    position,
    taskAttrs,
  );
});

export const createProjectTaskIfNotExists = action(function* createProjectTaskIfNotExists(
  projectId: string,
  taskId: string,
  position:
    | [OrderableItem | undefined, OrderableItem | undefined]
    | "append"
    | "prepend",
  taskAttrs?: Partial<Task>,
): Generator<unknown, Task, unknown> {
  const task = yield* taskById(taskId);
  if (task) {
    return task;
  }

  return yield* createProjectTask(projectId, position, { ...taskAttrs, id: taskId });
});

// Local slice object for registerModelSlice (not exported)
const projectsSlice = {
  projectAllIds,
  byId: projectById,
  projectByIdOrDefault,
  canDrop: projectCanDrop,
  inboxProjectId,
  overdueTasksCountExceptDailiesCount,
  notDoneTasksCountExceptDailiesCount,
  overdueTasksCountExceptDailiesAndStashCount,
  notDoneTasksCountExceptDailiesAndStashCount,
  createInboxIfNotExists,
  createProject,
  update: updateProject,
  delete: deleteProjects,
  handleDrop: projectHandleDrop,
  createProjectTask,
  createProjectTaskIfNotExists,
};
registerModelSlice(projectsSlice, projectsTable, projectType);
