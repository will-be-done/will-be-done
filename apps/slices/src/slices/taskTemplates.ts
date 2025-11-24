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
import { uuidv7 } from "uuidv7";
import { RRule } from "rrule";
import type { GenReturn } from "./utils";
import { tasksSlice2, type Task } from "./tasks";
import { projectItemsSlice2 } from "./projectItems";
import { dailyListsSlice2 } from "./dailyLists";
import { registerSyncableTable } from "./syncMap";
import { registerModelSlice } from "./maps";

// Type definitions
export const taskTemplateType = "template";

export type TaskTemplate = {
  type: typeof taskTemplateType;
  id: string;
  title: string;
  projectId: string;
  orderToken: string;
  horizon: "week" | "month" | "year" | "someday";
  repeatRule: string;
  createdAt: number;
  lastGeneratedAt: number;
};

export const isTaskTemplate = isObjectType<TaskTemplate>(taskTemplateType);

export const defaultTaskTemplate: TaskTemplate = {
  type: taskTemplateType,
  id: "default-template-id",
  title: "default template",
  projectId: "",
  orderToken: "",
  horizon: "someday",
  repeatRule: "",
  createdAt: 0,
  lastGeneratedAt: 0,
};

// Table definition
export const taskTemplatesTable = table<TaskTemplate>(
  "task_templates",
).withIndexes({
  byId: { cols: ["id"], type: "hash" },
  byIds: { cols: ["id"], type: "btree" },
  byProjectIdOrderToken: {
    cols: ["projectId", "orderToken"],
    type: "btree",
  },
});
registerSyncableTable(taskTemplatesTable, taskTemplateType);

// Template utility functions
function generateTaskId(taskTemplateId: string, date: Date): string {
  return taskTemplateId + "_" + date.getTime();
}

function templateToTask(tmpl: TaskTemplate, date: Date): Task {
  return {
    type: "task",
    id: generateTaskId(tmpl.id, date),
    title: tmpl.title,
    state: "todo",
    projectId: tmpl.projectId,
    orderToken: tmpl.orderToken,
    lastToggledAt: date.getTime(),
    horizon: tmpl.horizon,
    createdAt: date.getTime(),
    templateId: tmpl.id,
    templateDate: date.getTime(),
  };
}

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
  } catch (error) {
    // Fallback to daily rule if parsing fails
    return RRule.fromString(defaultRule);
  }
}

// Slice
export const taskTemplatesSlice2 = {
  // selectors
  allIds: selector(function* (): GenReturn<string[]> {
    const templates = yield* runQuery(
      selectFrom(taskTemplatesTable, "byIds").where((q) => q),
    );

    return templates.map((p) => p.id);
  }),
  byId: selector(function* (id: string): GenReturn<TaskTemplate | undefined> {
    const templates = yield* runQuery(
      selectFrom(taskTemplatesTable, "byId")
        .where((q) => q.eq("id", id))
        .limit(1),
    );
    return templates[0];
  }),
  byIdOrDefault: selector(function* (id: string): GenReturn<TaskTemplate> {
    return (yield* taskTemplatesSlice2.byId(id)) || defaultTaskTemplate;
  }),
  all: selector(function* (): GenReturn<TaskTemplate[]> {
    const templates = yield* runQuery(
      selectFrom(taskTemplatesTable, "byProjectIdOrderToken"),
    );
    return templates;
  }),
  ids: selector(function* (): GenReturn<string[]> {
    const templates = yield* taskTemplatesSlice2.all();
    return templates.map((t) => t.id);
  }),
  rule: selector(function* (id: string): GenReturn<RRule> {
    const template = yield* taskTemplatesSlice2.byIdOrDefault(id);
    return createRuleFromString(template.repeatRule || defaultRule);
  }),
  ruleText: selector(function* (id: string): GenReturn<string> {
    const rule = yield* taskTemplatesSlice2.rule(id);
    return rule.toText();
  }),
  newTasksInRange: selector(function* (
    fromDate: Date,
    toDate: Date,
  ): GenReturn<Task[]> {
    const templates = yield* taskTemplatesSlice2.all();
    const newTasks: Task[] = [];

    for (const template of templates) {
      const rule = yield* taskTemplatesSlice2.rule(template.id);

      const dates = rule.between(fromDate, toDate);
      for (const date of dates) {
        const taskId = generateTaskId(template.id, date);
        const existingTask = yield* tasksSlice2.byId(taskId);
        if (!existingTask) {
          newTasks.push(templateToTask(template, date));
        }
      }
    }

    return newTasks;
  }),
  newTasksToGenForTemplate: selector(function* (
    templateId: string,
    toDate: Date,
  ): GenReturn<Task[]> {
    const template = yield* taskTemplatesSlice2.byId(templateId);
    if (!template) return [];

    const rule = yield* taskTemplatesSlice2.rule(templateId);
    const newTasks: Task[] = [];

    const dates = rule.between(
      toUTC(new Date(template.lastGeneratedAt)),
      toUTC(toDate),
    );
    for (const date of dates) {
      const taskId = generateTaskId(template.id, date);
      const existingTask = yield* tasksSlice2.byId(taskId);
      if (!existingTask) {
        newTasks.push(templateToTask(template, date));
      }
    }

    return newTasks;
  }),
  newTasksToGenForTemplates: selector(function* (
    toDate: Date,
  ): GenReturn<Task[]> {
    const templateIds = yield* taskTemplatesSlice2.ids();
    const newTasks: Task[] = [];

    for (const templateId of templateIds) {
      const tasks = yield* taskTemplatesSlice2.newTasksToGenForTemplate(
        templateId,
        toDate,
      );
      newTasks.push(...tasks);
    }

    return newTasks;
  }),

  // actions
  create: action(function* (
    template: Partial<TaskTemplate> & { projectId: string; orderToken: string },
  ): GenReturn<TaskTemplate> {
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
  }),
  update: action(function* (
    id: string,
    template: Partial<TaskTemplate>,
  ): GenReturn<TaskTemplate> {
    const templateInState = yield* taskTemplatesSlice2.byId(id);
    if (!templateInState) throw new Error("Template not found");

    yield* update(taskTemplatesTable, [{ ...templateInState, ...template }]);
    return templateInState;
  }),
  delete: action(function* (ids: string[]): GenReturn<void> {
    const taskIds = yield* tasksSlice2.taskIdsOfTemplateId(ids);
    for (const tId of taskIds) {
      yield* tasksSlice2.update(tId, {
        templateId: undefined,
        templateDate: undefined,
      });
    }
    yield* deleteRows(taskTemplatesTable, ids);
  }),
  createFromTask: action(function* (
    task: Task,
    data: Partial<TaskTemplate>,
  ): GenReturn<TaskTemplate> {
    yield* projectItemsSlice2.deleteById(task.id);

    const newId = uuidv7();
    const template: TaskTemplate = {
      id: newId,
      type: taskTemplateType,
      title: task.title,
      projectId: task.projectId,
      orderToken: task.orderToken,
      createdAt: task.createdAt,
      repeatRule: defaultRule,
      horizon: task.horizon,
      lastGeneratedAt: startOfDay(new Date(task.createdAt)).getTime() - 1,
      ...data,
    };

    yield* insert(taskTemplatesTable, [template]);

    // Generate initial tasks and projections for this template
    yield* taskTemplatesSlice2.genTaskAndProjectionsForTemplate(
      template.id,
      new Date(),
    );

    return template;
  }),
  genTaskAndProjectionsForTemplate: action(function* (
    templateId: string,
    tillDate: Date,
  ): GenReturn<void> {
    const newTasks = yield* taskTemplatesSlice2.newTasksToGenForTemplate(
      templateId,
      tillDate,
    );
    yield* taskTemplatesSlice2.genTasks(newTasks);
  }),
  genTasksAndProjections: action(function* (tillDate: Date): GenReturn<void> {
    const newTasks =
      yield* taskTemplatesSlice2.newTasksToGenForTemplates(tillDate);
    yield* taskTemplatesSlice2.genTasks(newTasks);
  }),
  genTasks: action(function* (newTasks: Task[]): GenReturn<Task[]> {
    const generatedTasks: Task[] = [];

    for (const taskData of newTasks) {
      const task = yield* projectItemsSlice2.createTask(
        taskData.projectId,
        "append",
        taskData,
      );
      generatedTasks.push(task);

      if (taskData.templateId && taskData.templateDate) {
        const date = new Date(taskData.templateDate)
          .toISOString()
          .split("T")[0];
        if (!date) return shouldNeverHappen("date was not set");

        const dailyList = yield* dailyListsSlice2.createIfNotPresent(date);

        // Create projection for the task in the daily list
        yield* dailyListsSlice2.createProjection(
          dailyList.id,
          task.id,
          "prepend",
        );

        yield* taskTemplatesSlice2.update(taskData.templateId, {
          lastGeneratedAt: Date.now(),
        });
      } else {
        shouldNeverHappen("taskData empty", taskData);
      }
    }

    return generatedTasks;
  }),
  cleanAll: action(function* (): GenReturn<void> {
    const templates = yield* taskTemplatesSlice2.all();
    for (const template of templates) {
      yield* deleteRows(taskTemplatesTable, [template.id]);
    }
  }),
};
registerModelSlice(taskTemplatesSlice2, taskTemplatesTable, taskTemplateType);
