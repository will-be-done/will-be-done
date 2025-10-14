import { isObjectType } from "../utils";
import { shouldNeverHappen } from "@/utils";
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
import { appSlice2 } from "./app";
import { allProjectsSlice2 } from "./allProjects";
import { isTask, tasksSlice2 } from "./tasks";
import { isTaskTemplate, taskTemplatesSlice2 } from "./taskTemplates";
import { isTaskProjection } from "./projections";

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

// Slice (will be populated after all slices are defined to avoid circular dependencies)
export const projectsSlice2 = {
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
    return (yield* projectsSlice2.byId(id)) || defaultProject;
  }),
  canDrop: selector(function* (
    projectId: string,
    dropItemId: string,
  ): GenReturn<boolean> {
    const project = yield* projectsSlice2.byId(projectId);
    if (!project) return false;

    const dropItem = yield* appSlice2.byId(dropItemId);
    if (!dropItem) return false;

    // Projects can accept tasks, templates, projections, and other projects
    return (
      isProject(dropItem) ||
      isTask(dropItem) ||
      isTaskTemplate(dropItem) ||
      isTaskProjection(dropItem)
    );
  }),

  // actions
  createInboxIfNotExists: action(function* (): GenReturn<Project> {
    const inbox = yield* projectsSlice2.byId(inboxId);
    if (inbox) {
      return inbox;
    }

    return yield* projectsSlice2.create(
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
      allProjectsSlice2,
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
    return newProject;
  }),
  update: action(function* (
    id: string,
    project: Partial<Project>,
  ): GenReturn<void> {
    const projectInState = yield* projectsSlice2.byId(id);
    if (!projectInState) throw new Error("Project not found");

    yield* update(projectsTable, [{ ...projectInState, ...project }]);
  }),
  delete: action(function* (ids: string[]): GenReturn<void> {
    yield* deleteRows(projectsTable, ids);
  }),
  handleDrop: action(function* (
    projectId: string,
    dropItemId: string,
    edge: "top" | "bottom",
  ): GenReturn<void> {
    const canDrop = yield* projectsSlice2.canDrop(projectId, dropItemId);
    if (!canDrop) return;

    const project = yield* projectsSlice2.byId(projectId);
    if (!project) throw new Error("Project not found");

    const dropItem = yield* appSlice2.byId(dropItemId);
    if (!dropItem) throw new Error("Target not found");

    if (isProject(dropItem)) {
      // Reorder projects - would need proper fractional indexing
      const [up, down] = yield* allProjectsSlice2.siblings(project.id);

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

      yield* projectsSlice2.update(dropItem.id, { orderToken });
    } else if (isTask(dropItem) || isTaskTemplate(dropItem)) {
      // Move task/template to this project
      if (isTask(dropItem)) {
        yield* tasksSlice2.update(dropItem.id, { projectId: project.id });
      } else {
        yield* taskTemplatesSlice2.update(dropItem.id, {
          projectId: project.id,
        });
      }
    } else if (isTaskProjection(dropItem)) {
      // Move the underlying task to this project
      const task = yield* tasksSlice2.byId(dropItem.taskId);
      if (task) {
        yield* tasksSlice2.update(task.id, { projectId: project.id });
      }
    } else {
      shouldNeverHappen("unknown drop item type", dropItem);
    }
  }),
};
