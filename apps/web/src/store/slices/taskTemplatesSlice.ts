import { isObjectType } from "@/store/z.utils.ts";
import { SyncMapping } from "../sync/mapping";
import { createSlice } from "@will-be-done/hyperstate";
import { appAction, appSelector } from "../z.selectorAction";
import { Task, tasksSlice, taskType } from "./tasksSlice";
import { uuidv7 } from "uuidv7";
import { inboxId } from "./projectsSlice";
import uuidByString from "uuid-by-string";
import { deepEqual } from "fast-equals";
import { projectItemsSlice } from "./projectItemsSlice";
import { dailyListsSlice } from "./dailyListsSlice";
import { format, startOfDay } from "date-fns";
import { shouldNeverHappen } from "@/utils";
import { RRule } from "rrule";

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
export type TaskTemplateData = {
  id: string;
  title: string;
  orderToken: string;
  projectId: string;
  horizon: "week" | "month" | "year" | "someday";
  repeatRule: string;
  createdAt: number;
  lastGeneratedAt: number;
};
export const taskTemplatesTable = "task_templates";

export const taskTemplateSyncMap: SyncMapping<
  typeof taskTemplatesTable,
  typeof taskTemplateType
> = {
  table: taskTemplatesTable,
  modelType: taskTemplateType,
  mapDataToModel(data) {
    return {
      type: taskTemplateType,
      id: data.id,
      title: data.title,
      projectId: data.projectId,
      orderToken: data.orderToken,
      horizon: data.horizon,
      repeatRule: data.repeatRule,
      createdAt: data.createdAt ?? 0,
      lastGeneratedAt: data.lastGeneratedAt,
    };
  },
  mapModelToData(entity) {
    return {
      id: entity.id,
      title: entity.title,
      projectId: entity.projectId,
      orderToken: entity.orderToken,
      horizon: entity.horizon,
      repeatRule: entity.repeatRule,
      createdAt: entity.createdAt,
      lastGeneratedAt: entity.createdAt,
    };
  },
};

const startOfCurrentDay = startOfDay(new Date());

const defaultRule = `
DTSTART:${format(startOfCurrentDay, "yyyyMMdd") + "T000000"};
RRULE:FREQ=DAILY;BYHOUR=10
`.trim();

const defaultTemplate: TaskTemplate = {
  id: "default-template-id", // todo generate
  title: "default template",
  projectId: inboxId,
  orderToken: "a",
  horizon: "someday",
  repeatRule: defaultRule,
  createdAt: 0,
  type: "template",
  lastGeneratedAt: startOfCurrentDay.getTime() - 1,
};

const generateTaskId = (taskTemplateId: string, date: Date) => {
  return uuidByString(taskTemplateId + "_" + date.getTime());
};

const templateToTask = (tmpl: TaskTemplate, date: Date): Task => {
  return {
    type: taskType,
    id: generateTaskId(tmpl.id, date),
    title: tmpl.title,
    state: "todo",
    projectId: tmpl.projectId,
    orderToken: "a0",
    lastToggledAt: date.getTime(),
    horizon: tmpl.horizon,
    createdAt: date.getTime(),
    templateData: {
      templateId: tmpl.id,
      templateDate: date.getTime(),
    },
  } satisfies Task;
};

export const taskTemplatesSlice = createSlice(
  {
    byId: appSelector(
      (state, id: string): TaskTemplate | undefined => state.template.byIds[id],
    ),
    byIdOrDefault: appSelector(
      (state, id: string): TaskTemplate =>
        state.template.byIds[id] || defaultTemplate,
    ),
    all: appSelector((state) => Object.values(state.template.byIds)),
    ids: appSelector((state) => Object.keys(state.template.byIds)),
    rule: appSelector((state, id: string): RRule => {
      const template = taskTemplatesSlice.byIdOrDefault(state, id);

      return RRule.fromString(template.repeatRule.trim());
    }),
    ruleText: appSelector((state, id: string): string => {
      const rule = taskTemplatesSlice.rule(state, id);

      if (rule.options.byhour && rule.options.byhour.length > 0) {
        const offsetMinutes = -new Date().getTimezoneOffset();
        const offsetHours = Math.floor(offsetMinutes / 60);
        const offsetMins = offsetMinutes % 60;

        // Create new options with adjusted hours
        const newOptions = {
          ...rule.options,
          byhour: rule.options.byhour.map((hour) =>
            Math.floor((hour + offsetHours + 24) % 24),
          ),
        };

        // Handle minute offset if it exists
        if (offsetMins !== 0) {
          const currentMinute = rule.options.byminute?.[0] || 0;
          const newMinute = (currentMinute + offsetMins + 60) % 60;
          newOptions.byminute = [newMinute];
        }

        // Create a new RRule with adjusted options
        const localRule = new RRule(newOptions);
        return localRule.toText();
      }

      return rule.toText();
    }),
    newTasksInRange: appSelector(
      (state, fromDate: Date, toDate: Date): Task[] => {
        const newTasks: Task[] = [];

        for (const t of taskTemplatesSlice.all(state)) {
          const rule = taskTemplatesSlice.rule(state, t.id);

          rule.between(fromDate, toDate).forEach(() => {
            const time = new Date();

            const id = generateTaskId(t.id, time);
            if (!tasksSlice.byId(state, id)) {
              newTasks.push(templateToTask(t, time));
            }
          });
        }

        return newTasks;
      },
      deepEqual,
    ),
    newTasksToGenForTemplate: appSelector(
      (state, templateId: string, toDate: Date): Task[] => {
        const newTasks: Task[] = [];

        const template = taskTemplatesSlice.byId(state, templateId);
        if (!template) return [];
        const rule = taskTemplatesSlice.rule(state, templateId);

        rule
          .between(new Date(template.lastGeneratedAt), toDate)
          .forEach((date) => {
            const taskId = generateTaskId(template.id, date);
            if (!tasksSlice.byId(state, taskId)) {
              newTasks.push(templateToTask(template, date));
            }
          });

        return newTasks;
      },
    ),
    newTasksToGenForTemplates: appSelector((state, toDate: Date): Task[] => {
      const newTasks: Task[] = [];

      for (const templateId of taskTemplatesSlice.ids(state)) {
        newTasks.push(
          ...taskTemplatesSlice.newTasksToGenForTemplate(
            state,
            templateId,
            toDate,
          ),
        );
      }

      return newTasks;
    }),
    genTaskAndProjectionsForTemplate: appAction(
      (state, templateId: string, tillDate: Date) => {
        const newTasks = taskTemplatesSlice.newTasksToGenForTemplate(
          state,
          templateId,
          tillDate,
        );

        taskTemplatesSlice.genTasks(state, newTasks);
      },
    ),
    genTasksAndProjections: appAction((state, tillDate: Date) => {
      const newTasks = taskTemplatesSlice.newTasksToGenForTemplates(
        state,
        tillDate,
      );

      taskTemplatesSlice.genTasks(state, newTasks);
    }),
    genTasks: appAction((state, newTasks: Task[]) => {
      const generatedTasks: Task[] = [];
      for (const t of newTasks) {
        const task = projectItemsSlice.createTask(
          state,
          t.projectId,
          "append",
          t,
        );

        generatedTasks.push(task);

        if (!task.templateData)
          return shouldNeverHappen("template data was not set");
        const date = startOfDay(new Date(task.templateData.templateDate));
        const dailyList = dailyListsSlice.createIfNotPresent(state, date);

        dailyListsSlice.createProjection(
          state,
          dailyList.id,
          task.id,
          "prepend",
        );

        taskTemplatesSlice.update(state, task.templateData.templateId, {
          lastGeneratedAt: new Date().getTime(),
        });
      }

      return generatedTasks;
    }),
    createFromTask: appAction((state, task: Task) => {
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
        lastGeneratedAt: startOfDay(task.createdAt).getTime() - 1,
      };
      state.template.byIds[newId] = template;

      taskTemplatesSlice.genTaskAndProjectionsForTemplate(
        state,
        template.id,
        new Date(),
      );

      return template;
    }),
    update: appAction(
      (state, id: string, data: Partial<TaskTemplate>): TaskTemplate => {
        const template = taskTemplatesSlice.byId(state, id);
        if (!template) throw new Error("Task not found");

        Object.assign(template, data);

        return template;
      },
    ),
    delete: appAction((state, id: string) => {
      const taskIds = tasksSlice.taskIdsOfTemplateId(state, id);
      for (const tId of taskIds) {
        tasksSlice.update(state, tId, { templateData: undefined });
      }
      delete state.template.byIds[id];
    }),
    cleanAll: appAction((state) => {
      for (const t of taskTemplatesSlice.all(state)) {
        delete state.template.byIds[t.id];
      }
    }),
  },
  "taskTemplatesSlice",
);
