import { isObjectType } from "../utils";
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
import { uuidv7 } from "uuidv7";
import { RRule } from "rrule";
import { appById } from "./app";
import {
  copyItems,
  deleteForParents,
  checklistItemCanDropOnParent,
  checklistItemHandleDropOnParent,
} from "./checklistItems";
import { createProjectionInDailyList } from "./dailyListsProjections";
import {
  createTaskCardAfter,
  projectCategoryCardSiblings,
} from "./projectsCategoriesCards";
import { firstProjectCategoryChild } from "./projectsCategories";
import {
  deleteTasks,
  taskById,
  taskIdsOfTemplateId,
  taskType,
  updateTask,
} from "./cardsTasks";
import { isTask, type Task } from "./cardsTasks";
import { registerSpaceSyncableTable } from "./syncMap";
import { AnyModelType, registerModelSlice } from "./maps";
import { genUUIDV5 } from "../traits/";
import { generateKeyPositionedBetween, getDMY } from "./utils";
import { isTaskProjection } from "./dailyListsProjections";

// Type definitions
export const taskTemplateType = "template";

export const taskTemplatesTable = defineTable("task_templates", {
  type: v.literal(taskTemplateType),
  id: v.string(),
  title: v.string(),
  content: v.optional(v.string()),
  orderToken: v.string(),
  repeatRule: v.string(),
  repeatRuleDtStart: v.number(),
  createdAt: v.number(),
  lastGeneratedAt: v.number(),
  projectCategoryId: v.string(),
  nature: v.optional(
    v.union(v.literal("red"), v.literal("green"), v.literal("unknown")),
  ),
})
  .index("byIds", ["id"])
  .index("byCategoryIdOrderStates", ["projectCategoryId", "orderToken"]);
export type TaskTemplate = ExtractSchema<typeof taskTemplatesTable>;

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

registerSpaceSyncableTable(taskTemplatesTable, taskTemplateType);

// Template utility functions
const genTaskId = selector(function* genTaskId(taskTemplateId: string, epoch: number) {
  return yield* genUUIDV5(taskType, taskTemplateId + "_" + epoch);
});

const templateToTask = selector(function* templateToTask(tmpl: TaskTemplate, epoch: number) {
  return {
    type: "task",
    id: yield* genTaskId(tmpl.id, epoch),
    title: tmpl.title,
    content: "",
    state: "todo",
    projectCategoryId: tmpl.projectCategoryId,
    orderToken: tmpl.orderToken,
    lastToggledAt: epoch,
    nature: tmpl.nature,
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
export const taskTemplateAllIds = selector(function* taskTemplateAllIds() {
  const templates = yield* selectFrom(taskTemplatesTable, "byIds").where((q) => q);
  return templates.map((p) => p.id);
});

export const taskTemplateById = selector(function* taskTemplateById(id: string) {
  const templates = yield* selectFrom(taskTemplatesTable, "byId")
      .where((q) => q.eq("id", id))
      .limit(1);
  return templates[0] as TaskTemplate | undefined;
});

export const taskTemplateByIdOrDefault = selector(function* taskTemplateByIdOrDefault(id: string) {
  const templates = yield* selectFrom(taskTemplatesTable, "byId")
      .where((q) => q.eq("id", id))
      .limit(1);
  return (templates[0] as TaskTemplate | undefined) ?? defaultTaskTemplate;
});

export const allTaskTemplates = selector(function* allTaskTemplates() {
  const templates = yield* selectFrom(taskTemplatesTable, "byCategoryIdOrderStates");
  return templates;
});

export const taskTemplateIds = selector(function* taskTemplateIds() {
  const templates = yield* allTaskTemplates();
  return templates.map((t) => t.id);
});

export const taskTemplateRule = selector(function* taskTemplateRule(id: string) {
  const template = yield* taskTemplateByIdOrDefault(id);
  return createRuleFromString(template.repeatRule);
});

export const taskTemplateRuleText = selector(function* taskTemplateRuleText(id: string) {
  const r = yield* taskTemplateRule(id);
  return r.toText();
});

export const taskTemplateNewTasksInRange = selector(function* taskTemplateNewTasksInRange(
  fromDate: Date,
  toDate: Date,
) {
  const templates = yield* allTaskTemplates();
  const newTasks: Task[] = [];

  for (const template of templates) {
    const policy = buildRecurrencePolicy(template);
    const r = createRuleWithDtstart(template.repeatRule, policy.dtstart);
    const range = policy.canonicalizeRange(fromDate, toDate);
    const dates = r.between(range.from, range.to, policy.inclusiveBetween);
    for (const date of dates) {
      const epoch = policy.occurrenceEpoch(date);
      const taskId = yield* genTaskId(template.id, epoch);
      const existingTask = yield* taskById(taskId);
      if (!existingTask) {
        newTasks.push(yield* templateToTask(template, epoch));
      }
    }
  }

  return newTasks;
});

export const newTasksToGenForTaskTemplate = selector(function* newTasksToGenForTaskTemplate(
  templateId: string,
  toDate: Date,
) {
  const template = yield* taskTemplateById(templateId);
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
    const existingTask = yield* taskById(taskId);
    if (!existingTask) {
      newTasks.push(yield* templateToTask(template, epoch));
    }
  }

  return newTasks;
});

export const newTasksToGenForTaskTemplates = selector(function* newTasksToGenForTaskTemplates(toDate: Date) {
  const templateIds = yield* taskTemplateIds();
  const newTasks: Task[] = [];

  for (const templateId of templateIds) {
    const tasks = yield* newTasksToGenForTaskTemplate(templateId, toDate);
    newTasks.push(...tasks);
  }

  return newTasks;
});

export const taskTemplateCanDrop = selector(function* taskTemplateCanDrop(
  taskTemplateId: string,
  dropId: string,
  dropModelType: AnyModelType,
) {
  const template = yield* taskTemplateById(taskTemplateId);
  if (!template) return false;

  const model = yield* appById(dropId, dropModelType);
  if (!model) return false;

  if (isTask(model)) {
    return model.state === "todo";
  }

  if (isTaskProjection(model)) {
    const droppedTask = yield* taskById(model.id);
    return droppedTask !== undefined && droppedTask.state === "todo";
  }

  if (
    yield* checklistItemCanDropOnParent(
      taskTemplateId,
      taskTemplateType,
      dropId,
      dropModelType,
    )
  ) {
    return true;
  }

  return isTaskTemplate(model);
});

// Actions
export const createTaskTemplate = action(function* createTaskTemplate(
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

export const updateTemplate = action(function* updateTemplate(
  id: string,
  template: Partial<TaskTemplate>,
) {
  const templateInState = yield* taskTemplateById(id);
  if (!templateInState) throw new Error("Template not found");

  yield* upsert(taskTemplatesTable, [{ ...templateInState, ...template }]);
  return templateInState;
});

export const deleteTemplates = action(function* deleteTemplates(taskTemplateIds: string[]) {
  const taskIds = yield* taskIdsOfTemplateId(taskTemplateIds);
  for (const tId of taskIds) {
    yield* updateTask(tId, {
      templateId: null,
      templateDate: null,
    });
  }
  yield* deleteForParents(taskTemplateIds, taskTemplateType);
  yield* deleteRows(taskTemplatesTable, taskTemplateIds);
});

export const createTaskTemplateFromTask = action(function* createTaskTemplateFromTask(
  task: Task,
  data: Partial<TaskTemplate>,
) {
  const newId = uuidv7();
  yield* copyItems(
    task.id,
    taskType,
    newId,
    taskTemplateType,
  );
  yield* deleteTasks([task.id]);

  const now = Date.now();
  const template: TaskTemplate = {
    id: newId,
    type: taskTemplateType,
    title: task.title,
    content: task.content,
    orderToken: task.orderToken,
    createdAt: task.createdAt,
    repeatRule: defaultRule,
    repeatRuleDtStart: now,
    lastGeneratedAt: now,
    projectCategoryId: task.projectCategoryId,
    ...data,
  };

  yield* insert(taskTemplatesTable, [template]);
  yield* generateTasksFromTemplates();
  return template;
});

export const taskTemplateHandleDrop = action(function* taskTemplateHandleDrop(
  taskTemplateId: string,
  dropId: string,
  dropModelType: AnyModelType,
  edge: "top" | "bottom",
) {
  if (!(yield* taskTemplateCanDrop(taskTemplateId, dropId, dropModelType))) return;

  const template = yield* taskTemplateById(taskTemplateId);
  if (!template) return;

  const dropItem = yield* appById(dropId, dropModelType);
  if (!dropItem) return;

  const orderToken = generateKeyPositionedBetween(
    template,
    yield* projectCategoryCardSiblings(taskTemplateId),
    edge === "top" ? "before" : "after",
  );

  if (isTask(dropItem)) {
    yield* updateTask(dropItem.id, {
      projectCategoryId: template.projectCategoryId,
      orderToken,
    });
  } else if (isTaskTemplate(dropItem)) {
    yield* updateTemplate(dropItem.id, {
      projectCategoryId: template.projectCategoryId,
      orderToken,
    });
  } else if (isTaskProjection(dropItem)) {
    const droppedTask = yield* taskById(dropItem.id);
    if (droppedTask) {
      yield* updateTask(droppedTask.id, {
        projectCategoryId: template.projectCategoryId,
        orderToken,
      });
    }
  } else if (
    yield* checklistItemCanDropOnParent(
      taskTemplateId,
      taskTemplateType,
      dropId,
      dropModelType,
    )
  ) {
    yield* checklistItemHandleDropOnParent(
      taskTemplateId,
      taskTemplateType,
      dropId,
      dropModelType,
      edge,
    );
  }
});

export const generateTasksFromTemplates = action(function* generateTasksFromTemplates() {
  const toDate = new Date();

  const newTasks = yield* newTasksToGenForTaskTemplates(toDate);

  for (const task of newTasks) {
    if (task.templateId === null) {
      throw new Error("TemplateId is null");
    }

    // Create task card after the template card in the project category
    yield* createTaskCardAfter(task.templateId, {
      ...task,
    });
    yield* copyItems(
      task.templateId,
      taskTemplateType,
      task.id,
      taskType,
    );

    // Create projection at top of daily list for the task's date
    const localDate = fromUTC(new Date(task.createdAt));
    const dmy = getDMY(localDate);
    yield* createProjectionInDailyList(task.id, dmy);
  }

  const templateIdsToUpdate = new Set(
    newTasks.filter((t) => t.templateId !== null).map((t) => t.templateId!),
  );
  for (const templateId of templateIdsToUpdate) {
    yield* updateTemplate(templateId, { lastGeneratedAt: toDate.getTime() });
  }
});

export const cleanAllTaskTemplates = action(function* cleanAllTaskTemplates() {
  const templates = yield* allTaskTemplates();
  for (const template of templates) {
    yield* deleteRows(taskTemplatesTable, [template.id]);
  }
});

export const moveTemplateToProject = action(function* moveTemplateToProject(
  templateId: string,
  projectId: string,
) {
  const template = yield* taskTemplateById(templateId);
  if (!template) throw new Error("Template not found");

  const firstCategory = yield* firstProjectCategoryChild(projectId);
  if (!firstCategory) throw new Error("No categories found");

  yield* updateTemplate(templateId, {
    projectCategoryId: firstCategory.id,
  });
});

// Local slice object for registerModelSlice (not exported)
const cardsTaskTemplatesSlice = {
  taskTemplateAllIds,
  byId: taskTemplateById,
  taskTemplateByIdOrDefault,
  allTaskTemplates,
  taskTemplateIds,
  taskTemplateRule,
  taskTemplateRuleText,
  taskTemplateNewTasksInRange,
  newTasksToGenForTaskTemplate,
  newTasksToGenForTaskTemplates,
  canDrop: taskTemplateCanDrop,
  createTaskTemplate,
  update: updateTemplate,
  delete: deleteTemplates,
  createTaskTemplateFromTask,
  handleDrop: taskTemplateHandleDrop,
  cleanAllTaskTemplates,
  moveTemplateToProject,
  generateTasksFromTemplates,
};

registerModelSlice(
  cardsTaskTemplatesSlice,
  taskTemplatesTable,
  taskTemplateType,
);
