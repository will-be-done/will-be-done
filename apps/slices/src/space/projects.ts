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
import type { OrderableItem, GenReturn } from "./utils";
import { inboxId, generateOrderTokenPositioned } from "./utils";
import { appSlice } from "./app";
import { projectsAllSlice } from "./projectsAll";
import { isTask, Task, cardsTasksSlice } from "./cardsTasks";
import { isTaskTemplate, cardsTaskTemplatesSlice } from "./cardsTaskTemplates";
import { registerSpaceSyncableTable } from "./syncMap";
import { registerModelSlice, AnyModelType } from "./maps";
import { projectCategoriesSlice } from "./projectsCategories";
import { projectCategoryCardsSlice } from "./projectsCategoriesCards";
import { dailyListsSlice } from "./dailyLists";
import {
  dailyListsProjectionsSlice,
  isTaskProjection,
} from "./dailyListsProjections";

// Type definitions
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

// Slice (will be populated after all slices are defined to avoid circular dependencies)
export const projectsSlice = {
  // selectors
  allIds: selector(function* (): GenReturn<string[]> {
    const projects = yield* runQuery(
      selectFrom(projectsTable, "byOrderToken").where((q) => q),
    );

    return projects.map((p) => p.id);
  }),
  byId: selector(function* (id: string): GenReturn<Project | undefined> {
    const projects = yield* runQuery(
      selectFrom(projectsTable, "byId")
        .where((q) => q.eq("id", id))
        .limit(1),
    );
    return projects[0];
  }),
  byIdOrDefault: selector(function* (id: string): GenReturn<Project> {
    return (yield* projectsSlice.byId(id)) || defaultProject;
  }),
  canDrop: selector(function* (
    projectId: string,
    dropItemId: string,
    dropModelType: AnyModelType,
  ): GenReturn<boolean> {
    const project = yield* projectsSlice.byId(projectId);
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
  }),

  overdueTasksCountExceptDailiesCount: selector(function* (
    projectId: string,
    exceptDailyListIds: string[],
    currentDate: Date,
  ): GenReturn<number> {
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
  }),

  notDoneTasksCountExceptDailiesCount: selector(function* (
    projectId: string,
    exceptDailyListIds: string[],
  ): GenReturn<number> {
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
  }),

  // actions
  createInboxIfNotExists: action(function* (): GenReturn<Project> {
    const inbox = yield* projectsSlice.byId(inboxId);
    if (inbox) {
      return inbox;
    }

    return yield* projectsSlice.create(
      {
        id: inboxId,
        title: "Inbox",
        icon: "",
        isInbox: true,
        orderToken: generateJitteredKeyBetween(null, null),
        createdAt: new Date().getTime(),
      },
      [undefined, undefined],
    );
  }),
  create: action(function* (
    project: Partial<Project>,
    position:
      | [OrderableItem | undefined, OrderableItem | undefined]
      | "append"
      | "prepend",
  ): GenReturn<Project> {
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

    yield* insert(projectsTable, [newProject]);
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

    return newProject;
  }),
  update: action(function* (
    id: string,
    project: Partial<Project>,
  ): GenReturn<void> {
    const projectInState = yield* projectsSlice.byId(id);
    if (!projectInState) throw new Error("Project not found");

    yield* update(projectsTable, [{ ...projectInState, ...project }]);
  }),
  delete: action(function* (ids: string[]): GenReturn<void> {
    const projectCategories = yield* projectCategoriesSlice.byProjectIds(ids);

    yield* projectCategoriesSlice.delete(projectCategories.map((c) => c.id));
    yield* deleteRows(projectsTable, ids);
  }),
  handleDrop: action(function* (
    projectId: string,
    dropItemId: string,
    dropModelType: AnyModelType,
    edge: "top" | "bottom",
  ): GenReturn<void> {
    const canDrop = yield* projectsSlice.canDrop(
      projectId,
      dropItemId,
      dropModelType,
    );
    if (!canDrop) return;

    const project = yield* projectsSlice.byId(projectId);
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

      yield* projectsSlice.update(dropItem.id, { orderToken });
    } else if (
      isTask(dropItem) ||
      isTaskTemplate(dropItem) ||
      isTaskProjection(dropItem)
    ) {
      const category = yield* projectCategoriesSlice.firstChild(project.id);
      if (!category) throw new Error("No categories found in project");

      // Move task/template to this project
      if (isTask(dropItem)) {
        yield* cardsTasksSlice.update(dropItem.id, {
          projectCategoryId: category.id,
        });
      } else if (isTaskTemplate(dropItem)) {
        yield* cardsTaskTemplatesSlice.update(dropItem.id, {
          projectCategoryId: category.id,
        });
      } else if (isTaskProjection(dropItem)) {
        // When dropping a projection onto a project, move the underlying task
        const task = yield* cardsTasksSlice.byId(dropItem.id);
        if (task) {
          yield* cardsTasksSlice.update(task.id, {
            projectCategoryId: category.id,
          });
          // Keep the projection in the daily list
        }
      }
    } else {
      shouldNeverHappen("unknown drop item type", dropItem);
    }
  }),
  createTask: action(function* (
    projectId: string,
    position:
      | [OrderableItem | undefined, OrderableItem | undefined]
      | "append"
      | "prepend",
    taskAttrs?: Partial<Task>,
  ): GenReturn<Task> {
    const project = yield* projectsSlice.byId(projectId);
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
  }),

  createTaskIfNotExists: action(function* (
    projectId: string,
    taskId: string,
    position:
      | [OrderableItem | undefined, OrderableItem | undefined]
      | "append"
      | "prepend",
    taskAttrs?: Partial<Task>,
  ): GenReturn<Task> {
    const task = yield* cardsTasksSlice.byId(taskId);
    if (task) {
      return task;
    }

    return yield* projectsSlice.createTaskIfNotExists(
      projectId,
      taskId,
      position,
      taskAttrs,
    );
  }),
};
registerModelSlice(projectsSlice, projectsTable, projectType);
