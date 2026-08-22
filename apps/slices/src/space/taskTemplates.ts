import {
  deleteRows,
  insert,
  selectFrom,
  upsert,
  v,
} from "@will-be-done/hyperdb";
import { action, selector } from "../builders";
import { uuidv7 } from "uuidv7";
import { RRule } from "rrule";
import { appById } from "./app";
import {
  copyItems,
  deleteForParents,
  checklistItemCanDropOnParent,
  checklistItemHandleDropOnParent,
} from "./checklistItems";
import { createEntryInDailyList } from "./dailyEntries";
import {
  createTaskAfterSectionItem,
  projectSectionItemSiblings,
} from "./projectSectionItems";
import { firstProjectSectionChild } from "./projectSections";
import {
  deleteTasks,
  taskById,
  taskIdsOfTemplateId,
  tasksByIds,
  updateTask,
} from "./tasks";
import { registerModelSlice } from "./maps";
import { genUUIDV5 } from "../traits/";
import { generateKeyPositionedBetween, getDMY } from "./utils";
import {
  taskType,
  tasksTable,
  taskTemplateType,
  taskTemplatesTable,
  projectSectionsTable,
  projectsTable,
  Task,
  TaskTemplate,
  possibleModelType,
  isTaskTemplate,
  isTask,
  isDailyEntry,
} from "./tables";

export const defaultTaskTemplate: TaskTemplate = {
  type: taskTemplateType,
  id: "default-template-id",
  title: "default template",
  orderToken: "",
  repeatRule: "",
  repeatRuleDtStart: 0,
  createdAt: 0,
  lastGeneratedAt: 0,
  projectSectionId: "abeee7aa-8bf4-4a5f-9167-ce42ad6187b6",
};

// Template utility functions
const genTaskId = selector({
  name: "genTaskId",
  args: {
    taskTemplateId: v.string(),
    epoch: v.number(),
  },
  handler: function* genTaskId({ taskTemplateId, epoch }) {
    return yield* genUUIDV5(taskType, taskTemplateId + "_" + epoch);
  },
});

const templateToTask = selector({
  name: "templateToTask",
  args: {
    tmpl: taskTemplatesTable.v(),
    epoch: v.number(),
  },
  handler: function* templateToTask({ tmpl, epoch }) {
    const startsAtMinutes = tmpl.startsAtMinutes;
    const durationMinutes =
      tmpl.durationMinutes ??
      (startsAtMinutes != null ? DEFAULT_TEMPLATE_DURATION_MINUTES : undefined);
    const startsAt =
      startsAtMinutes != null
        ? occurrenceStartsAt(epoch, startsAtMinutes)
        : undefined;

    return {
      type: "task",
      id: yield* genTaskId({
        taskTemplateId: tmpl.id,
        epoch,
      }),
      title: tmpl.title,
      content: "",
      state: "todo",
      projectSectionId: tmpl.projectSectionId,
      orderToken: tmpl.orderToken,
      lastToggledAt: epoch,
      nature: tmpl.nature,
      createdAt: epoch,
      templateId: tmpl.id,
      templateDate: epoch,
      ...(startsAt != null && durationMinutes != null
        ? { startsAt, durationMinutes }
        : {}),
    } satisfies Task;
  },
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
const MAX_UPCOMING_OCCURRENCES = 200;
const DEFAULT_TEMPLATE_DURATION_MINUTES = 30;

export type UpcomingTemplateOccurrence = {
  id: string;
  templateId: string;
  title: string;
  date: string;
  epoch: number;
  projectSectionId: string;
  sectionTitle: string;
  projectTitle: string;
  projectIcon: string;
  nature?: Task["nature"];
  startsAtMinutes?: number;
  durationMinutes?: number;
  startsAt?: number;
};

function localCalendarDateFromEpoch(epoch: number): Date {
  const local = fromUTC(new Date(epoch));
  return new Date(local.getFullYear(), local.getMonth(), local.getDate());
}

export function occurrenceStartsAt(
  epoch: number,
  startsAtMinutes: number,
): number {
  return (
    localCalendarDateFromEpoch(epoch).getTime() + startsAtMinutes * 60 * 1000
  );
}

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

export function isValidTaskTemplateRule(ruleString: string): boolean {
  try {
    createRuleFromString(ruleString);
    return true;
  } catch {
    return false;
  }
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
export const taskTemplateAllIds = selector({
  name: "taskTemplateAllIds",
  args: {},
  handler: function* taskTemplateAllIds() {
    const templates = yield* selectFrom(taskTemplatesTable, "byIds").where(
      (q) => q,
    );
    return templates.map((p) => p.id);
  },
});

export const taskTemplateById = selector({
  name: "taskTemplateById",
  args: { id: v.string() },
  handler: function* taskTemplateById({ id }: { id: string }) {
    const templates = yield* selectFrom(taskTemplatesTable, "byId")
      .where((q) => q.eq("id", id))
      .limit(1);
    return templates[0] as TaskTemplate | undefined;
  },
});

export const taskTemplateByIdOrDefault = selector({
  name: "taskTemplateByIdOrDefault",
  args: { id: v.string() },
  handler: function* taskTemplateByIdOrDefault({ id }: { id: string }) {
    const templates = yield* selectFrom(taskTemplatesTable, "byId")
      .where((q) => q.eq("id", id))
      .limit(1);
    return (templates[0] as TaskTemplate | undefined) ?? defaultTaskTemplate;
  },
});

export const allTaskTemplates = selector({
  name: "allTaskTemplates",
  args: {},
  handler: function* allTaskTemplates() {
    return yield* selectFrom(taskTemplatesTable, "byIds").where((q) => q);
  },
});

export const taskTemplateIds = selector({
  name: "taskTemplateIds",
  args: {},
  handler: function* taskTemplateIds() {
    const templates = yield* allTaskTemplates({});
    return templates.map((t) => t.id);
  },
});

export const taskTemplateRule = selector({
  name: "taskTemplateRule",
  args: { id: v.string() },
  handler: function* taskTemplateRule({ id }: { id: string }) {
    const template = yield* taskTemplateByIdOrDefault({ id });
    return createRuleFromString(template.repeatRule);
  },
});

export const taskTemplateRuleText = selector({
  name: "taskTemplateRuleText",
  args: { id: v.string() },
  handler: function* taskTemplateRuleText({ id }: { id: string }) {
    const r = yield* taskTemplateRule({ id });
    return r.toText();
  },
});

export const taskTemplateNewTasksInRange = selector({
  name: "taskTemplateNewTasksInRange",
  args: {
    fromDate: v.number(),
    toDate: v.number(),
  },
  handler: function* taskTemplateNewTasksInRange({ fromDate, toDate }) {
    const from = new Date(fromDate);
    const to = new Date(toDate);
    const templates = yield* allTaskTemplates({});
    const newTasks: Task[] = [];

    for (const template of templates) {
      const policy = buildRecurrencePolicy(template);
      const r = createRuleWithDtstart(template.repeatRule, policy.dtstart);
      const range = policy.canonicalizeRange(from, to);
      const dates = r.between(range.from, range.to, policy.inclusiveBetween);
      for (const date of dates) {
        const epoch = policy.occurrenceEpoch(date);
        const taskId = yield* genTaskId({
          taskTemplateId: template.id,
          epoch,
        });
        const existingTask = yield* taskById({ id: taskId });
        if (!existingTask) {
          newTasks.push(
            yield* templateToTask({
              tmpl: template,
              epoch,
            }),
          );
        }
      }
    }

    return newTasks;
  },
});

export const upcomingTemplateOccurrencesInRange = selector({
  name: "upcomingTemplateOccurrencesInRange",
  args: {
    fromInclusive: v.number(),
    toExclusive: v.number(),
  },
  handler: function* upcomingTemplateOccurrencesInRange({
    fromInclusive,
    toExclusive,
  }): Generator<unknown, UpcomingTemplateOccurrence[], unknown> {
    const templates = yield* allTaskTemplates({});
    const candidates: { template: TaskTemplate; epoch: number }[] = [];

    for (const template of templates) {
      if (candidates.length >= MAX_UPCOMING_OCCURRENCES) break;
      if (!template.repeatRule) continue;

      try {
        const policy = buildRecurrencePolicy(template);
        const r = createRuleWithDtstart(template.repeatRule, policy.dtstart);
        const range = policy.canonicalizeRange(
          new Date(fromInclusive),
          new Date(toExclusive - 1),
        );
        const dates = r.between(range.from, range.to, policy.inclusiveBetween);
        for (const date of dates) {
          if (candidates.length >= MAX_UPCOMING_OCCURRENCES) break;
          candidates.push({
            template,
            epoch: policy.occurrenceEpoch(date),
          });
        }
      } catch {
        continue;
      }
    }

    const taskIds: string[] = [];
    for (const candidate of candidates) {
      taskIds.push(
        yield* genTaskId({
          taskTemplateId: candidate.template.id,
          epoch: candidate.epoch,
        }),
      );
    }

    const existing = yield* tasksByIds({ ids: taskIds });
    const existingIds = new Set(existing.map((task) => task.id));
    const occurrences: UpcomingTemplateOccurrence[] = [];

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i]!;
      if (existingIds.has(taskIds[i]!)) continue;

      const startsAtMinutes = candidate.template.startsAtMinutes;
      const durationMinutes =
        candidate.template.durationMinutes ??
        (startsAtMinutes == null
          ? undefined
          : DEFAULT_TEMPLATE_DURATION_MINUTES);
      occurrences.push({
        id: `${candidate.template.id}:${candidate.epoch}`,
        templateId: candidate.template.id,
        title: candidate.template.title,
        date: getDMY(fromUTC(new Date(candidate.epoch))),
        epoch: candidate.epoch,
        projectSectionId: candidate.template.projectSectionId,
        sectionTitle: "",
        projectTitle: "",
        projectIcon: "🟡",
        ...(candidate.template.nature === undefined
          ? {}
          : { nature: candidate.template.nature }),
        ...(durationMinutes == null ? {} : { durationMinutes }),
        ...(startsAtMinutes == null
          ? {}
          : {
              startsAtMinutes,
              startsAt: occurrenceStartsAt(candidate.epoch, startsAtMinutes),
            }),
      });
    }

    const sectionIds = [
      ...new Set(occurrences.map((occurrence) => occurrence.projectSectionId)),
    ];
    const sections = sectionIds.length
      ? yield* selectFrom(projectSectionsTable, "byId").where((q) =>
          sectionIds.map((id) => q.eq("id", id)),
        )
      : [];
    const sectionById = new Map(
      sections.map((section) => [section.id, section]),
    );
    const projectIds = [
      ...new Set(sections.map((section) => section.projectId)),
    ];
    const projects = projectIds.length
      ? yield* selectFrom(projectsTable, "byId").where((q) =>
          projectIds.map((id) => q.eq("id", id)),
        )
      : [];
    const projectById = new Map(
      projects.map((project) => [project.id, project]),
    );

    for (const occurrence of occurrences) {
      const section = sectionById.get(occurrence.projectSectionId);
      if (!section) continue;
      occurrence.sectionTitle = section.title;
      const project = projectById.get(section.projectId);
      if (!project) continue;
      occurrence.projectTitle = project.title;
      occurrence.projectIcon = project.icon || "🟡";
    }

    return occurrences;
  },
});

export const newTasksToGenForTaskTemplate = selector({
  name: "newTasksToGenForTaskTemplate",
  args: {
    templateId: v.string(),
    toDate: v.number(),
  },
  handler: function* newTasksToGenForTaskTemplate({ templateId, toDate }) {
    const template = yield* taskTemplateById({ id: templateId });
    if (!template) return [];
    const to = new Date(toDate);

    const policy = buildRecurrencePolicy(template);
    const r = createRuleWithDtstart(template.repeatRule, policy.dtstart);
    const newTasks: Task[] = [];

    // Cap generation window to 2 weeks to avoid generating thousands of tasks
    const earliestFrom = Math.max(
      template.lastGeneratedAt,
      toDate - MAX_GENERATION_WINDOW_MS,
    );

    const range = policy.canonicalizeGenerationRange(
      new Date(earliestFrom),
      to,
    );
    const dates = r.between(range.from, range.to, policy.inclusiveBetween);

    for (const date of dates) {
      const epoch = policy.occurrenceEpoch(date);
      const taskId = yield* genTaskId({
        taskTemplateId: template.id,
        epoch,
      });
      const existingTask = yield* taskById({ id: taskId });
      if (!existingTask) {
        newTasks.push(
          yield* templateToTask({
            tmpl: template,
            epoch,
          }),
        );
      }
    }

    return newTasks;
  },
});

export const newTasksToGenForTaskTemplates = selector({
  name: "newTasksToGenForTaskTemplates",
  args: { toDate: v.number() },
  handler: function* newTasksToGenForTaskTemplates({ toDate }) {
    const templateIds = yield* taskTemplateIds({});
    const newTasks: Task[] = [];

    for (const templateId of templateIds) {
      const tasks = yield* newTasksToGenForTaskTemplate({
        templateId,
        toDate,
      });
      newTasks.push(...tasks);
    }

    return newTasks;
  },
});

export const taskTemplateCanDrop = selector({
  name: "taskTemplateCanDrop",
  args: {
    taskTemplateId: v.string(),
    dropId: v.string(),
    dropModelType: possibleModelType,
  },
  handler: function* taskTemplateCanDrop({
    taskTemplateId,
    dropId,
    dropModelType,
  }) {
    const template = yield* taskTemplateById({ id: taskTemplateId });
    if (!template) return false;

    const model = yield* appById({
      id: dropId,
      modelType: dropModelType,
    });
    if (!model) return false;

    if (isTask(model)) {
      return model.state === "todo";
    }

    if (isDailyEntry(model)) {
      const droppedTask = yield* taskById({ id: model.taskId });
      return droppedTask !== undefined && droppedTask.state === "todo";
    }

    if (
      yield* checklistItemCanDropOnParent({
        parentId: taskTemplateId,
        parentType: taskTemplateType,
        dropId,
        dropModelType,
      })
    ) {
      return true;
    }

    return isTaskTemplate(model);
  },
});

// Actions
export const createTaskTemplate = action({
  name: "createTaskTemplate",
  args: {
    now: v.number(),
    template: v.required(v.partial(taskTemplatesTable.v()), [
      "orderToken",
      "projectSectionId",
    ]),
  },
  handler: function* createTaskTemplate({ now, template }) {
    const id = template.id || uuidv7();

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
  },
});

export const updateTemplate = action({
  name: "updateTemplate",
  args: {
    id: v.string(),
    template: v.partial(taskTemplatesTable.v()),
  },
  handler: function* updateTemplate({ id, template }) {
    const templateInState = yield* taskTemplateById({ id });
    if (!templateInState) throw new Error("Template not found");

    const updatedTemplate: TaskTemplate = { ...templateInState, ...template };
    if (updatedTemplate.startsAtMinutes === undefined) {
      delete updatedTemplate.startsAtMinutes;
    }
    if (updatedTemplate.durationMinutes === undefined) {
      delete updatedTemplate.durationMinutes;
    }
    yield* upsert(taskTemplatesTable, [updatedTemplate]);
    return updatedTemplate;
  },
});

export const deleteTemplates = action({
  name: "deleteTemplates",
  args: { taskTemplateIds: v.array(v.string()) },
  handler: function* deleteTemplates({ taskTemplateIds }) {
    const taskIds = yield* taskIdsOfTemplateId({ ids: taskTemplateIds });
    for (const tId of taskIds) {
      yield* updateTask({
        id: tId,
        task: {
          templateId: null,
          templateDate: null,
        },
      });
    }
    yield* deleteForParents({
      parentIds: taskTemplateIds,
      parentType: taskTemplateType,
    });
    yield* deleteRows(taskTemplatesTable, taskTemplateIds);
  },
});

export const createTaskTemplateFromTask = action({
  name: "createTaskTemplateFromTask",
  args: {
    task: tasksTable.v(),
    data: v.partial(taskTemplatesTable.v()),
    now: v.number(),
  },
  handler: function* createTaskTemplateFromTask({ task, data, now }) {
    const newId = uuidv7();
    yield* copyItems({
      fromParentId: task.id,
      fromParentType: taskType,
      toParentId: newId,
      toParentType: taskTemplateType,
    });
    yield* deleteTasks({ ids: [task.id] });

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
      projectSectionId: task.projectSectionId,
      ...data,
    };

    yield* insert(taskTemplatesTable, [template]);
    yield* generateTasksForTemplateIds({
      templateIds: [template.id],
      toDate: now,
    });
    return template;
  },
});

export const taskTemplateHandleDrop = action({
  name: "taskTemplateHandleDrop",
  args: {
    taskTemplateId: v.string(),
    dropId: v.string(),
    dropModelType: possibleModelType,
    edge: v.union(v.literal("top"), v.literal("bottom")),
  },
  handler: function* taskTemplateHandleDrop({
    taskTemplateId,
    dropId,
    dropModelType,
    edge,
  }) {
    if (
      !(yield* taskTemplateCanDrop({
        taskTemplateId,
        dropId,
        dropModelType,
      }))
    )
      return;

    const template = yield* taskTemplateById({ id: taskTemplateId });
    if (!template) return;

    const dropItem = yield* appById({
      id: dropId,
      modelType: dropModelType,
    });
    if (!dropItem) return;

    const orderToken = generateKeyPositionedBetween(
      template,
      yield* projectSectionItemSiblings({ itemId: taskTemplateId }),
      edge === "top" ? "before" : "after",
    );

    if (isTask(dropItem)) {
      yield* updateTask({
        id: dropItem.id,
        task: {
          projectSectionId: template.projectSectionId,
          orderToken,
        },
      });
    } else if (isTaskTemplate(dropItem)) {
      yield* updateTemplate({
        id: dropItem.id,
        template: {
          projectSectionId: template.projectSectionId,
          orderToken,
        },
      });
    } else if (isDailyEntry(dropItem)) {
      const droppedTask = yield* taskById({ id: dropItem.taskId });
      if (droppedTask) {
        yield* updateTask({
          id: droppedTask.id,
          task: {
            projectSectionId: template.projectSectionId,
            orderToken,
          },
        });
      }
    } else if (
      yield* checklistItemCanDropOnParent({
        parentId: taskTemplateId,
        parentType: taskTemplateType,
        dropId,
        dropModelType,
      })
    ) {
      yield* checklistItemHandleDropOnParent({
        parentId: taskTemplateId,
        parentType: taskTemplateType,
        dropId,
        dropModelType,
        edge,
      });
    }
  },
});

function* generateTasksForTemplateIds({
  templateIds,
  toDate,
}: {
  templateIds: string[];
  toDate: number;
}) {
  let generatedCount = 0;

  for (const templateId of templateIds) {
    const newTasks = yield* newTasksToGenForTaskTemplate({
      templateId,
      toDate,
    });

    for (const task of newTasks) {
      if (task.templateId === null) {
        throw new Error("TemplateId is null");
      }

      yield* createTaskAfterSectionItem({
        itemId: task.templateId,
        taskParams: { ...task },
      });
      yield* copyItems({
        fromParentId: task.templateId,
        fromParentType: taskTemplateType,
        toParentId: task.id,
        toParentType: taskType,
      });

      const localDate = fromUTC(new Date(task.createdAt));
      yield* createEntryInDailyList({
        taskId: task.id,
        date: getDMY(localDate),
      });
      generatedCount += 1;
    }

    // lastGeneratedAt is a generation checkpoint, not the last occurrence.
    // Advancing it even when no task is due prevents rescanning the template on
    // every access between occurrences.
    yield* updateTemplate({
      id: templateId,
      template: { lastGeneratedAt: toDate },
    });
  }

  return generatedCount;
}

export const generateTasksFromTemplates = action({
  name: "generateTasksFromTemplates",
  args: { toDate: v.number() },
  handler: function* generateTasksFromTemplates({ toDate }) {
    const templateIds = yield* taskTemplateIds({});
    return yield* generateTasksForTemplateIds({ templateIds, toDate });
  },
});

export const generateTasksForTemplate = action({
  name: "generateTasksForTemplate",
  args: { templateId: v.string(), toDate: v.number() },
  handler: function* generateTasksForTemplate({ templateId, toDate }) {
    return yield* generateTasksForTemplateIds({
      templateIds: [templateId],
      toDate,
    });
  },
});

export const generateSpaceTasksIfDue = action({
  name: "generateSpaceTasksIfDue",
  args: {
    toDate: v.number(),
    intervalMs: v.number(),
    force: v.boolean(),
  },
  handler: function* generateSpaceTasksIfDue({ toDate, intervalMs, force }) {
    if (intervalMs < 0) throw new Error("intervalMs cannot be negative");

    const templates = force
      ? yield* selectFrom(taskTemplatesTable, "byLastGeneratedAt")
      : yield* selectFrom(taskTemplatesTable, "byLastGeneratedAt").where((q) =>
          q.lte("lastGeneratedAt", toDate - intervalMs),
        );

    return yield* generateTasksForTemplateIds({
      templateIds: templates.map((template) => template.id),
      toDate,
    });
  },
});

export const cleanAllTaskTemplates = action({
  name: "cleanAllTaskTemplates",
  args: {},
  handler: function* cleanAllTaskTemplates() {
    const templates = yield* allTaskTemplates({});
    for (const template of templates) {
      yield* deleteRows(taskTemplatesTable, [template.id]);
    }
  },
});

export const moveTemplateToProject = action({
  name: "moveTemplateToProject",
  args: {
    templateId: v.string(),
    projectId: v.string(),
  },
  handler: function* moveTemplateToProject({ templateId, projectId }) {
    const template = yield* taskTemplateById({ id: templateId });
    if (!template) throw new Error("Template not found");

    const firstSection = yield* firstProjectSectionChild({ projectId });
    if (!firstSection) throw new Error("No sections found");

    yield* updateTemplate({
      id: templateId,
      template: {
        projectSectionId: firstSection.id,
      },
    });
  },
});

// Local slice object for registerModelSlice (not exported)
const taskTemplatesSlice = {
  byId: taskTemplateById,
  delete: deleteTemplates,
  canDrop: taskTemplateCanDrop,
  handleDrop: taskTemplateHandleDrop,
};

registerModelSlice(taskTemplatesSlice, taskTemplatesTable, taskTemplateType);
