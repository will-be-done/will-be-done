import { isObjectType } from "../utils";
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
import { uuidv7 } from "uuidv7";
import { RRule } from "rrule";
import { cardsTasksSlice } from ".";
import { type Task, tasksTable } from "./cardsTasks";
import { registerSpaceSyncableTable } from "./syncMap";
import { registerModelSlice } from "./maps";
import { noop } from "@will-be-done/hyperdb/src/hyperdb/generators";
import { projectCategoriesSlice } from ".";

// Type definitions
export const taskTemplateType = "template";

export type TaskTemplate = {
  type: typeof taskTemplateType;
  id: string;
  title: string;
  orderToken: string;
  horizon: "week" | "month" | "year" | "someday";
  repeatRule: string;
  createdAt: number;
  lastGeneratedAt: number;
  projectCategoryId: string;
};

export const isTaskTemplate = isObjectType<TaskTemplate>(taskTemplateType);

export const defaultTaskTemplate: TaskTemplate = {
  type: taskTemplateType,
  id: "default-template-id",
  title: "default template",
  orderToken: "",
  horizon: "someday",
  repeatRule: "",
  createdAt: 0,
  lastGeneratedAt: 0,
  projectCategoryId: "abeee7aa-8bf4-4a5f-9167-ce42ad6187b6",
};

// Table definition
export const taskTemplatesTable = table<TaskTemplate>(
  "task_templates",
).withIndexes({
  byId: { cols: ["id"], type: "hash" },
  byIds: { cols: ["id"], type: "btree" },
  byCategoryIdOrderStates: {
    cols: ["projectCategoryId", "orderToken"],
    type: "btree",
  },
});
registerSpaceSyncableTable(taskTemplatesTable, taskTemplateType);

// Template utility functions
const getId = selector(function* (taskTemplateId: string, date: Date) {
  return taskTemplateId + "_" + date.getTime();
});

const templateToTask = selector(function* (tmpl: TaskTemplate, date: Date) {
  return {
    type: "task",
    id: yield* getId(tmpl.id, date),
    title: tmpl.title,
    state: "todo",
    projectCategoryId: tmpl.projectCategoryId,
    orderToken: tmpl.orderToken,
    lastToggledAt: date.getTime(),
    horizon: tmpl.horizon,
    createdAt: date.getTime(),
    templateId: tmpl.id,
    templateDate: date.getTime(),
  } satisfies Task;
});

// RRule utility functions
function toUTC(date: Date): Date {
  const timezoneOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - timezoneOffset);
}

function startOfDay(date: Date): Date {
  const newDate = new Date(date);
  newDate.setHours(0, 0, 0, 0);
  return newDate;
}

const defaultRule = "FREQ=DAILY;INTERVAL=1";

function createRuleFromString(ruleString: string): RRule {
  try {
    return RRule.fromString(ruleString.trim());
  } catch (err: unknown) {
    console.log(err);
    // Fallback to daily rule if parsing fails
    return RRule.fromString(defaultRule);
  }
}

// Selectors
export const allIds = selector(function* () {
  const templates = yield* runQuery(
    selectFrom(taskTemplatesTable, "byIds").where((q) => q),
  );
  return templates.map((p) => p.id);
});

export const byId = selector(function* (id: string) {
  const templates = yield* runQuery(
    selectFrom(taskTemplatesTable, "byId")
      .where((q) => q.eq("id", id))
      .limit(1),
  );
  return templates[0] as TaskTemplate | undefined;
});

export const byIdOrDefault = selector(function* (id: string) {
  const templates = yield* runQuery(
    selectFrom(taskTemplatesTable, "byId")
      .where((q) => q.eq("id", id))
      .limit(1),
  );
  return (templates[0] as TaskTemplate | undefined) ?? defaultTaskTemplate;
});

export const all = selector(function* () {
  const templates = yield* runQuery(
    selectFrom(taskTemplatesTable, "byCategoryIdOrderStates"),
  );
  return templates;
});

export const ids = selector(function* () {
  const templates = yield* all();
  return templates.map((t) => t.id);
});

export const rule = selector(function* (id: string) {
  const template = yield* byIdOrDefault(id);
  return createRuleFromString(template.repeatRule || defaultRule);
});

export const ruleText = selector(function* (id: string) {
  const r = yield* rule(id);
  return r.toText();
});

export const newTasksInRange = selector(function* (
  fromDate: Date,
  toDate: Date,
) {
  const templates = yield* all();
  const newTasks: Task[] = [];

  for (const template of templates) {
    const r = yield* rule(template.id);
    const dates = r.between(fromDate, toDate);
    for (const date of dates) {
      const taskId = yield* getId(template.id, date);
      const existingTask = yield* cardsTasksSlice.byId(taskId);
      if (!existingTask) {
        newTasks.push(yield* templateToTask(template, date));
      }
    }
  }

  return newTasks;
});

export const newTasksToGenForTemplate = selector(function* (
  templateId: string,
  toDate: Date,
) {
  const template = yield* byId(templateId);
  if (!template) return [];

  const r = yield* rule(templateId);
  const newTasks: Task[] = [];

  const dates = r.between(
    toUTC(new Date(template.lastGeneratedAt)),
    toUTC(toDate),
  );
  for (const date of dates) {
    const taskId = yield* getId(template.id, date);
    const existingTask = yield* cardsTasksSlice.byId(taskId);
    if (!existingTask) {
      newTasks.push(yield* templateToTask(template, date));
    }
  }

  return newTasks;
});

export const newTasksToGenForTemplates = selector(function* (toDate: Date) {
  const templateIds = yield* ids();
  const newTasks: Task[] = [];

  for (const templateId of templateIds) {
    const tasks = yield* newTasksToGenForTemplate(templateId, toDate);
    newTasks.push(...tasks);
  }

  return newTasks;
});

export const canDrop = selector(function* (
  _taskTemplateId: string,
  _dropId: string,
  _dropModelType: string,
) {
  yield* noop();
  return false;
});

// Actions
export const create = action(function* (
  template: Partial<TaskTemplate> & {
    orderToken: string;
    projectCategoryId: string;
  },
) {
  const id = template.id || uuidv7();

  const newTemplate: TaskTemplate = {
    type: taskTemplateType,
    id,
    title: "New template",
    horizon: "week",
    repeatRule: defaultRule,
    createdAt: Date.now(),
    lastGeneratedAt: Date.now(),
    ...template,
  };

  yield* insert(taskTemplatesTable, [newTemplate]);
  return newTemplate;
});

export const updateTemplate = action(function* (
  id: string,
  template: Partial<TaskTemplate>,
) {
  const templateInState = yield* byId(id);
  if (!templateInState) throw new Error("Template not found");

  yield* update(taskTemplatesTable, [{ ...templateInState, ...template }]);
  return templateInState;
});

export const deleteTemplates = action(function* (ids: string[]) {
  const taskIds = yield* cardsTasksSlice.taskIdsOfTemplateId(ids);
  for (const tId of taskIds) {
    yield* cardsTasksSlice.updateTask(tId, {
      templateId: null,
      templateDate: null,
    });
  }
  yield* deleteRows(taskTemplatesTable, ids);
});

export const createFromTask = action(function* (
  task: Task,
  data: Partial<TaskTemplate>,
) {
  yield* cardsTasksSlice.deleteTasks([task.id]);

  const newId = uuidv7();
  const template: TaskTemplate = {
    id: newId,
    type: taskTemplateType,
    title: task.title,
    orderToken: task.orderToken,
    createdAt: task.createdAt,
    repeatRule: defaultRule,
    horizon: task.horizon,
    lastGeneratedAt: startOfDay(new Date(task.createdAt)).getTime() - 1,
    projectCategoryId: task.projectCategoryId,
    ...data,
  };

  yield* insert(taskTemplatesTable, [template]);
  return template;
});

export const handleDrop = action(function* (
  _taskTemplateId: string,
  _dropId: string,
  _dropModelType: string,
  _edge: "top" | "bottom",
) {
  yield* noop();
});

export const generateTasksFromTemplates = action(function* () {
  const toDate = new Date();
  const newTasks = yield* newTasksToGenForTemplates(toDate);

  for (const task of newTasks) {
    yield* insert(tasksTable, [task]);
  }

  const templateIdsToUpdate = new Set(
    newTasks.filter((t) => t.templateId).map((t) => t.templateId!),
  );
  for (const templateId of templateIdsToUpdate) {
    yield* updateTemplate(templateId, { lastGeneratedAt: toDate.getTime() });
  }
});

export const cleanAll = action(function* () {
  const templates = yield* all();
  for (const template of templates) {
    yield* deleteRows(taskTemplatesTable, [template.id]);
  }
});

export const moveTemplateToProject = action(function* (
  templateId: string,
  projectId: string,
) {
  const template = yield* byId(templateId);
  if (!template) throw new Error("Template not found");

  const firstCategory = yield* projectCategoriesSlice.firstChild(projectId);
  if (!firstCategory) throw new Error("No categories found");

  yield* updateTemplate(templateId, {
    projectCategoryId: firstCategory.id,
  });
});

// Local slice object for registerModelSlice (not exported)
const cardsTaskTemplatesSlice = {
  allIds,
  byId,
  byIdOrDefault,
  all,
  ids,
  rule,
  ruleText,
  newTasksInRange,
  newTasksToGenForTemplate,
  newTasksToGenForTemplates,
  canDrop,
  create,
  update: updateTemplate,
  delete: deleteTemplates,
  createFromTask,
  handleDrop,
  cleanAll,
  moveTemplateToProject,
  generateTasksFromTemplates,
};

registerModelSlice(
  cardsTaskTemplatesSlice,
  taskTemplatesTable,
  taskTemplateType,
);
