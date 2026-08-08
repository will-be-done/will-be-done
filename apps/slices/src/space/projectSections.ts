import {
  deleteRows,
  insert,
  selectFrom,
  upsert,
  v,
} from "@will-be-done/hyperdb";
import { action, selector } from "../builders";
import {
  generateOrderTokenPositioned,
  normalizeOrderPosition,
  orderPositionArg,
} from "./utils";
import { registerModelSlice } from "./maps";
import { uuidv7 } from "uuidv7";
import { appById } from "./app";
import { deleteItemsByIds } from "./items";
import {
  firstProjectSectionItem,
  lastProjectSectionItem,
  projectSectionItemByIdOrDefault,
  projectSectionItemIds,
} from "./projectSectionItems";
import { projectById, projectByIdOrDefault } from "./projects";
import { createTask, taskById, updateTask } from "./tasks";
import { updateTemplate } from "./taskTemplates";
import { defaultProject } from "./projects";
import { noop } from "@will-be-done/hyperdb";
import { generateJitteredKeyBetween } from "fractional-indexing-jittered";
import { genUUIDV5 } from "../traits";
import {
  projectSectionType,
  projectSectionsTable,
  ProjectSection,
  tasksTable,
  Task,
  possibleModelType,
  Project,
  isTask,
  isTaskTemplate,
  isDailyEntry,
  taskTemplatesTable,
} from "./tables";

export const defaultProjectSection: ProjectSection = {
  type: projectSectionType,
  id: "abeee7aa-8bf4-4a5f-9167-ce42ad6187b6",
  title: "",
  projectId: "",
  orderToken: "",
  createdAt: 0,
};

export const projectSectionById = selector({
  name: "projectSectionById",
  args: { id: v.string() },
  handler: function* projectSectionById({ id }) {
    const tasks = yield* selectFrom(projectSectionsTable, "byId")
      .where((q) => q.eq("id", id))
      .limit(1);

    return tasks[0] as ProjectSection | undefined;
  },
});

export const projectSectionByIdOrDefault = selector({
  name: "projectSectionByIdOrDefault",
  args: { id: v.string() },
  handler: function* projectSectionByIdOrDefault({ id }) {
    return (yield* projectSectionById({ id })) || defaultProjectSection;
  },
});

export const allProjectSections = selector({
  name: "allProjectSections",
  args: {},
  handler: function* allProjectSections() {
    const tasks = yield* selectFrom(
      projectSectionsTable,
      "byProjectIdOrderToken",
    );
    return tasks;
  },
});

export const inboxProjectSectionId = selector({
  name: "inboxProjectSectionId",
  args: {},
  handler: function* inboxProjectSectionId() {
    // Keep the historical UUID namespace stable so existing inbox sections
    // retain their identity after the ProjectCategory -> ProjectSection rename.
    return yield* genUUIDV5("projectCategory", "inbox");
  },
});

export const projectSectionsByProjectIds = selector({
  name: "projectSectionsByProjectIds",
  args: { projectIds: v.array(v.string()) },
  handler: function* projectSectionsByProjectIds({ projectIds }) {
    const sections = yield* selectFrom(
      projectSectionsTable,
      "byProjectIdOrderToken",
    ).where((q) => projectIds.map((id) => q.eq("projectId", id)));
    return sections;
  },
});

export const projectSectionsByProjectId = selector({
  name: "projectSectionsByProjectId",
  args: { projectId: v.string() },
  handler: function* projectSectionsByProjectId({ projectId }) {
    return yield* projectSectionsByProjectIds({ projectIds: [projectId] });
  },
});

export const projectOfProjectSection = selector({
  name: "projectOfProjectSection",
  args: { projectSectionId: v.string() },
  handler: function* projectOfProjectSection({
    projectSectionId,
  }): Generator<unknown, Project | undefined, unknown> {
    const section = yield* projectSectionById({ id: projectSectionId });
    if (!section) return undefined;

    return yield* projectById({ id: section.projectId });
  },
});

export const projectOfProjectSectionOrDefault = selector({
  name: "projectOfProjectSectionOrDefault",
  args: { projectSectionId: v.string() },
  handler: function* projectOfProjectSectionOrDefault({
    projectSectionId,
  }): Generator<unknown, Project, unknown> {
    const section = yield* projectSectionById({ id: projectSectionId });
    if (!section) return defaultProject;

    return yield* projectByIdOrDefault({ id: section.projectId });
  },
});

export const firstProjectSectionChild = selector({
  name: "firstProjectSectionChild",
  args: { projectId: v.string() },
  handler: function* firstProjectSectionChild({ projectId }) {
    return (yield* projectSectionsByProjectId({ projectId }))[0] as
      | ProjectSection
      | undefined;
  },
});

export const lastProjectSectionChild = selector({
  name: "lastProjectSectionChild",
  args: { projectId: v.string() },
  handler: function* lastProjectSectionChild({ projectId }) {
    const result = yield* projectSectionsByProjectId({ projectId });
    if (result.length === 0) return undefined as ProjectSection | undefined;

    return result[result.length - 1] as ProjectSection | undefined;
  },
});

export const updateProjectSection = action({
  name: "updateProjectSection",
  args: {
    projectSectionId: v.string(),
    section: v.partial(projectSectionsTable.v()),
  },
  handler: function* updateProjectSection({
    projectSectionId,
    section,
  }): Generator<unknown, void, unknown> {
    const sectionInState = yield* projectSectionById({ id: projectSectionId });
    if (!sectionInState) throw new Error("Section not found");

    yield* upsert(projectSectionsTable, [{ ...sectionInState, ...section }]);
  },
});

export const projectSectionSiblings = selector({
  name: "projectSectionSiblings",
  args: { projectSectionId: v.string() },
  handler: function* projectSectionSiblings({ projectSectionId }) {
    const item = yield* projectSectionById({ id: projectSectionId });
    if (!item)
      return [undefined, undefined] as [
        ProjectSection | undefined,
        ProjectSection | undefined,
      ];

    const sortedProjectSections = yield* selectFrom(
      projectSectionsTable,
      "byProjectIdOrderToken",
    ).where((q) => q.eq("projectId", item.projectId));

    const index = sortedProjectSections.findIndex(
      (p) => p.id === projectSectionId,
    );

    const beforeId =
      index > 0 ? sortedProjectSections[index - 1].id : undefined;
    const afterId =
      index < sortedProjectSections.length - 1
        ? sortedProjectSections[index + 1].id
        : undefined;

    const before = beforeId
      ? yield* projectSectionByIdOrDefault({ id: beforeId })
      : undefined;
    const after = afterId
      ? yield* projectSectionByIdOrDefault({ id: afterId })
      : undefined;

    return [before, after] as [
      ProjectSection | undefined,
      ProjectSection | undefined,
    ];
  },
});

export const moveLeft = action({
  name: "moveLeft",
  args: { projectSectionId: v.string() },
  handler: function* moveLeft({
    projectSectionId,
  }): Generator<unknown, void, unknown> {
    const [up] = yield* projectSectionSiblings({ projectSectionId });
    const [up2] = up
      ? yield* projectSectionSiblings({ projectSectionId: up?.id })
      : [undefined, undefined];

    if (!up) return;

    yield* updateProjectSection({
      projectSectionId,
      section: {
        orderToken: generateJitteredKeyBetween(
          up2?.orderToken || null,
          up.orderToken,
        ),
      },
    });
  },
});

export const moveRight = action({
  name: "moveRight",
  args: { projectSectionId: v.string() },
  handler: function* moveRight({
    projectSectionId,
  }): Generator<unknown, void, unknown> {
    const [_up, down] = yield* projectSectionSiblings({ projectSectionId });
    const [_up2, down2] = down
      ? yield* projectSectionSiblings({ projectSectionId: down?.id })
      : [undefined, undefined];

    if (!down) return;

    yield* updateProjectSection({
      projectSectionId,
      section: {
        orderToken: generateJitteredKeyBetween(
          down.orderToken,
          down2?.orderToken || null,
        ),
      },
    });
  },
});

export const createProjectSection = action({
  name: "createProjectSection",
  args: {
    sectionDraft: v.required(v.partial(projectSectionsTable.v()), [
      "title",
      "projectId",
    ]),
    position: orderPositionArg,
  },
  handler: function* createProjectSection({
    sectionDraft,
    position,
  }): Generator<unknown, ProjectSection, unknown> {
    const orderToken = yield* generateOrderTokenPositioned(
      sectionDraft.projectId,
      {
        firstChild: (projectId) => firstProjectSectionChild({ projectId }),
        lastChild: (projectId) => lastProjectSectionChild({ projectId }),
      },
      normalizeOrderPosition(position),
    );

    const id = sectionDraft.id || uuidv7();

    const section: ProjectSection = {
      type: projectSectionType,
      id,
      title: sectionDraft.title,
      projectId: sectionDraft.projectId,
      orderToken: orderToken,
      createdAt: Date.now(),
    };

    yield* insert(projectSectionsTable, [section]);

    return section;
  },
});

export const createTaskInSection = action({
  name: "createTaskInSection",
  args: {
    projectSectionId: v.string(),
    position: orderPositionArg,
    taskAttrs: v.optional(v.partial(tasksTable.v())),
  },
  handler: function* createTaskInSection({
    projectSectionId,
    position,
    taskAttrs,
  }): Generator<unknown, Task, unknown> {
    const orderToken = yield* generateOrderTokenPositioned(
      projectSectionId,
      {
        firstChild: (projectSectionId) =>
          firstProjectSectionItem({ projectSectionId }),
        lastChild: (projectSectionId) =>
          lastProjectSectionItem({ projectSectionId }),
      },
      normalizeOrderPosition(position),
    );

    return yield* createTask({
      task: {
        ...taskAttrs,
        orderToken: orderToken,
        projectSectionId: projectSectionId,
      },
    });
  },
});

export const deleteProjectSections = action({
  name: "deleteProjectSections",
  args: { ids: v.array(v.string()) },
  handler: function* deleteProjectSections({
    ids,
  }): Generator<unknown, void, unknown> {
    const idsToDelete: string[] = [];

    for (const projectSectionId of ids) {
      const templatesIds = (yield* selectFrom(
        taskTemplatesTable,
        "byProjectSectionIdOrderStates",
      ).where((q) => q.eq("projectSectionId", projectSectionId))).map(
        (t) => t.id,
      );

      const taskIds = (yield* selectFrom(
        tasksTable,
        "byProjectSectionIdOrderStates",
      ).where((q) =>
        q.eq("projectSectionId", projectSectionId).eq("state", "todo"),
      )).map((t) => t.id);

      const doneTaskIds = (yield* selectFrom(
        tasksTable,
        "byProjectSectionIdOrderStates",
      ).where((q) =>
        q.eq("projectSectionId", projectSectionId).eq("state", "done"),
      )).map((t) => t.id);

      idsToDelete.push(...templatesIds);
      idsToDelete.push(...taskIds);
      idsToDelete.push(...doneTaskIds);
    }

    if (idsToDelete.length > 0) {
      yield* deleteItemsByIds({ ids: idsToDelete });
    }

    yield* deleteRows(projectSectionsTable, ids);
  },
});

export const projectSectionHandleDrop = action({
  name: "projectSectionHandleDrop",
  args: {
    projectSectionId: v.string(),
    dropId: v.string(),
    dropModelType: possibleModelType,
    edge: v.union(v.literal("top"), v.literal("bottom")),
  },
  handler: function* projectSectionHandleDrop({
    projectSectionId,
    dropId,
    dropModelType,
    edge,
  }): Generator<unknown, void, unknown> {
    const dropItem = yield* appById({
      id: dropId,
      modelType: dropModelType,
    });
    if (!dropItem) return;

    const childrenIds = yield* projectSectionItemIds({
      projectSectionId: projectSectionId,
    });
    let orderToken: string;
    if (childrenIds.length === 0) {
      orderToken = generateJitteredKeyBetween(null, null);
    } else if (edge === "top") {
      const first = yield* projectSectionItemByIdOrDefault({
        id: childrenIds[0],
      });
      orderToken = generateJitteredKeyBetween(null, first.orderToken || null);
    } else {
      const last = yield* projectSectionItemByIdOrDefault({
        id: childrenIds[childrenIds.length - 1],
      });
      orderToken = generateJitteredKeyBetween(last.orderToken || null, null);
    }

    if (isTask(dropItem)) {
      yield* updateTask({
        id: dropItem.id,
        task: {
          projectSectionId: projectSectionId,
          orderToken,
        },
      });
    } else if (isTaskTemplate(dropItem)) {
      yield* updateTemplate({
        id: dropItem.id,
        template: {
          projectSectionId: projectSectionId,
          orderToken,
        },
      });
    } else if (isDailyEntry(dropItem)) {
      // When dropping a entry onto a section, move the underlying task
      const task = yield* taskById({ id: dropItem.taskId });
      if (task) {
        yield* updateTask({
          id: task.id,
          task: {
            projectSectionId: projectSectionId,
            orderToken,
          },
        });
        // Keep the entry in the daily list
      }
    }
  },
});

export const projectSectionCanDrop = selector({
  name: "projectSectionCanDrop",
  args: {
    _projectSectionId: v.string(),
    dropId: v.string(),
    dropModelType: possibleModelType,
  },
  handler: function* projectSectionCanDrop({
    _projectSectionId,
    dropId,
    dropModelType,
  }): Generator<unknown, boolean, unknown> {
    yield* noop();

    const dropItem = yield* appById({
      id: dropId,
      modelType: dropModelType,
    });
    if (!dropItem) return false;

    if (isTask(dropItem) || isTaskTemplate(dropItem)) {
      return true;
    }

    if (isDailyEntry(dropItem)) {
      const task = yield* taskById({ id: dropItem.taskId });
      return task !== undefined && task.state === "todo";
    }

    return false;
  },
});

const projectSectionsSlice = {
  byId: projectSectionById,
  delete: deleteProjectSections,
  handleDrop: projectSectionHandleDrop,
  canDrop: projectSectionCanDrop,
};

registerModelSlice(
  projectSectionsSlice,
  projectSectionsTable,
  projectSectionType,
);
