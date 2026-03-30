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
  epoch: number,
) {
  return yield* genUUIDV5(taskType, taskTemplateId + "_" + epoch);
});

const templateToTask = selector(function* (
  tmpl: TaskTemplate,
  epoch: number,
) {
  return {
    type: "task",
    id: yield* genTaskId(tmpl.id, epoch),
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

type RecurrenceRange = {
  from: Date;
  to: Date;
};

type RecurrencePolicy = {
  dtstart: Date;
  inclusiveBetween: boolean;
  canonicalizeRange: (fromDate: Date, toDate: Date) => RecurrenceRange;
  canonicalizeGenerationRange: (
    fromDate: Date,
    toDate: Date,
  ) => RecurrenceRange;
  occurrenceEpoch: (date: Date) => number;
};

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

function startOfAbstractDay(date: Date): Date {
  const dayStart = new Date(date);
  dayStart.setUTCHours(0, 0, 0, 0);
  return dayStart;
}

/**
 * Builds a single recurrence policy so dtstart, query windows, and task IDs all
 * use the same time model.
 */
function buildRecurrencePolicy(template: TaskTemplate): RecurrencePolicy {
  const baseDtstart = toUTC(new Date(getTemplateDtStart(template)));

  if (isDailyOrCoarser(template.repeatRule)) {
    const dtstart = startOfAbstractDay(baseDtstart);

    return {
      dtstart,
      inclusiveBetween: true,
      canonicalizeRange: (fromDate: Date, toDate: Date) => {
        const from = toUTC(new Date(fromDate));
        const to = toUTC(new Date(toDate));
        return { from, to };
      },
      canonicalizeGenerationRange: (fromDate: Date, toDate: Date) => {
        const from = startOfAbstractDay(toUTC(new Date(fromDate)));
        const to = toUTC(new Date(toDate));
        return {
          from: from < dtstart ? new Date(dtstart.getTime()) : from,
          to,
        };
      },
      occurrenceEpoch: (date: Date) => date.getTime(),
    };
  }

  return {
    dtstart: baseDtstart,
    inclusiveBetween: false,
    canonicalizeRange: (fromDate: Date, toDate: Date) => ({
      from: toUTC(new Date(fromDate)),
      to: toUTC(new Date(toDate)),
    }),
    canonicalizeGenerationRange: (fromDate: Date, toDate: Date) => ({
      from: toUTC(new Date(fromDate)),
      to: toUTC(new Date(toDate)),
    }),
    occurrenceEpoch: (date: Date) => fromUTC(date).getTime(),
  };
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
    const policy = buildRecurrencePolicy(template);
    const r = createRuleWithDtstart(template.repeatRule, policy.dtstart);
    const range = policy.canonicalizeRange(fromDate, toDate);
    const dates = r.between(range.from, range.to, policy.inclusiveBetween);
    for (const date of dates) {
      const epoch = policy.occurrenceEpoch(date);
      const taskId = yield* genTaskId(template.id, epoch);
      const existingTask = yield* cardsTasksSlice.byId(taskId);
      if (!existingTask) {
        newTasks.push(yield* templateToTask(template, epoch));
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

  const policy = buildRecurrencePolicy(template);
  const r = createRuleWithDtstart(template.repeatRule, policy.dtstart);
  const newTasks: Task[] = [];

  // Cap generation window to 2 weeks to avoid generating thousands of tasks
  const earliestFrom = Math.max(
    template.lastGeneratedAt,
    toDate.getTime() - MAX_GENERATION_WINDOW_MS,
  );

  const range = policy.canonicalizeGenerationRange(
    new Date(earliestFrom),
    toDate,
  );
  const dates = r.between(range.from, range.to, policy.inclusiveBetween);

  for (const date of dates) {
    const epoch = policy.occurrenceEpoch(date);
    const taskId = yield* genTaskId(template.id, epoch);
    const existingTask = yield* cardsTasksSlice.byId(taskId);
    if (!existingTask) {
      newTasks.push(yield* templateToTask(template, epoch));
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
