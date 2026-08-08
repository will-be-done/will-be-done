import { shouldNeverHappen } from "../utils";
import {
  deleteRows,
  insert,
  selectFrom,
  upsert,
  v,
} from "@will-be-done/hyperdb";
import { action, selector } from "../builders";
import { generateJitteredKeyBetween } from "fractional-indexing-jittered";
import { uuidv7 } from "uuidv7";
import {
  generateOrderTokenPositioned,
  normalizeOrderPosition,
  orderPositionArg,
} from "./utils";
import { appById } from "./app";
import {
  createProjectSection,
  deleteProjectSections,
  firstProjectSectionChild,
  inboxProjectSectionId,
  projectSectionById,
  projectSectionsByProjectId,
  projectSectionsByProjectIds,
  createTaskInSection,
} from "./projectSections";
import {
  firstProjectChild,
  lastProjectChild,
  projectSiblings,
} from "./projectsAll";
import { dailyListAllTaskIds, dailyListsByIds } from "./dailyLists";
import { dailyEntryByTaskId } from "./dailyEntries";
import { stashEntryAllTaskIds } from "./stashEntries";
import { taskById, updateTask } from "./tasks";
import { updateTemplate } from "./taskTemplates";
import {
  firstProjectSectionItem,
  lastProjectSectionItem,
} from "./projectSectionItems";
import { registerModelSlice } from "./maps";
import { genUUIDV5 } from "../traits";
import { startOfDay } from "date-fns";
import {
  projectType,
  projectsTable,
  tasksTable,
  possibleModelType,
  type Task,
  Project,
  isProject,
  isDailyEntry,
  isTask,
  isTaskTemplate,
} from "./tables";

export const defaultProject: Project = {
  type: projectType,
  id: "default-project-id",
  title: "default project",
  icon: "",
  isInbox: false,
  orderToken: "",
  createdAt: 0,
};

function* projectTodoTaskIds(
  projectId: string,
): Generator<unknown, string[], unknown> {
  const sections = yield* projectSectionsByProjectId({ projectId });
  const projectSectionIds = sections.map((section) => section.id);
  if (projectSectionIds.length === 0) return [];

  const tasks = yield* selectFrom(
    tasksTable,
    "byProjectSectionIdOrderStates",
  ).where((q) =>
    projectSectionIds.map((projectSectionId) =>
      q.eq("projectSectionId", projectSectionId).eq("state", "todo"),
    ),
  );

  return tasks.map((task) => task.id);
}

// Selectors and actions
export const projectAllIds = selector({
  name: "projectAllIds",
  args: {},
  handler: function* projectAllIds() {
    const projects = yield* selectFrom(projectsTable, "byOrderToken").where(
      (q) => q,
    );

    return projects.map((p) => p.id);
  },
});

export const projectById = selector({
  name: "projectById",
  args: { id: v.string() },
  handler: function* projectById({ id }) {
    const projects = yield* selectFrom(projectsTable, "byId")
      .where((q) => q.eq("id", id))
      .limit(1);
    return projects[0] as Project | undefined;
  },
});

export const projectByIdOrDefault = selector({
  name: "projectByIdOrDefault",
  args: { id: v.string() },
  handler: function* projectByIdOrDefault({ id }) {
    return (yield* projectById({ id })) || defaultProject;
  },
});

export const projectCanDrop = selector({
  name: "projectCanDrop",
  args: {
    projectId: v.string(),
    dropItemId: v.string(),
    dropModelType: possibleModelType,
  },
  handler: function* projectCanDrop({
    projectId,
    dropItemId,
    dropModelType,
  }): Generator<unknown, boolean, unknown> {
    const project = yield* projectById({ id: projectId });
    if (!project) return false;

    const dropItem = yield* appById({
      id: dropItemId,
      modelType: dropModelType,
    });
    if (!dropItem) return false;

    // Projects can accept tasks, templates, entries, and other projects
    if (isProject(dropItem) || isTask(dropItem) || isTaskTemplate(dropItem)) {
      return true;
    }

    if (isDailyEntry(dropItem)) {
      const task = yield* taskById({ id: dropItem.taskId });
      return task !== undefined && task.state === "todo";
    }

    return false;
  },
});

export const inboxProjectId = selector({
  name: "inboxProjectId",
  args: {},
  handler: function* inboxProjectId() {
    return yield* genUUIDV5(projectType, "inbox");
  },
});

export const overdueTasksCountExceptDailiesCount = selector({
  name: "overdueTasksCountExceptDailiesCount",
  args: {
    projectId: v.string(),
    exceptDailyListIds: v.array(v.string()),
    currentDate: v.number(),
  },
  handler: function* overdueTasksCountExceptDailiesCount({
    projectId,
    exceptDailyListIds,
    currentDate,
  }): Generator<unknown, number, unknown> {
    const currentDay = startOfDay(new Date(currentDate));

    const taskIds = yield* dailyListAllTaskIds({
      dailyListIds: exceptDailyListIds,
    });
    const exceptItemIds: Set<string> = new Set(taskIds);
    const exceptDailyListSet = new Set(exceptDailyListIds);
    const childrenIds = yield* projectTodoTaskIds(projectId);

    const dailyListIdsToFetch = new Set<string>();
    for (const taskId of childrenIds) {
      if (exceptItemIds.has(taskId)) continue;

      const entry = yield* dailyEntryByTaskId({ taskId });
      if (!entry) continue;
      if (exceptDailyListSet.has(entry.dailyListId)) continue;

      dailyListIdsToFetch.add(entry.dailyListId);
    }

    const dailyLists = yield* dailyListsByIds({
      ids: Array.from(dailyListIdsToFetch),
    });
    const dailyListMap = new Map(dailyLists.map((dl) => [dl.id, dl]));

    let overdueCount = 0;
    for (const taskId of childrenIds) {
      if (exceptItemIds.has(taskId)) continue;

      const entry = yield* dailyEntryByTaskId({ taskId });
      if (!entry) continue;
      if (exceptDailyListSet.has(entry.dailyListId)) continue;

      const dailyList = dailyListMap.get(entry.dailyListId);
      if (!dailyList) continue;

      const listDate = new Date(dailyList.date);
      if (listDate < currentDay) {
        overdueCount++;
      }
    }

    return overdueCount;
  },
});

export const notDoneTasksCountExceptDailiesCount = selector({
  name: "notDoneTasksCountExceptDailiesCount",
  args: {
    projectId: v.string(),
    exceptDailyListIds: v.array(v.string()),
  },
  handler: function* notDoneTasksCountExceptDailiesCount({
    projectId,
    exceptDailyListIds,
  }): Generator<unknown, number, unknown> {
    const taskIds = yield* dailyListAllTaskIds({
      dailyListIds: exceptDailyListIds,
    });
    const exceptItemIds: Set<string> = new Set(taskIds);
    const childrenIds = yield* projectTodoTaskIds(projectId);

    return childrenIds.filter((id) => !exceptItemIds.has(id)).length;
  },
});

export const overdueTasksCountExceptDailiesAndStashCount = selector({
  name: "overdueTasksCountExceptDailiesAndStashCount",
  args: {
    projectId: v.string(),
    exceptDailyListIds: v.array(v.string()),
    currentDate: v.number(),
  },
  handler: function* overdueTasksCountExceptDailiesAndStashCount({
    projectId,
    exceptDailyListIds,
    currentDate,
  }): Generator<unknown, number, unknown> {
    const currentDay = startOfDay(new Date(currentDate));

    const taskIds = yield* dailyListAllTaskIds({
      dailyListIds: exceptDailyListIds,
    });
    const stashTaskIds = yield* stashEntryAllTaskIds({});
    const exceptItemIds: Set<string> = new Set([...taskIds, ...stashTaskIds]);
    const exceptDailyListSet = new Set(exceptDailyListIds);
    const childrenIds = yield* projectTodoTaskIds(projectId);

    const dailyListIdsToFetch = new Set<string>();
    for (const taskId of childrenIds) {
      if (exceptItemIds.has(taskId)) continue;

      const entry = yield* dailyEntryByTaskId({ taskId });
      if (!entry) continue;
      if (exceptDailyListSet.has(entry.dailyListId)) continue;

      dailyListIdsToFetch.add(entry.dailyListId);
    }

    const dailyLists = yield* dailyListsByIds({
      ids: Array.from(dailyListIdsToFetch),
    });
    const dailyListMap = new Map(dailyLists.map((dl) => [dl.id, dl]));

    let overdueCount = 0;
    for (const taskId of childrenIds) {
      if (exceptItemIds.has(taskId)) continue;

      const entry = yield* dailyEntryByTaskId({ taskId });
      if (!entry) continue;
      if (exceptDailyListSet.has(entry.dailyListId)) continue;

      const dailyList = dailyListMap.get(entry.dailyListId);
      if (!dailyList) continue;

      const listDate = new Date(dailyList.date);
      if (listDate < currentDay) {
        overdueCount++;
      }
    }

    return overdueCount;
  },
});

export const notDoneTasksCountExceptDailiesAndStashCount = selector({
  name: "notDoneTasksCountExceptDailiesAndStashCount",
  args: {
    projectId: v.string(),
    exceptDailyListIds: v.array(v.string()),
  },
  handler: function* notDoneTasksCountExceptDailiesAndStashCount({
    projectId,
    exceptDailyListIds,
  }): Generator<unknown, number, unknown> {
    const taskIds = yield* dailyListAllTaskIds({
      dailyListIds: exceptDailyListIds,
    });
    const stashTaskIds = yield* stashEntryAllTaskIds({});
    const exceptItemIds: Set<string> = new Set([...taskIds, ...stashTaskIds]);
    const childrenIds = yield* projectTodoTaskIds(projectId);

    return childrenIds.filter((id) => !exceptItemIds.has(id)).length;
  },
});

export const createProject = action({
  name: "createProject",
  args: {
    project: v.partial(projectsTable.v()),
    position: orderPositionArg,
  },
  handler: function* createProject({
    project,
    position,
  }): Generator<unknown, Project, unknown> {
    const orderToken = yield* generateOrderTokenPositioned(
      "all-projects-list",
      { firstChild: firstProjectChild, lastChild: lastProjectChild },
      normalizeOrderPosition(position),
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
      yield* createProjectSection({
        sectionDraft: {
          projectId: newProject.id,
          title: "Inbox",
          id: yield* inboxProjectSectionId({}),
        },
        position: "append",
      });
    } else {
      yield* createProjectSection({
        sectionDraft: { projectId: newProject.id, title: "Week" },
        position: "append",
      });
      yield* createProjectSection({
        sectionDraft: { projectId: newProject.id, title: "Month" },
        position: "append",
      });
      yield* createProjectSection({
        sectionDraft: { projectId: newProject.id, title: "Ideas" },
        position: "append",
      });
    }

    return newProject;
  },
});

export const createInboxIfNotExists = action({
  name: "createInboxIfNotExists",
  args: {},
  handler: function* createInboxIfNotExists(): Generator<
    unknown,
    Project,
    unknown
  > {
    const inbox = yield* projectById({ id: yield* inboxProjectId({}) });
    if (inbox) {
      return inbox;
    }

    return yield* createProject({
      project: {
        id: yield* inboxProjectId({}),
        title: "Inbox",
        icon: "",
        isInbox: true,
        orderToken: generateJitteredKeyBetween(null, null),
        createdAt: new Date().getTime(),
      },
      position: [null, null],
    });
  },
});

export const updateProject = action({
  name: "updateProject",
  args: {
    id: v.string(),
    project: v.partial(projectsTable.v()),
  },
  handler: function* updateProject({
    id,
    project,
  }): Generator<unknown, void, unknown> {
    const projectInState = yield* projectById({ id });
    if (!projectInState) throw new Error("Project not found");

    yield* upsert(projectsTable, [{ ...projectInState, ...project }]);
  },
});

export const deleteProjects = action({
  name: "deleteProjects",
  args: { ids: v.array(v.string()) },
  handler: function* deleteProjects({
    ids,
  }): Generator<unknown, void, unknown> {
    const projectSections = yield* projectSectionsByProjectIds({
      projectIds: ids,
    });

    yield* deleteProjectSections({ ids: projectSections.map((c) => c.id) });
    yield* deleteRows(projectsTable, ids);
  },
});

export const projectHandleDrop = action({
  name: "projectHandleDrop",
  args: {
    projectId: v.string(),
    dropItemId: v.string(),
    dropModelType: possibleModelType,
    edge: v.union(v.literal("top"), v.literal("bottom")),
  },
  handler: function* projectHandleDrop({
    projectId,
    dropItemId,
    dropModelType,
    edge,
  }): Generator<unknown, void, unknown> {
    const canDropResult = yield* projectCanDrop({
      projectId,
      dropItemId,
      dropModelType,
    });
    if (!canDropResult) return;

    const project = yield* projectById({ id: projectId });
    if (!project) throw new Error("Project not found");

    const dropItem = yield* appById({
      id: dropItemId,
      modelType: dropModelType,
    });
    if (!dropItem) throw new Error("Target not found");

    if (isProject(dropItem)) {
      // Reorder projects - would need proper fractional indexing
      const [up, down] = yield* projectSiblings({ projectId: project.id });

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

      yield* updateProject({
        id: dropItem.id,
        project: { orderToken },
      });
    } else if (
      isTask(dropItem) ||
      isTaskTemplate(dropItem) ||
      isDailyEntry(dropItem)
    ) {
      const section = yield* firstProjectSectionChild({
        projectId: project.id,
      });
      if (!section) throw new Error("No sections found in project");

      const orderToken = yield* generateOrderTokenPositioned(
        section.id,
        {
          firstChild: (projectSectionId) =>
            firstProjectSectionItem({ projectSectionId }),
          lastChild: (projectSectionId) =>
            lastProjectSectionItem({ projectSectionId }),
        },
        edge === "top" ? "prepend" : "append",
      );

      // Move task/template to this project
      if (isTask(dropItem)) {
        yield* updateTask({
          id: dropItem.id,
          task: {
            projectSectionId: section.id,
            orderToken,
          },
        });
      } else if (isTaskTemplate(dropItem)) {
        yield* updateTemplate({
          id: dropItem.id,
          template: {
            projectSectionId: section.id,
            orderToken,
          },
        });
      } else if (isDailyEntry(dropItem)) {
        // When dropping a entry onto a project, move the underlying task
        const task = yield* taskById({ id: dropItem.taskId });
        if (task) {
          yield* updateTask({
            id: task.id,
            task: {
              projectSectionId: section.id,
              orderToken,
            },
          });
          // Keep the entry in the daily list
        }
      }
    } else {
      shouldNeverHappen("unknown drop item type", dropItem);
    }
  },
});

export const createProjectTask = action({
  name: "createProjectTask",
  args: {
    projectId: v.string(),
    position: orderPositionArg,
    taskAttrs: v.optional(v.partial(tasksTable.v())),
  },
  handler: function* createProjectTask({
    projectId,
    position,
    taskAttrs,
  }): Generator<unknown, Task, unknown> {
    const project = yield* projectById({ id: projectId });
    if (!project) throw new Error("Project not found");

    let projectSectionId = taskAttrs?.projectSectionId;
    if (projectSectionId) {
      const section = yield* projectSectionById({ id: projectSectionId });
      if (!section || section.projectId !== projectId) {
        throw new Error("Project section does not belong to project");
      }
    } else {
      const firstSection = yield* firstProjectSectionChild({ projectId });
      if (!firstSection) throw new Error("No sections found");
      projectSectionId = firstSection.id;
    }

    return yield* createTaskInSection({
      projectSectionId: projectSectionId,
      position,
      taskAttrs,
    });
  },
});

export const createProjectTaskIfNotExists = action({
  name: "createProjectTaskIfNotExists",
  args: {
    projectId: v.string(),
    taskId: v.string(),
    position: orderPositionArg,
    taskAttrs: v.optional(v.partial(tasksTable.v())),
  },
  handler: function* createProjectTaskIfNotExists({
    projectId,
    taskId,
    position,
    taskAttrs,
  }): Generator<unknown, Task, unknown> {
    const task = yield* taskById({ id: taskId });
    if (task) {
      return task;
    }

    return yield* createProjectTask({
      projectId,
      position,
      taskAttrs: {
        ...taskAttrs,
        id: taskId,
      },
    });
  },
});

// Local slice object for registerModelSlice (not exported)
const projectsSlice = {
  byId: projectById,
  delete: deleteProjects,
  canDrop: projectCanDrop,
  handleDrop: projectHandleDrop,
};
registerModelSlice(projectsSlice, projectsTable, projectType);
