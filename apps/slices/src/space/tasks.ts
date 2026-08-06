import { shouldNeverHappen } from "../utils";
import {
  deleteRows,
  insert,
  or,
  selectFrom,
  upsert,
  v,
} from "@will-be-done/hyperdb";
import { action, selector } from "../builders";
import { changeId, changesTable } from "../common";
import { generateJitteredKeyBetween } from "fractional-indexing-jittered";
import { uuidv7 } from "uuidv7";
import { appById, appDeleteModel } from "./app";
import {
  checklistItemCanDropOnParent,
  checklistItemHandleDropOnParent,
  copyItems,
  deleteForParents,
} from "./checklistItems";
import { deleteDailyEntries } from "./dailyEntries";
import { firstProjectSectionChild } from "./projectSections";
import { projectSectionItemSiblings } from "./projectSectionItems";
import { updateTemplate } from "./taskTemplates";
import { registerModelSlice } from "./maps";
import {
  taskType,
  dailyEntriesTable,
  tasksTable,
  taskTemplatesTable,
  possibleModelType,
  Task,
  isTask,
  isDailyEntry,
  isTaskTemplate,
} from "./tables";

export const defaultTask: Task = {
  type: taskType,
  projectSectionId: "abeee7aa-8bf4-4a5f-9167-ce42ad6187b6",
  id: "17748950-3b32-4893-8fa8-ccdb269f7c52",
  title: "default task",
  state: "todo",
  orderToken: "",
  lastToggledAt: 0,
  createdAt: 0,
  nature: "unknown",
  templateId: null,
  templateDate: null,
};

// Selectors and actions
export const taskById = selector({
  name: "taskById",
  args: { id: v.string() },
  handler: function* taskById({ id }) {
    const tasks = yield* selectFrom(tasksTable, "byId")
      .where((q) => q.eq("id", id))
      .limit(1);

    return tasks[0] as Task | undefined;
  },
});

export const taskExists = selector({
  name: "taskExists",
  args: { id: v.string() },
  handler: function* taskExists({ id }) {
    return !!(yield* taskById({ id }));
  },
});

export const preloadEntities = selector({
  name: "preloadEntities",
  args: {
    ids: v.array(v.string()),
    tableName: v.string(),
    preloadDailyEntries: v.boolean(),
  },
  handler: function* preloadEntities({ ids, tableName, preloadDailyEntries }) {
    if (ids.length === 0) return;

    yield* selectFrom(changesTable, "byId").where((q) =>
      or(...ids.map((id) => q.eq("id", changeId(tableName, id)))),
    );

    if (!preloadDailyEntries) return;

    yield* selectFrom(dailyEntriesTable, "byId").where((q) =>
      or(...ids.map((id) => q.eq("id", id))),
    );
  },
});

export const taskByIdOrDefault = selector({
  name: "taskByIdOrDefault",
  args: { id: v.string() },
  handler: function* taskByIdOrDefault({ id }) {
    return (yield* taskById({ id })) || defaultTask;
  },
});

export const taskIdsOfTemplateId = selector({
  name: "taskIdsOfTemplateId",
  args: { ids: v.array(v.string()) },
  handler: function* taskIdsOfTemplateId({ ids }) {
    const tasks = yield* selectFrom(tasksTable, "byTemplateId").where((q) =>
      ids.map((id) => q.eq("templateId", id)),
    );

    return tasks.map((t) => t.id);
  },
});

export const allTasks = selector({
  name: "allTasks",
  args: {},
  handler: function* allTasks() {
    const tasks = yield* selectFrom(
      tasksTable,
      "byProjectSectionIdOrderStates",
    );
    return tasks;
  },
});

export const tasksByIds = selector({
  name: "tasksByIds",
  args: { ids: v.array(v.string()) },
  handler: function* tasksByIds({ ids }) {
    if (ids.length === 0) return [];

    return (yield* selectFrom(tasksTable, "byId").where((q) =>
      ids.map((id) => q.eq("id", id)),
    )) as Task[];
  },
});

export const tasksPageByCreatedAt = selector({
  name: "tasksPageByCreatedAt",
  args: {
    cursorCreatedAt: v.union(v.number(), v.null()),
    cursorId: v.union(v.string(), v.null()),
    limit: v.number(),
  },
  handler: function* tasksPageByCreatedAt({
    cursorCreatedAt,
    cursorId,
    limit,
  }) {
    const query = selectFrom(tasksTable, "byCreatedAtId").order("desc");
    if (cursorCreatedAt === null || cursorId === null) {
      return (yield* query.limit(limit)) as Task[];
    }

    return (yield* query
      .where((q) => [
        q.lt("createdAt", cursorCreatedAt),
        q.eq("createdAt", cursorCreatedAt).lt("id", cursorId),
      ])
      .limit(limit)) as Task[];
  },
});

export const projectSectionTasksByState = selector({
  name: "projectSectionTasksByState",
  args: {
    projectSectionId: v.string(),
    state: v.union(v.literal("todo"), v.literal("done")),
  },
  handler: function* projectSectionTasksByState({ projectSectionId, state }) {
    if (state === "done") {
      return yield* selectFrom(tasksTable, "byProjectSectionIdStatesToggledAt")
        .where((q) =>
          q.eq("projectSectionId", projectSectionId).eq("state", state),
        )
        .order("desc");
    }

    return yield* selectFrom(tasksTable, "byProjectSectionIdOrderStates").where(
      (q) => q.eq("projectSectionId", projectSectionId).eq("state", state),
    );
  },
});

export const deleteTasks = action({
  name: "deleteTasks",
  args: { ids: v.array(v.string()) },
  handler: function* deleteTasks({ ids }): Generator<unknown, void, unknown> {
    yield* deleteForParents({
      parentIds: ids,
      parentType: taskType,
    });
    yield* deleteRows(tasksTable, ids);
    yield* deleteDailyEntries({ ids });
  },
});

export const updateTask = action({
  name: "updateTask",
  args: {
    id: v.string(),
    task: v.partial(tasksTable.v()),
  },
  handler: function* updateTask({ id, task }) {
    const taskInState = yield* taskById({ id });
    if (!taskInState) throw new Error("Task not found");

    yield* upsert(tasksTable, [{ ...taskInState, ...task }]);
  },
});

export const createTask = action({
  name: "createTask",
  args: {
    task: v.required(v.partial(tasksTable.v()), [
      "orderToken",
      "projectSectionId",
    ]),
  },
  handler: function* createTask({ task }) {
    const id = task.id || uuidv7();

    const newTask: Task = {
      type: taskType,
      id,
      title: "",
      state: "todo",
      lastToggledAt: Date.now(),
      createdAt: Date.now(),
      templateId: null,
      templateDate: null,
      ...task,
      nature: task.nature ?? "unknown",
    };

    yield* insert(tasksTable, [newTask]);

    return newTask;
  },
});

export const taskCanDrop = selector({
  name: "taskCanDrop",
  args: {
    taskId: v.string(),
    dropId: v.string(),
    dropModelType: possibleModelType,
  },
  handler: function* taskCanDrop({ taskId, dropId, dropModelType }) {
    const model = yield* appById({
      id: dropId,
      modelType: dropModelType,
    });
    if (!model) return false;

    const task = yield* taskById({ id: taskId });
    if (!task) return false;

    if (task.state === "done") {
      return false;
    }

    if (isTask(model) && model.state === "done") {
      return false;
    }

    if (isDailyEntry(model)) {
      const droppedTask = yield* taskById({ id: model.id });
      return droppedTask !== undefined && droppedTask.state === "todo";
    }

    if (
      yield* checklistItemCanDropOnParent({
        parentId: taskId,
        parentType: taskType,
        dropId,
        dropModelType,
      })
    ) {
      return true;
    }

    return isTask(model) || isTaskTemplate(model);
  },
});

export const taskHandleDrop = action({
  name: "taskHandleDrop",
  args: {
    taskId: v.string(),
    dropId: v.string(),
    dropModelType: possibleModelType,
    edge: v.union(v.literal("top"), v.literal("bottom")),
  },
  handler: function* taskHandleDrop({
    taskId,
    dropId,
    dropModelType,
    edge,
  }): Generator<unknown, void, unknown> {
    if (
      !(yield* taskCanDrop({
        taskId,
        dropId,
        dropModelType,
      }))
    )
      return;

    const task = yield* taskById({ id: taskId });
    if (!task) return shouldNeverHappen("task not found");

    const dropItem = yield* appById({
      id: dropId,
      modelType: dropModelType,
    });
    if (!dropItem) return shouldNeverHappen("drop item not found");

    const [up, down] = yield* projectSectionItemSiblings({ itemId: taskId });

    let between: [string | undefined, string | undefined] = [
      task.orderToken,
      down?.orderToken,
    ];

    if (edge == "top") {
      between = [up?.orderToken, task.orderToken];
    }

    const orderToken = generateJitteredKeyBetween(
      between[0] || null,
      between[1] || null,
    );

    if (isTask(dropItem)) {
      yield* updateTask({
        id: dropItem.id,
        task: {
          projectSectionId: task.projectSectionId,
          orderToken: orderToken,
        },
      });
    } else if (isTaskTemplate(dropItem)) {
      yield* updateTemplate({
        id: dropItem.id,
        template: {
          projectSectionId: task.projectSectionId,
          orderToken: orderToken,
        },
      });
    } else if (isDailyEntry(dropItem)) {
      // When dropping a entry onto a task, move the underlying task
      const droppedTask = yield* taskById({ id: dropItem.id });
      if (droppedTask) {
        yield* updateTask({
          id: droppedTask.id,
          task: {
            projectSectionId: task.projectSectionId,
            orderToken: orderToken,
          },
        });
        // Keep the entry in the daily list
      }
    } else if (
      yield* checklistItemCanDropOnParent({
        parentId: taskId,
        parentType: taskType,
        dropId,
        dropModelType,
      })
    ) {
      yield* checklistItemHandleDropOnParent({
        parentId: taskId,
        parentType: taskType,
        dropId,
        dropModelType,
        edge,
      });
    } else {
      shouldNeverHappen("unknown drop item type", dropItem);
    }
  },
});

export const moveTaskToProject = action({
  name: "moveTaskToProject",
  args: {
    taskId: v.string(),
    projectId: v.string(),
  },
  handler: function* moveTaskToProject({
    taskId,
    projectId,
  }): Generator<unknown, void, unknown> {
    const task = yield* taskById({ id: taskId });
    if (!task) throw new Error("Task not found");

    const firstSection = yield* firstProjectSectionChild({ projectId });
    if (!firstSection) throw new Error("No sections found");

    yield* upsert(tasksTable, [
      {
        ...task,
        projectSectionId: firstSection.id,
      },
    ]);
  },
});

export const toggleTaskState = action({
  name: "toggleTaskState",
  args: { taskId: v.string() },
  handler: function* toggleTaskState({ taskId }: { taskId: string }) {
    const task = yield* taskById({ id: taskId });
    if (!task) throw new Error("Task not found");

    yield* upsert(tasksTable, [
      {
        ...task,
        state: task.state === "todo" ? "done" : "todo",
        lastToggledAt: Date.now(),
      },
    ]);
  },
});

export const createTaskFromTemplate = action({
  name: "createTaskFromTemplate",
  args: { taskTemplate: taskTemplatesTable.v() },
  handler: function* createTaskFromTemplate({ taskTemplate }) {
    const newId = uuidv7();
    yield* copyItems({
      fromParentId: taskTemplate.id,
      fromParentType: "template",
      toParentId: newId,
      toParentType: taskType,
    });
    yield* appDeleteModel({
      id: taskTemplate.id,
      modelType: taskTemplate.type,
    });

    const newTask: Task = {
      id: newId,
      title: taskTemplate.title,
      state: "todo",
      projectSectionId: taskTemplate.projectSectionId,
      type: taskType,
      orderToken: taskTemplate.orderToken,
      lastToggledAt: Date.now(),
      nature: taskTemplate.nature ?? "unknown",
      createdAt: taskTemplate.createdAt,
      content: taskTemplate.content,
      templateId: null,
      templateDate: null,
    };
    yield* insert(tasksTable, [newTask]);

    return newTask;
  },
});

export const deleteTasksByIds = action({
  name: "deleteTasksByIds",
  args: { ids: v.array(v.string()) },
  handler: function* deleteTasksByIds({ ids }) {
    yield* deleteTasks({ ids });
  },
});

export const deleteTaskById = action({
  name: "deleteTaskById",
  args: { id: v.string() },
  handler: function* deleteTaskById({ id }) {
    yield* deleteTasks({ ids: [id] });
  },
});

// Local slice object for registerModelSlice (not exported)
const tasksSlice = {
  byId: taskById,
  delete: deleteTasks,
  canDrop: taskCanDrop,
  handleDrop: taskHandleDrop,
};
registerModelSlice(tasksSlice, tasksTable, taskType);
