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
import {
  cardsTasksSlice,
  taskType,
  dailyListsProjectionsSlice,
  projectCategoriesSlice,
  projectCategoryCardsSlice,
} from ".";
import { type Task } from "./cardsTasks";
import { registerSpaceSyncableTable } from "./syncMap";
import { registerModelSlice } from "./maps";
import { noop } from "@will-be-done/hyperdb/src/hyperdb/generators";
import { genUUIDV5 } from "../traits/";
import { getDMY } from "./utils";

// Type definitions
export const taskTemplateType = "template";

export type TaskTemplate = {
  type: typeof taskTemplateType;
  id: string;
  title: string;
  orderToken: string;
  repeatRule: string;
  repeatRuleDtStart: number;
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
  repeatRule: "",
  repeatRuleDtStart: 0,
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
const genTaskId = selector(function* (
  taskTemplateId: string,
  date: Date,
  normalized: boolean,
) {
  const epoch = getDateEpoch(date, normalized);
  return yield* genUUIDV5(taskType, taskTemplateId + "_" + epoch);
});

const templateToTask = selector(function* (
  tmpl: TaskTemplate,
  date: Date,
  normalized: boolean,
) {
  const epoch = getDateEpoch(date, normalized);
  return {
    type: "task",
    id: yield* genTaskId(tmpl.id, date, normalized),
    title: tmpl.title,
    state: "todo",
    projectCategoryId: tmpl.projectCategoryId,
    orderToken: tmpl.orderToken,
    lastToggledAt: epoch,
    createdAt: epoch,
    templateId: tmpl.id,
    templateDate: epoch,
  } satisfies Task;
});

// RRule utility functions
function toUTC(date: Date): Date {
  const timezoneOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - timezoneOffset);
}

function fromUTC(date: Date): Date {
  const timezoneOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() + timezoneOffset);
}

const defaultRule = "FREQ=DAILY;INTERVAL=1";
const MAX_GENERATION_WINDOW_MS = 14 * 24 * 60 * 60 * 1000; // 2 weeks

/** Get the dtstart epoch for a template, falling back to createdAt for legacy templates */
function getTemplateDtStart(template: TaskTemplate): number {
  return template.repeatRuleDtStart || template.createdAt;
}

function createRuleFromString(ruleString: string): RRule {
  return RRule.fromString(ruleString.trim());
}

function createRuleWithDtstart(ruleString: string, dtstart: Date): RRule {
  const options = RRule.parseString(ruleString.trim());
  return new RRule({ ...options, dtstart });
}

/** Returns true for DAILY, WEEKLY, MONTHLY, YEARLY frequencies */
function isDailyOrCoarser(ruleString: string): boolean {
  const options = RRule.parseString(ruleString.trim());
  return options.freq !== undefined && options.freq <= RRule.DAILY;
}

/**
 * For daily-or-coarser rules, normalize dtstart to midnight in the abstract
 * RRule space so that occurrences fall at day start (00:00 local).
 */
function getEffectiveDtstart(template: TaskTemplate): Date {
  const dtstart = toUTC(new Date(getTemplateDtStart(template)));
  if (isDailyOrCoarser(template.repeatRule)) {
    dtstart.setUTCHours(0, 0, 0, 0);
  }
  return dtstart;
}

/**
 * Get a deterministic epoch from an RRule date.
 * For daily+ rules (normalized to midnight): date.getTime() is already
 * identical across timezones because normalization produces the same abstract date.
 * For sub-daily rules: fromUTC restores the original UTC epoch via toUTC/fromUTC symmetry.
 */
function getDateEpoch(date: Date, normalized: boolean): number {
  return normalized ? date.getTime() : fromUTC(date).getTime();
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
  return createRuleFromString(template.repeatRule);
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
    const normalized = isDailyOrCoarser(template.repeatRule);
    const r = createRuleWithDtstart(
      template.repeatRule,
      getEffectiveDtstart(template),
    );
    const dates = r.between(fromDate, toDate);
    for (const date of dates) {
      const taskId = yield* genTaskId(template.id, date, normalized);
      const existingTask = yield* cardsTasksSlice.byId(taskId);
      if (!existingTask) {
        newTasks.push(yield* templateToTask(template, date, normalized));
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

  const shouldNormalize = isDailyOrCoarser(template.repeatRule);
  const effectiveDtstart = getEffectiveDtstart(template);
  const r = createRuleWithDtstart(template.repeatRule, effectiveDtstart);
  const newTasks: Task[] = [];

  // Cap generation window to 2 weeks to avoid generating thousands of tasks
  const earliestFrom = Math.max(
    template.lastGeneratedAt,
    toDate.getTime() - MAX_GENERATION_WINDOW_MS,
  );

  let fromDateShifted = toUTC(new Date(earliestFrom));
  const toDateShifted = toUTC(toDate);

  if (shouldNormalize) {
    // For daily+ rules with midnight-normalized dtstart, floor fromDateShifted
    // to midnight in abstract space. This ensures today's midnight occurrence
    // is within the between() window even if lastGeneratedAt was set after
    // midnight (e.g. from a previous run or pre-migration code).
    fromDateShifted = new Date(fromDateShifted);
    fromDateShifted.setUTCHours(0, 0, 0, 0);
    // Don't go before the effective dtstart
    if (fromDateShifted < effectiveDtstart) {
      fromDateShifted = new Date(effectiveDtstart.getTime());
    }
  }

  // Use inc=true for normalized rules so midnight boundary occurrences are included
  const dates = shouldNormalize
    ? r.between(fromDateShifted, toDateShifted, true)
    : r.between(fromDateShifted, toDateShifted);

  for (const date of dates) {
    const taskId = yield* genTaskId(template.id, date, shouldNormalize);
    const existingTask = yield* cardsTasksSlice.byId(taskId);
    if (!existingTask) {
      newTasks.push(yield* templateToTask(template, date, shouldNormalize));
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

  const now = Date.now();
  const newTemplate: TaskTemplate = {
    type: taskTemplateType,
    id,
    title: "New template",
    repeatRule: defaultRule,
    repeatRuleDtStart: now,
    createdAt: now,
    lastGeneratedAt: now,
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
  const now = Date.now();
  const template: TaskTemplate = {
    id: newId,
    type: taskTemplateType,
    title: task.title,
    orderToken: task.orderToken,
    createdAt: task.createdAt,
    repeatRule: defaultRule,
    repeatRuleDtStart: now,
    lastGeneratedAt: now,
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
    if (task.templateId === null) {
      throw new Error("TemplateId is null");
    }

    // Create task card after the template card in the project category
    yield* projectCategoryCardsSlice.createTaskCardAfter(task.templateId, {
      ...task,
    });

    // Create projection at top of daily list for the task's date
    const localDate = fromUTC(new Date(task.createdAt));
    const dmy = getDMY(localDate);
    yield* dailyListsProjectionsSlice.createProjectionInDailyList(task.id, dmy);
  }

  const templateIdsToUpdate = new Set(
    newTasks.filter((t) => t.templateId !== null).map((t) => t.templateId!),
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
