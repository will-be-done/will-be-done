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
import { isTask, Task, cardsTasksSlice, tasksTable } from "./cardsTasks";
import {
  isTaskTemplate,
  cardsTaskTemplatesSlice,
  taskTemplatesTable,
} from "./cardsTaskTemplates";
import {
  dailyListsProjections,
  isTaskProjection,
} from "./dailyListsProjections";
import { registerSyncableTable } from "./syncMap";
import { registerModelSlice } from "./maps";
import { projectCategoriesSlice } from "./projectsCategories";
import { projectCategoryCardsSlice } from "./projectsCategoriesCards";
import { dailyListsSlice } from "./dailyLists";

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
registerSyncableTable(projectsTable, projectType);

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
  ): GenReturn<boolean> {
    const project = yield* projectsSlice.byId(projectId);
    if (!project) return false;

    const dropItem = yield* appSlice.byId(dropItemId);
    if (!dropItem) return false;

    // Projects can accept tasks, templates, projections, and other projects
    return (
      isProject(dropItem) ||
      isTask(dropItem) ||
      isTaskTemplate(dropItem) ||
      isTaskProjection(dropItem)
    );
  }),

  overdueTasksCountExceptDailiesCount: selector(function* (
    projectId: string,
    exceptDailyListIds: string[],
    currentDate: Date,
  ): GenReturn<number> {
    const categories = yield* projectCategoriesSlice.byProjectId(projectId);

    const taskIds = yield* dailyListsSlice.allTaskIds(exceptDailyListIds);
    const exceptCardIds: Set<string> = new Set(taskIds);

    const finalChildrenIds: string[] = [];
    for (const category of categories) {
      const childrenIds = yield* projectCategoryCardsSlice.childrenIds(
        category.id,
      );

      for (const id of childrenIds) {
        const lastProjection =
          yield* dailyListsProjections.lastProjectionOfTask(id);
        if (!lastProjection) continue;

        const lastCreatedAt = lastProjection.createdAt;
        if (lastCreatedAt < currentDate.getTime()) {
          finalChildrenIds.push(id);
        }
      }
    }

    return finalChildrenIds.filter((id) => !exceptCardIds.has(id)).length;
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
    edge: "top" | "bottom",
  ): GenReturn<void> {
    const canDrop = yield* projectsSlice.canDrop(projectId, dropItemId);
    if (!canDrop) return;

    const project = yield* projectsSlice.byId(projectId);
    if (!project) throw new Error("Project not found");

    const dropItem = yield* appSlice.byId(dropItemId);
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
    } else if (isTask(dropItem) || isTaskTemplate(dropItem)) {
      const category = yield* projectCategoriesSlice.firstChild(project.id);
      if (!category) throw new Error("No categories found in project");

      // Move task/template to this project
      if (isTask(dropItem)) {
        yield* cardsTasksSlice.update(dropItem.id, {
          projectCategoryId: category.id,
        });
      } else {
        yield* cardsTaskTemplatesSlice.update(dropItem.id, {
          projectCategoryId: category.id,
        });
      }
    } else if (isTaskProjection(dropItem)) {
      const category = yield* projectCategoriesSlice.firstChild(project.id);
      if (!category) throw new Error("No categories found in project");

      // Move the underlying task to this project
      const task = yield* cardsTasksSlice.byId(dropItem.taskId);
      if (task) {
        yield* cardsTasksSlice.update(task.id, {
          projectCategoryId: category.id,
        });
      }
    } else {
      shouldNeverHappen("unknown drop item type", dropItem);
    }
  }),
  migrateProjectsWithoutCategories: action(function* (): GenReturn<{
    projectsMigrated: number;
    tasksUpdated: number;
    templatesUpdated: number;
  }> {
    let projectsMigrated = 0;
    let tasksUpdated = 0;
    let templatesUpdated = 0;

    // Get all project IDs
    const projectIds = yield* projectsSlice.allIds();

    // Process each project
    for (const projectId of projectIds) {
      // Check if project has categories
      const existingCategories =
        yield* projectCategoriesSlice.byProjectId(projectId);

      if (existingCategories.length === 0) {
        // Create three default categories
        yield* projectCategoriesSlice.createCategory(
          { projectId, title: "Week" },
          "append",
        );
        yield* projectCategoriesSlice.createCategory(
          { projectId, title: "Month" },
          "append",
        );
        yield* projectCategoriesSlice.createCategory(
          { projectId, title: "Ideas" },
          "append",
        );
      }

      // Get all tasks for this project (both todo and done)
      const allTasks = yield* runQuery(
        selectFrom(tasksTable, "byProjectIdOrderStates").where((q) =>
          q.eq("projectId", projectId),
        ),
      );

      const firstCategory = yield* projectCategoriesSlice.firstChild(projectId);
      if (!firstCategory) throw new Error("No categories found");

      // Filter tasks with null projectCategoryId
      const unassignedTasks = allTasks.filter((t) => !t.projectCategoryId);

      if (unassignedTasks.length > 0) {
        // Update tasks with Week category ID
        const updatedTasks = unassignedTasks.map((task) => ({
          ...task,
          projectCategoryId: firstCategory.id,
        }));

        yield* update(tasksTable, updatedTasks);
        tasksUpdated += updatedTasks.length;
      }

      // Get all task templates for this project
      const allTemplates = yield* runQuery(
        selectFrom(taskTemplatesTable, "byProjectIdOrderToken").where((q) =>
          q.eq("projectId", projectId),
        ),
      );

      // Filter templates with null projectCategoryId
      const unassignedTemplates = allTemplates.filter(
        (t) => !t.projectCategoryId,
      );

      if (unassignedTemplates.length > 0) {
        // Update templates with Week category ID
        const updatedTemplates = unassignedTemplates.map((template) => ({
          ...template,
          projectCategoryId: firstCategory.id,
        }));

        yield* update(taskTemplatesTable, updatedTemplates);
        templatesUpdated += updatedTemplates.length;
      }

      projectsMigrated++;
    }

    return { projectsMigrated, tasksUpdated, templatesUpdated };
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
