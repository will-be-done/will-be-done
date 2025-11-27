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
import type { GenReturn } from "./utils";
import { cardsTasksSlice, type Task } from "./cardsTasks";
import { registerSyncableTable } from "./syncMap";
import { registerModelSlice } from "./maps";
import { projectCategoriesSlice } from "./projectsCategories";
import { appSlice } from "./app";
import { noop } from "@will-be-done/hyperdb/src/hyperdb/generators";

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
  projectId: "",
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
    projectCategoryId: tmpl.projectCategoryId,
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
export const cardsTaskTemplatesSlice = {
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
    return (yield* cardsTaskTemplatesSlice.byId(id)) || defaultTaskTemplate;
  }),
  all: selector(function* (): GenReturn<TaskTemplate[]> {
    const templates = yield* runQuery(
      selectFrom(taskTemplatesTable, "byCategoryIdOrderStates"),
    );
    return templates;
  }),
  ids: selector(function* (): GenReturn<string[]> {
    const templates = yield* cardsTaskTemplatesSlice.all();
    return templates.map((t) => t.id);
  }),
  rule: selector(function* (id: string): GenReturn<RRule> {
    const template = yield* cardsTaskTemplatesSlice.byIdOrDefault(id);
    return createRuleFromString(template.repeatRule || defaultRule);
  }),
  ruleText: selector(function* (id: string): GenReturn<string> {
    const rule = yield* cardsTaskTemplatesSlice.rule(id);
    return rule.toText();
  }),
  newTasksInRange: selector(function* (
    fromDate: Date,
    toDate: Date,
  ): GenReturn<Task[]> {
    const templates = yield* cardsTaskTemplatesSlice.all();
    const newTasks: Task[] = [];

    for (const template of templates) {
      const rule = yield* cardsTaskTemplatesSlice.rule(template.id);

      const dates = rule.between(fromDate, toDate);
      for (const date of dates) {
        const taskId = generateTaskId(template.id, date);
        const existingTask = yield* cardsTasksSlice.byId(taskId);
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
    const template = yield* cardsTaskTemplatesSlice.byId(templateId);
    if (!template) return [];

    const rule = yield* cardsTaskTemplatesSlice.rule(templateId);
    const newTasks: Task[] = [];

    const dates = rule.between(
      toUTC(new Date(template.lastGeneratedAt)),
      toUTC(toDate),
    );
    for (const date of dates) {
      const taskId = generateTaskId(template.id, date);
      const existingTask = yield* cardsTasksSlice.byId(taskId);
      if (!existingTask) {
        newTasks.push(templateToTask(template, date));
      }
    }

    return newTasks;
  }),
  newTasksToGenForTemplates: selector(function* (
    toDate: Date,
  ): GenReturn<Task[]> {
    const templateIds = yield* cardsTaskTemplatesSlice.ids();
    const newTasks: Task[] = [];

    for (const templateId of templateIds) {
      const tasks = yield* cardsTaskTemplatesSlice.newTasksToGenForTemplate(
        templateId,
        toDate,
      );
      newTasks.push(...tasks);
    }

    return newTasks;
  }),

  // actions
  create: action(function* (
    template: Partial<TaskTemplate> & {
      projectId: string;
      orderToken: string;
    },
  ): GenReturn<TaskTemplate> {
    const id = template.id || uuidv7();
    const projectCategoryId =
      template.projectCategoryId ??
      (yield* projectCategoriesSlice.firstChild(template.projectId))?.id;
    if (!projectCategoryId) throw new Error("Category of project not found");

    const newTemplate: TaskTemplate = {
      type: taskTemplateType,
      id,
      title: "New template",
      horizon: "week",
      repeatRule: defaultRule,
      createdAt: Date.now(),
      lastGeneratedAt: Date.now(),
      projectCategoryId: projectCategoryId,
      ...template,
    };

    yield* insert(taskTemplatesTable, [newTemplate]);
    return newTemplate;
  }),
  update: action(function* (
    id: string,
    template: Partial<TaskTemplate>,
  ): GenReturn<TaskTemplate> {
    const templateInState = yield* cardsTaskTemplatesSlice.byId(id);
    if (!templateInState) throw new Error("Template not found");

    yield* update(taskTemplatesTable, [{ ...templateInState, ...template }]);
    return templateInState;
  }),
  delete: action(function* (ids: string[]): GenReturn<void> {
    const taskIds = yield* cardsTasksSlice.taskIdsOfTemplateId(ids);
    for (const tId of taskIds) {
      yield* cardsTasksSlice.update(tId, {
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
    yield* appSlice.delete(task);

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
      projectId: "",
      ...data,
    };

    yield* insert(taskTemplatesTable, [template]);

    // // Generate initial tasks and projections for this template
    // yield* taskTemplatesSlice2.genTaskAndProjectionsForTemplate(
    //   template.id,
    //   new Date(),
    // );

    return template;
  }),
  canDrop: selector(function* (
    taskTemplateId: string,
    dropId: string,
  ): GenReturn<boolean> {
    yield* noop();

    return false;
  }),
  handleDrop: action(function* (
    taskTemplateId: string,
    dropId: string,
    edge: "top" | "bottom",
  ): GenReturn<void> {
    yield* noop();
  }),
  // genTaskAndProjectionsForTemplate: action(function* (
  //   templateId: string,
  //   tillDate: Date,
  // ): GenReturn<void> {
  //   const newTasks = yield* taskTemplatesSlice2.newTasksToGenForTemplate(
  //     templateId,
  //     tillDate,
  //   );
  //   yield* taskTemplatesSlice2.genTasks(newTasks);
  // }),
  // genTasksAndProjections: action(function* (tillDate: Date): GenReturn<void> {
  //   const newTasks =
  //     yield* taskTemplatesSlice2.newTasksToGenForTemplates(tillDate);
  //   yield* taskTemplatesSlice2.genTasks(newTasks);
  // }),
  // genTasks: action(function* (newTasks: Task[]): GenReturn<Task[]> {
  //   const generatedTasks: Task[] = [];
  //
  //   for (const taskData of newTasks) {
  //     const task = yield* projectItemsSlice2.createTask(
  //       taskData.projectId,
  //       "append",
  //       taskData,
  //     );
  //     generatedTasks.push(task);
  //
  //     if (taskData.templateId && taskData.templateDate) {
  //       const date = new Date(taskData.templateDate)
  //         .toISOString()
  //         .split("T")[0];
  //       if (!date) return shouldNeverHappen("date was not set");
  //
  //       const dailyList = yield* dailyListsSlice2.createIfNotPresent(date);
  //
  //       // Create projection for the task in the daily list
  //       yield* dailyListsSlice2.createProjection(
  //         dailyList.id,
  //         task.id,
  //         "prepend",
  //       );
  //
  //       yield* taskTemplatesSlice2.update(taskData.templateId, {
  //         lastGeneratedAt: Date.now(),
  //       });
  //     } else {
  //       shouldNeverHappen("taskData empty", taskData);
  //     }
  //   }
  //
  //   return generatedTasks;
  // }),
  cleanAll: action(function* (): GenReturn<void> {
    const templates = yield* cardsTaskTemplatesSlice.all();
    for (const template of templates) {
      yield* deleteRows(taskTemplatesTable, [template.id]);
    }
  }),
};
registerModelSlice(
  cardsTaskTemplatesSlice,
  taskTemplatesTable,
  taskTemplateType,
);
