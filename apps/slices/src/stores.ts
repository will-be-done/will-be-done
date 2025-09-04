import { isObjectType } from "./utils";
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
import { generateJitteredKeyBetween } from "fractional-indexing-jittered";
import { uuidv7 } from "uuidv7";
import { RRule } from "rrule";
import { generateKeyPositionedBetween } from "./utils";
import { assertUnreachable } from "./utils";
import uuidByString from "uuid-by-string";

// TODO: remain to check:
// 1. DONE projections slice
// 2. DONE project item slice
// 3. DONE project slice
// 4. DONE task box slice
// 5. DONE task slice
// 6. DONE task template slice
//
// also need to fix all misused updates

// Utility types and functions
export type OrderableItem = {
  orderToken: string;
};

export function timeCompare(
  a: { lastToggledAt: number },
  b: { lastToggledAt: number },
): number {
  return b.lastToggledAt - a.lastToggledAt;
}

function* generateOrderTokenPositioned(
  parentId: string,
  current: {
    lastChild(parentId: string): GenReturn<OrderableItem | undefined>;
    firstChild(parentId: string): GenReturn<OrderableItem | undefined>;
  },
  position:
    | [OrderableItem | undefined, OrderableItem | undefined]
    | "append"
    | "prepend",
) {
  if (position === "append") {
    return generateJitteredKeyBetween(
      (yield* current.lastChild(parentId))?.orderToken || null,
      null,
    );
  }

  if (position === "prepend") {
    // const firstChild = yield* current.firstChild(parentId);
    // console.log(
    //   "prepend",
    //   yield* current.firstChild(parentId),
    //   generateJitteredKeyBetween(
    //     null,
    //     (yield* current.firstChild(parentId))?.orderToken || null,
    //   ),
    // );

    return generateJitteredKeyBetween(
      null,
      (yield* current.firstChild(parentId))?.orderToken || null,
    );
  }

  return generateJitteredKeyBetween(
    position[0]?.orderToken || null,
    position[1]?.orderToken || null,
  );
}

export const taskType = "task";
type TaskState = "todo" | "done";
export type Task = {
  type: typeof taskType;
  id: string;
  title: string;
  state: TaskState;
  projectId: string;
  orderToken: string;
  lastToggledAt: number;
  horizon: "week" | "month" | "year" | "someday";
  createdAt: number;
  templateId: string | null;
  templateDate: number | null;
};
export const isTask = isObjectType<Task>(taskType);
export const defaultTask: Task = {
  type: taskType,
  id: "17748950-3b32-4893-8fa8-ccdb269f7c52",
  title: "default task kek",
  state: "todo",
  projectId: "",
  orderToken: "",
  lastToggledAt: 0,
  createdAt: 0,
  horizon: "someday",
  templateId: null,
  templateDate: null,
};
const tasksTable = table<Task>("tasks").withIndexes({
  byIds: { cols: ["id"], type: "btree" },
  byId: { cols: ["id"], type: "hash" },
  byProjectIdOrderStates: {
    cols: ["projectId", "state", "orderToken"],
    type: "btree",
  },
  byTemplateId: {
    cols: ["templateId"],
    type: "hash",
  },
});

export const projectionType = "projection";
export const isTaskProjection = isObjectType<TaskProjection>(projectionType);
export type TaskProjection = {
  type: typeof projectionType;
  id: string;
  taskId: string;
  orderToken: string;
  dailyListId: string;
  createdAt: number;
};
const defaultTaskProjection: TaskProjection = {
  type: projectionType,
  id: "default-projection-id",
  taskId: "",
  orderToken: "",
  dailyListId: "",
  createdAt: 0,
};
const taskProjectionsTable = table<TaskProjection>(
  "task_projections",
).withIndexes({
  byId: { cols: ["id"], type: "hash" },
  byIds: { cols: ["id"], type: "btree" },
  byTaskIdCreatedAt: { cols: ["taskId", "createdAt"], type: "btree" },
  byDailyListId: { cols: ["dailyListId"], type: "hash" },
  byDailyListIdTokenOrdered: {
    cols: ["dailyListId", "orderToken"],
    type: "btree",
  },
});

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

type GenReturn<T> = Generator<unknown, T, unknown>;

export const projectType = "project";
export type Project = {
  type: typeof projectType;
  id: string;
  title: string;
  icon: string;
  isInbox: boolean;
  orderToken: string;
  createdAt: number;
};
export const isProject = isObjectType<Project>(projectType);
export const defaultProject: Project = {
  type: projectType,
  id: "default-project-id",
  title: "default project",
  icon: "",
  isInbox: false,
  orderToken: "",
  createdAt: 0,
};
const projectsTable = table<Project>("projects").withIndexes({
  byId: { cols: ["id"], type: "hash" },
  byIds: { cols: ["id"], type: "btree" },
  byOrderToken: { cols: ["orderToken"], type: "btree" },
  byIsInbox: { cols: ["isInbox"], type: "hash" },
});

export const dailyListType = "dailyList";
export type DailyList = {
  type: typeof dailyListType;
  id: string;
  date: string;
};
export const isDailyList = isObjectType<DailyList>(dailyListType);
export const defaultDailyList: DailyList = {
  type: dailyListType,
  id: "default-daily-list-id",
  date: "",
};
const dailyListsTable = table<DailyList>("daily_lists").withIndexes({
  byId: { cols: ["id"], type: "hash" },
  byIds: { cols: ["id"], type: "btree" },
  byDate: { cols: ["date"], type: "hash" },
});

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

// Template utility functions
function generateTaskId(taskTemplateId: string, date: Date): string {
  return taskTemplateId + "_" + date.getTime();
}

function templateToTask(tmpl: TaskTemplate, date: Date): Task {
  return {
    type: taskType,
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

export const projectsSlice2 = {
  // selectors
  byId: selector(function* (id: string): GenReturn<Project | undefined> {
    const projects = yield* runQuery(
      selectFrom(projectsTable, "byId")
        .where((q) => q.eq("id", id))
        .limit(1),
    );
    return projects[0];
  }),
  byIdOrDefault: selector(function* (id: string): GenReturn<Project> {
    return (yield* projectsSlice2.byId(id)) || defaultProject;
  }),
  canDrop: selector(function* (
    projectId: string,
    dropItemId: string,
  ): GenReturn<boolean> {
    const project = yield* projectsSlice2.byId(projectId);
    if (!project) return false;

    const dropItem = yield* appSlice2.byId(dropItemId);
    if (!dropItem) return false;

    // Projects can accept tasks, templates, projections, and other projects
    return (
      isProject(dropItem) ||
      isTask(dropItem) ||
      isTaskTemplate(dropItem) ||
      isTaskProjection(dropItem)
    );
  }),

  // actions
  createInboxIfNotExists: action(function* (): GenReturn<Project> {
    const inbox = yield* projectsSlice2.byId(inboxId);
    if (inbox) {
      return inbox;
    }

    return yield* projectsSlice2.create(
      {
        id: inboxId,
        title: "Inbox",
        icon: "",
        isInbox: true,
        orderToken: generateJitteredKeyBetween(null, null),
        createdAt: new Date().getTime(),
      },
      [undefined, undefined],
    );
  }),
  create: action(function* (
    project: Partial<Project>,
    position:
      | [OrderableItem | undefined, OrderableItem | undefined]
      | "append"
      | "prepend",
  ): GenReturn<Project> {
    const orderToken = yield* generateOrderTokenPositioned(
      "all-projects-list",
      allProjectsSlice2,
      position,
    );

    const id = project.id || uuidv7();
    const newProject: Project = {
      type: projectType,
      id,
      title: "New project",
      icon: "",
      isInbox: false,
      createdAt: Date.now(),
      orderToken: orderToken,
      ...project,
    };

    yield* insert(projectsTable, [newProject]);
    return newProject;
  }),
  update: action(function* (
    id: string,
    project: Partial<Project>,
  ): GenReturn<void> {
    const projectInState = yield* projectsSlice2.byId(id);
    if (!projectInState) throw new Error("Project not found");

    yield* update(projectsTable, [{ ...projectInState, ...project }]);
  }),
  delete: action(function* (id: string): GenReturn<void> {
    yield* deleteRows(projectsTable, [id]);
  }),
  handleDrop: action(function* (
    projectId: string,
    dropItemId: string,
    edge: "top" | "bottom",
  ): GenReturn<void> {
    const canDrop = yield* projectsSlice2.canDrop(projectId, dropItemId);
    if (!canDrop) return;

    const project = yield* projectsSlice2.byId(projectId);
    if (!project) throw new Error("Project not found");

    const dropItem = yield* appSlice2.byId(dropItemId);
    if (!dropItem) throw new Error("Target not found");

    if (isProject(dropItem)) {
      // Reorder projects - would need proper fractional indexing
      const [up, down] = yield* allProjectsSlice2.siblings(project.id);

      let orderToken: string;
      if (edge === "top") {
        orderToken = generateJitteredKeyBetween(
          up?.orderToken || null,
          project.orderToken,
        );
      } else {
        orderToken = generateJitteredKeyBetween(
          project.orderToken,
          down?.orderToken || null,
        );
      }

      yield* projectsSlice2.update(dropItem.id, { orderToken });
    } else if (isTask(dropItem) || isTaskTemplate(dropItem)) {
      // Move task/template to this project
      if (isTask(dropItem)) {
        yield* tasksSlice2.update(dropItem.id, { projectId: project.id });
      } else {
        yield* taskTemplatesSlice2.update(dropItem.id, {
          projectId: project.id,
        });
      }
    } else if (isTaskProjection(dropItem)) {
      // Move the underlying task to this project
      const task = yield* tasksSlice2.byId(dropItem.taskId);
      if (task) {
        yield* tasksSlice2.update(task.id, { projectId: project.id });
      }
    } else {
      shouldNeverHappen("unknown drop item type", dropItem);
    }
  }),
};

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

export const taskTemplatesSlice2 = {
  // selectors
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
  delete: action(function* (id: string): GenReturn<void> {
    const taskIds = yield* tasksSlice2.taskIdsOfTemplateId(id);
    for (const tId of taskIds) {
      yield* tasksSlice2.update(tId, {
        templateId: undefined,
        templateDate: undefined,
      });
    }
    yield* deleteRows(taskTemplatesTable, [id]);
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

export const inboxId = "01965eb2-7d13-727f-9f50-3d565d0ce2ef";
export function getDMY(date: Date): string {
  return date.toISOString().split("T")[0]!;
}

export const dailyListsSlice2 = {
  // selectors
  byId: selector(function* (id: string): GenReturn<DailyList | undefined> {
    const dailyLists = yield* runQuery(
      selectFrom(dailyListsTable, "byId")
        .where((q) => q.eq("id", id))
        .limit(1),
    );
    return dailyLists[0];
  }),
  byIdOrDefault: selector(function* (id: string): GenReturn<DailyList> {
    return (yield* dailyListsSlice2.byId(id)) || defaultDailyList;
  }),
  byDate: selector(function* (date: string): GenReturn<DailyList | undefined> {
    const dailyLists = yield* runQuery(
      selectFrom(dailyListsTable, "byDate")
        .where((q) => q.eq("date", date))
        .limit(1),
    );
    return dailyLists[0];
  }),
  childrenIds: selector(function* (
    dailyListId: string,
    includeOnlyProjectIds: string[] = [],
  ): GenReturn<string[]> {
    const projections = yield* runQuery(
      selectFrom(taskProjectionsTable, "byDailyListIdTokenOrdered").where((q) =>
        q.eq("dailyListId", dailyListId),
      ),
    );

    const todoProjections: TaskProjection[] = [];
    for (const proj of projections) {
      const task = yield* tasksSlice2.byId(proj.taskId);
      if (
        task?.state === "todo" &&
        (includeOnlyProjectIds.length === 0 ||
          includeOnlyProjectIds.includes(task.projectId))
      ) {
        todoProjections.push(proj);
      }
    }

    return todoProjections.map((proj) => proj.id);
  }),
  doneChildrenIds: selector(function* (
    dailyListId: string,
    includeOnlyProjectIds: string[] = [],
  ): GenReturn<string[]> {
    const projections = yield* runQuery(
      selectFrom(taskProjectionsTable, "byDailyListIdTokenOrdered").where((q) =>
        q.eq("dailyListId", dailyListId),
      ),
    );

    const doneProjections: { id: string; lastToggledAt: number }[] = [];
    for (const proj of projections) {
      const task = yield* tasksSlice2.byId(proj.taskId);
      if (
        task?.state === "done" &&
        (includeOnlyProjectIds.length === 0 ||
          includeOnlyProjectIds.includes(task.projectId))
      ) {
        doneProjections.push({
          id: proj.id,
          lastToggledAt: task.lastToggledAt,
        });
      }
    }

    return doneProjections
      .sort((a, b) => b.lastToggledAt - a.lastToggledAt)
      .map((proj) => proj.id);
  }),
  taskIds: selector(function* (dailyListId: string): GenReturn<string[]> {
    const childrenIds = yield* dailyListsSlice2.childrenIds(dailyListId);

    return (yield* projectionsSlice2.byIds(childrenIds)).map((p) => p.taskId);
  }),
  allTaskIds: selector(function* (
    dailyListIds: string[],
  ): GenReturn<Set<string>> {
    const allTaskIds = new Set<string>();

    for (const dailyListId of dailyListIds) {
      const taskIds = yield* dailyListsSlice2.taskIds(dailyListId);
      taskIds.forEach((id) => allTaskIds.add(id));
    }

    return allTaskIds;
  }),
  notDoneTaskIdsExceptDailies: selector(function* (
    projectId: string,
    exceptDailyListIds: string[],
    taskHorizons: Task["horizon"][],
    alwaysIncludeTaskIds: string[] = [],
  ): GenReturn<string[]> {
    const exceptTaskIds =
      yield* dailyListsSlice2.allTaskIds(exceptDailyListIds);

    // Get all tasks from the project that match the horizons
    const notDoneTaskIds = yield* projectItemsSlice2.notDoneTaskIds(
      projectId,
      taskHorizons,
      alwaysIncludeTaskIds,
    );

    return notDoneTaskIds.filter((id) => !exceptTaskIds.has(id));
  }),
  // TODO: use hash index
  dateIdsMap: selector(function* (): GenReturn<Record<string, string>> {
    const allDailyLists = yield* runQuery(selectFrom(dailyListsTable, "byIds"));
    return Object.fromEntries(allDailyLists.map((d) => [d.date, d.id]));
  }),
  idByDate: selector(function* (date: Date): GenReturn<string | undefined> {
    const dateIdsMap = yield* dailyListsSlice2.dateIdsMap();
    const dmy = getDMY(date);
    return dateIdsMap[dmy];
  }),
  idsByDates: selector(function* (dates: Date[]): GenReturn<string[]> {
    const dateIdsMap = yield* dailyListsSlice2.dateIdsMap();
    return dates
      .map((date) => {
        const dmy = getDMY(date);
        return dateIdsMap[dmy];
      })
      .filter((id) => id !== undefined);
  }),
  firstChild: selector(function* (
    dailyListId: string,
  ): GenReturn<TaskProjection | undefined> {
    const childrenIds = yield* dailyListsSlice2.childrenIds(dailyListId);
    const firstChildId = childrenIds[0];
    return firstChildId
      ? yield* projectionsSlice2.byId(firstChildId)
      : undefined;
  }),
  lastChild: selector(function* (
    dailyListId: string,
  ): GenReturn<TaskProjection | undefined> {
    const childrenIds = yield* dailyListsSlice2.childrenIds(dailyListId);
    const lastChildId = childrenIds[childrenIds.length - 1];
    return lastChildId ? yield* projectionsSlice2.byId(lastChildId) : undefined;
  }),
  canDrop: selector(function* (
    dailyListId: string,
    dropId: string,
  ): GenReturn<boolean> {
    const model = yield* appSlice2.byId(dropId);
    if (!model) return false;

    if (!isTaskProjection(model) && !isTask(model)) {
      return false;
    }

    if (isTask(model) && model.state === "done") {
      return true;
    }

    if (isTaskProjection(model)) {
      const task = yield* tasksSlice2.byId(model.taskId);
      if (!task) return false;
      if (task.state === "done") {
        return true;
      }
    }

    const childrenIds = yield* dailyListsSlice2.childrenIds(dailyListId);
    return childrenIds.length === 0;
  }),

  // actions
  create: action(function* (dailyList: { date: string }): GenReturn<DailyList> {
    const id = uuidByString(dailyList.date);
    const newDailyList: DailyList = {
      type: dailyListType,
      id,
      date: dailyList.date,
    };

    yield* insert(dailyListsTable, [newDailyList]);
    return newDailyList;
  }),
  createIfNotPresent: action(function* (date: string): GenReturn<DailyList> {
    const existing = yield* dailyListsSlice2.byDate(date);
    if (existing) {
      return existing;
    }

    return yield* dailyListsSlice2.create({ date });
  }),
  createManyIfNotPresent: action(function* (
    dates: Date[],
  ): GenReturn<DailyList[]> {
    const results: DailyList[] = [];
    for (const date of dates) {
      const dmy = getDMY(date);
      const dailyList = yield* dailyListsSlice2.createIfNotPresent(dmy);
      results.push(dailyList);
    }
    return results;
  }),
  delete: action(function* (id: string): GenReturn<void> {
    yield* deleteRows(dailyListsTable, [id]);
  }),
  createProjection: action(function* (
    dailyListId: string,
    taskId: string,
    listPosition:
      | [OrderableItem | undefined, OrderableItem | undefined]
      | "append"
      | "prepend",
  ): GenReturn<TaskProjection> {
    const orderToken = yield* generateOrderTokenPositioned(
      dailyListId,
      dailyListsSlice2,
      listPosition,
    );

    return yield* projectionsSlice2.create({
      taskId: taskId,
      dailyListId: dailyListId,
      orderToken: orderToken,
    });
  }),
  createProjectionWithTask: action(function* (
    dailyListId: string,
    projectId: string,
    listPosition:
      | [OrderableItem | undefined, OrderableItem | undefined]
      | "append"
      | "prepend",
    projectPosition:
      | [OrderableItem | undefined, OrderableItem | undefined]
      | "append"
      | "prepend",
  ): GenReturn<TaskProjection> {
    const task = yield* projectItemsSlice2.createTask(
      projectId,
      projectPosition,
    );

    return yield* dailyListsSlice2.createProjection(
      dailyListId,
      task.id,
      listPosition,
    );
  }),
  handleDrop: action(function* (
    dailyListId: string,
    dropId: string,
    _edge: "top" | "bottom",
  ): GenReturn<void> {
    const firstChild = yield* dailyListsSlice2.firstChild(dailyListId);
    const between: [string | null, string | null] = [
      null,
      firstChild?.orderToken || null,
    ];

    const orderToken = generateJitteredKeyBetween(
      between[0] || null,
      between[1] || null,
    );

    const dailyList = yield* dailyListsSlice2.byId(dailyListId);
    if (!dailyList) return;

    const drop = yield* appSlice2.byId(dropId);
    if (!drop) return;

    if (isTaskProjection(drop)) {
      yield* projectionsSlice2.update(drop.id, {
        orderToken,
        dailyListId: dailyList.id,
      });
    } else if (isTask(drop)) {
      yield* dailyListsSlice2.createProjection(dailyList.id, drop.id, [
        undefined,
        firstChild,
      ]);
    }
  }),
};

export const projectItemsSlice2 = {
  // selectors
  childrenIds: selector(function* (
    projectId: string,
    alwaysIncludeChildIds: string[] = [],
  ): GenReturn<string[]> {
    // TODO: maybe use merge sort?
    const tasks = yield* runQuery(
      selectFrom(tasksTable, "byProjectIdOrderStates").where((q) =>
        q.eq("projectId", projectId).eq("state", "todo"),
      ),
    );

    const templates = yield* runQuery(
      selectFrom(taskTemplatesTable, "byProjectIdOrderToken").where((q) =>
        q.eq("projectId", projectId),
      ),
    );

    // Filter for alwaysIncludeChildIds
    // const additionalTasks =
    //   alwaysIncludeChildIds.length > 0
    //     ? yield* runQuery(
    //         selectFrom(tasksTable, "byId").where((q) =>
    //           alwaysIncludeChildIds.map((id) => q.eq("id", id)),
    //         ),
    //       )
    //     : [];
    //
    // const additionalTemplates =
    //   alwaysIncludeChildIds.length > 0
    //     ? yield* runQuery(
    //         selectFrom(taskTemplatesTable, "byId").where((q) =>
    //           alwaysIncludeChildIds.map((id) => q.eq("id", id)),
    //         ),
    //       )
    //     : [];

    const allItems = [
      ...tasks,
      ...templates,
      // ...additionalTasks.filter((t) => !tasks.some((task) => task.id === t.id)),
      // ...additionalTemplates.filter(
      //   (t) => !templates.some((template) => template.id === t.id),
      // ),
    ];

    return allItems
      .sort((a, b) => {
        if (a.orderToken > b.orderToken) {
          return 1;
        }
        if (a.orderToken < b.orderToken) {
          return -1;
        }

        return 0;
      })
      .map((item) => item.id);
  }),
  doneChildrenIds: selector(function* (
    projectId: string,
    alwaysIncludeTaskIds: string[] = [],
  ): GenReturn<string[]> {
    const tasks = yield* runQuery(
      selectFrom(tasksTable, "byProjectIdOrderStates").where((q) =>
        q.eq("projectId", projectId).eq("state", "done"),
      ),
    );

    // const alwaysIncludeTasks =
    //   alwaysIncludeTaskIds.length > 0
    //     ? (yield* runQuery(
    //         selectFrom(tasksTable, "byId").where((q) =>
    //           or(...alwaysIncludeTaskIds.map((id) => q.eq("id", id))),
    //         ),
    //       )).filter((t) => t.state === "done")
    //     : [];

    const alwaysIncludeTasks: Task[] = [];

    const sortedDoneTasks = [...tasks, ...alwaysIncludeTasks].sort(timeCompare);

    return sortedDoneTasks.map((p) => p.id);
  }),
  tasksIds: selector(function* (projectId: string): GenReturn<string[]> {
    const tasks = yield* runQuery(
      selectFrom(tasksTable, "byProjectIdOrderStates").where((q) =>
        q.eq("projectId", projectId).eq("state", "todo"),
      ),
    );
    return tasks.map((t) => t.id);
  }),
  tasks: selector(function* (projectId: string): GenReturn<Task[]> {
    return yield* runQuery(
      selectFrom(tasksTable, "byProjectIdOrderStates").where((q) =>
        q.eq("projectId", projectId).eq("state", "todo"),
      ),
    );
  }),
  notDoneTaskIds: selector(function* (
    projectId: string,
    taskHorizons: Task["horizon"][],
    alwaysIncludeTaskIds: string[] = [],
  ): GenReturn<string[]> {
    const tasks = yield* projectItemsSlice2.tasks(projectId);
    const filteredTaskIds: string[] = [];

    for (const task of tasks) {
      if (!task || task.state === "done") continue;

      if (
        taskHorizons.includes(task.horizon)
        // alwaysIncludeTaskIds.includes(task.id)
      ) {
        filteredTaskIds.push(task.id);
      }
    }

    return filteredTaskIds;
  }),
  withoutTasksByIds: selector(function* (
    projectId: string,
    excludeIds: string[],
  ): GenReturn<string[]> {
    const childrenIds = yield* projectItemsSlice2.childrenIds(projectId);
    const excludeSet = new Set(excludeIds);
    return childrenIds.filter((id) => !excludeSet.has(id));
  }),
  getItemById: selector(function* (id: string): GenReturn<Task | TaskTemplate> {
    const task = yield* tasksSlice2.byId(id);
    if (task) return task;

    const template = yield* taskTemplatesSlice2.byId(id);
    if (template) return template;

    return defaultTask;
  }),
  siblings: selector(function* (
    itemId: string,
  ): GenReturn<
    [(Task | TaskTemplate) | undefined, (Task | TaskTemplate) | undefined]
  > {
    const item = yield* projectItemsSlice2.getItemById(itemId);
    if (!item) return [undefined, undefined];

    const childrenIds = yield* projectItemsSlice2.childrenIds(item.projectId);
    const index = childrenIds.findIndex((id) => id === itemId);

    const beforeId = index > 0 ? childrenIds[index - 1] : undefined;
    const afterId =
      index < childrenIds.length - 1 ? childrenIds[index + 1] : undefined;

    const before = beforeId
      ? yield* projectItemsSlice2.getItemById(beforeId)
      : undefined;
    const after = afterId
      ? yield* projectItemsSlice2.getItemById(afterId)
      : undefined;

    return [before, after];
  }),
  childrenCount: selector(function* (projectId: string): GenReturn<number> {
    const children = yield* projectItemsSlice2.childrenIds(projectId);
    return children.length;
  }),
  firstChild: selector(function* (
    projectId: string,
  ): GenReturn<(Task | TaskTemplate) | undefined> {
    const children = yield* projectItemsSlice2.childrenIds(projectId);
    const firstChildId = children[0];
    return firstChildId
      ? yield* projectItemsSlice2.getItemById(firstChildId)
      : undefined;
  }),
  lastChild: selector(function* (
    projectId: string,
  ): GenReturn<(Task | TaskTemplate) | undefined> {
    const children = yield* projectItemsSlice2.childrenIds(projectId);
    const lastChildId = children[children.length - 1];
    return lastChildId
      ? yield* projectItemsSlice2.getItemById(lastChildId)
      : undefined;
  }),

  // actions
  deleteById: action(function* (id: string): GenReturn<void> {
    yield* tasksSlice2.delete([id]);
    yield* deleteRows(taskTemplatesTable, [id]);
  }),
  createTask: action(function* (
    projectId: string,
    position:
      | [OrderableItem | undefined, OrderableItem | undefined]
      | "append"
      | "prepend",
    taskAttrs?: Partial<Task>,
  ): GenReturn<Task> {
    const project = yield* projectsSlice2.byId(projectId);
    if (!project) throw new Error("Project not found");

    const orderToken = yield* generateOrderTokenPositioned(
      projectId,
      projectItemsSlice2,
      position,
    );

    return yield* tasksSlice2.createTask({
      ...taskAttrs,
      orderToken: orderToken,
      projectId: projectId,
    });
  }),
  createSibling: action(function* (
    itemId: string,
    position: "before" | "after",
    taskParams?: Partial<Task>,
  ): GenReturn<Task> {
    const projectItem = yield* projectItemsSlice2.getItemById(itemId);
    if (!projectItem) throw new Error("Item not found");

    return yield* tasksSlice2.createTask({
      projectId: projectItem.projectId,
      orderToken: generateKeyPositionedBetween(
        projectItem,
        yield* projectItemsSlice2.siblings(itemId),
        position,
      ),
      ...taskParams,
    });
  }),
};

export const projectionsSlice2 = {
  // selectors
  byId: selector(function* (id: string): GenReturn<TaskProjection | undefined> {
    const projections = yield* runQuery(
      selectFrom(taskProjectionsTable, "byId").where((q) => q.eq("id", id)),
    );

    return projections[0];
  }),
  byIds: selector(function* (ids: string[]): GenReturn<TaskProjection[]> {
    const projections = yield* runQuery(
      selectFrom(taskProjectionsTable, "byId").where((q) =>
        ids.map((id) => q.eq("id", id)),
      ),
    );

    return projections;
  }),
  byIdOrDefault: selector(function* (id: string): GenReturn<TaskProjection> {
    return (yield* projectionsSlice2.byId(id)) || defaultTaskProjection;
  }),
  canDrop: selector(function* (
    taskProjectionId: string,
    dropId: string,
  ): GenReturn<boolean> {
    const model = yield* appSlice2.byId(dropId);
    if (!model) return false;

    const projection = yield* projectionsSlice2.byId(taskProjectionId);
    if (!projection) return false;

    const projectionTask = yield* tasksSlice2.byId(projection.taskId);
    if (!projectionTask) return false;

    if (projectionTask.state === "done") {
      return false;
    }

    if (isTaskProjection(model)) {
      const modelTask = yield* tasksSlice2.byId(model.taskId);
      if (!modelTask) return false;

      if (modelTask.state === "done") {
        return false;
      }
    }

    return isTaskProjection(model) || isTask(model);
  }),
  siblings: selector(function* (
    taskProjectionId: string,
  ): GenReturn<[TaskProjection | undefined, TaskProjection | undefined]> {
    const item = yield* projectionsSlice2.byId(taskProjectionId);
    if (!item) return [undefined, undefined];

    const sortedProjections = yield* runQuery(
      selectFrom(taskProjectionsTable, "byDailyListIdTokenOrdered").where((q) =>
        q.eq("dailyListId", item.dailyListId),
      ),
    );

    const index = sortedProjections.findIndex((p) => p.id === taskProjectionId);

    const before = index > 0 ? sortedProjections[index - 1] : undefined;
    const after =
      index < sortedProjections.length - 1
        ? sortedProjections[index + 1]
        : undefined;

    return [before, after];
  }),
  sortedProjectionIdsByTaskId: selector(function* (
    taskId: string,
  ): GenReturn<string[]> {
    const projections = yield* runQuery(
      selectFrom(taskProjectionsTable, "byTaskIdCreatedAt").where((q) =>
        q.eq("taskId", taskId),
      ),
    );

    return projections.map((p) => p.id);
  }),
  sortedProjectionsOfTask: selector(function* (
    taskId: string,
  ): GenReturn<TaskProjection[]> {
    const projections = yield* runQuery(
      selectFrom(taskProjectionsTable, "byTaskIdCreatedAt").where((q) =>
        q.eq("taskId", taskId),
      ),
    );

    return projections;
  }),
  lastProjectionOfTask: selector(function* (
    taskId: string,
  ): GenReturn<TaskProjection | undefined> {
    const projections =
      yield* projectionsSlice2.sortedProjectionsOfTask(taskId);

    if (projections.length === 0) return undefined;
    return projections[projections.length - 1];
  }),

  // actions
  delete: action(function* (id: string): GenReturn<void> {
    yield* deleteRows(taskProjectionsTable, [id]);
  }),
  deleteProjectionsOfTask: action(function* (
    taskIds: string[],
  ): GenReturn<void> {
    const projectionIds: string[] = [];

    for (const taskId of taskIds) {
      const ids = yield* projectionsSlice2.sortedProjectionIdsByTaskId(taskId);
      projectionIds.push(...ids);
    }

    yield* deleteRows(taskProjectionsTable, projectionIds);
  }),
  create: action(function* (
    projection: Partial<TaskProjection> & {
      taskId: string;
      dailyListId: string;
      orderToken: string;
    },
  ): GenReturn<TaskProjection> {
    const id = projection.id || uuidv7();
    const newProjection: TaskProjection = {
      type: projectionType,
      id,
      createdAt: Date.now(),
      ...projection,
    };

    yield* insert(taskProjectionsTable, [newProjection]);
    return newProjection;
  }),
  update: action(function* (
    id: string,
    projection: Partial<TaskProjection>,
  ): GenReturn<void> {
    const projInState = yield* projectionsSlice2.byId(id);
    if (!projInState) throw new Error("Projection not found");

    yield* update(taskProjectionsTable, [{ ...projInState, ...projection }]);
  }),
  createSibling: action(function* (
    taskProjectionId: string,
    position: "before" | "after",
    taskParams?: Partial<Task>,
  ): GenReturn<TaskProjection> {
    const taskProjection = yield* projectionsSlice2.byId(taskProjectionId);

    if (!taskProjection) throw new Error("TaskProjection not found");

    const newTask = yield* projectItemsSlice2.createSibling(
      taskProjection.taskId,
      position,
      taskParams,
    );

    return yield* projectionsSlice2.create({
      taskId: newTask.id,
      dailyListId: taskProjection.dailyListId,
      orderToken: generateKeyPositionedBetween(
        taskProjection,
        yield* projectionsSlice2.siblings(taskProjectionId),
        position,
      ),
    });
  }),
  handleDrop: action(function* (
    taskProjectionId: string,
    dropId: string,
    edge: "top" | "bottom",
  ): GenReturn<void> {
    const canDrop = yield* projectionsSlice2.canDrop(taskProjectionId, dropId);
    if (!canDrop) return;

    const taskProjection = yield* projectionsSlice2.byId(taskProjectionId);
    if (!taskProjection) return;

    const dropItem = yield* appSlice2.byId(dropId);
    if (!dropItem) return;

    const [up, down] = yield* projectionsSlice2.siblings(taskProjectionId);

    let between: [string | undefined, string | undefined] = [
      taskProjection.orderToken,
      down?.orderToken,
    ];

    if (edge == "top") {
      between = [up?.orderToken, taskProjection.orderToken];
    }

    const orderToken = generateJitteredKeyBetween(
      between[0] || null,
      between[1] || null,
    );

    if (isTaskProjection(dropItem)) {
      yield* projectionsSlice2.update(dropItem.id, {
        orderToken,
        dailyListId: taskProjection.dailyListId,
      });
    } else if (isTask(dropItem)) {
      yield* projectionsSlice2.create({
        taskId: dropItem.id,
        dailyListId: taskProjection.dailyListId,
        orderToken,
      });
    } else {
      shouldNeverHappen("unknown drop item type", dropItem);
    }
  }),
};

export const tasksSlice2 = {
  canDrop: selector(function* (
    taskId: string,
    dropId: string,
  ): GenReturn<boolean> {
    const model = yield* appSlice2.byId(dropId);
    if (!model) return false;

    const task = yield* tasksSlice2.byId(taskId);
    if (!task) return false;

    if (task.state === "done") {
      return false;
    }

    if (isTask(model) && model.state === "done") {
      return false;
    }

    return isTaskProjection(model) || isTask(model) || isTaskTemplate(model);
  }),
  byId: selector(function* (id: string): GenReturn<Task | undefined> {
    const tasks = yield* runQuery(
      selectFrom(tasksTable, "byId")
        .where((q) => q.eq("id", id))
        .limit(1),
    );

    return tasks[0];
  }),
  byIdOrDefault: selector(function* (id: string): GenReturn<Task> {
    return (yield* tasksSlice2.byId(id)) || defaultTask;
  }),
  taskIdsOfTemplateId: selector(function* (id: string): GenReturn<string[]> {
    const tasks = yield* runQuery(
      selectFrom(tasksTable, "byTemplateId").where((q) =>
        q.eq("templateId", id),
      ),
    );

    return tasks.map((t) => t.id);
  }),
  all: selector(function* (): GenReturn<Task[]> {
    const tasks = yield* runQuery(
      selectFrom(tasksTable, "byProjectIdOrderStates"),
    );
    return tasks;
  }),

  // actions
  delete: action(function* (ids: string[]): GenReturn<void> {
    yield* deleteRows(tasksTable, ids);
    yield* projectionsSlice2.deleteProjectionsOfTask(ids);
  }),
  update: action(function* (id: string, task: Partial<Task>): GenReturn<void> {
    const taskInState = yield* tasksSlice2.byId(id);
    if (!taskInState) throw new Error("Task not found");

    yield* update(tasksTable, [{ ...taskInState, ...task }]);
  }),
  createTask: action(function* (
    task: Partial<Task> & { projectId: string; orderToken: string },
  ): GenReturn<Task> {
    const id = task.id || uuidv7();
    const newTask: Task = {
      type: taskType,
      id,
      title: "",
      state: "todo",
      lastToggledAt: Date.now(),
      createdAt: Date.now(),
      horizon: "week",
      templateId: null,
      templateDate: null,
      ...task,
    };

    yield* insert(tasksTable, [newTask]);

    return newTask;
  }),
  handleDrop: action(function* (
    taskId: string,
    dropId: string,
    edge: "top" | "bottom",
  ): GenReturn<void> {
    if (!(yield* tasksSlice2.canDrop(taskId, dropId))) return;

    const task = yield* tasksSlice2.byId(taskId);
    if (!task) return shouldNeverHappen("task not found");

    const dropItem = yield* appSlice2.byId(dropId);
    if (!dropItem) return shouldNeverHappen("drop item not found");

    const [up, down] = yield* projectItemsSlice2.siblings(taskId);

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
      yield* tasksSlice2.update(dropItem.id, {
        projectId: task.projectId,
        orderToken: orderToken,
      });
    } else if (isTaskTemplate(dropItem)) {
      yield* taskTemplatesSlice2.update(dropItem.id, {
        projectId: task.projectId,
        orderToken: orderToken,
      });
    } else if (isTaskProjection(dropItem)) {
      const taskOfDrop = yield* tasksSlice2.byId(dropItem.taskId);
      if (!taskOfDrop) return shouldNeverHappen("task not found", dropItem);

      yield* tasksSlice2.update(taskOfDrop.id, {
        orderToken: orderToken,
        projectId: task.projectId,
      });

      yield* projectionsSlice2.delete(dropItem.id);
    } else {
      shouldNeverHappen("unknown drop item type", dropItem);
    }
  }),
  toggleState: action(function* (taskId: string): GenReturn<void> {
    const task = yield* tasksSlice2.byId(taskId);
    if (!task) throw new Error("Task not found");

    yield* update(tasksTable, [
      {
        ...task,
        state: task.state === "todo" ? "done" : "todo",
        lastToggledAt: Date.now(),
      },
    ]);
  }),
  createFromTemplate: action(function* (taskTemplate: TaskTemplate) {
    yield* projectItemsSlice2.deleteById(taskTemplate.id);

    const newId = uuidv7();
    const newTask: Task = {
      id: newId,
      title: taskTemplate.title,
      state: "todo",
      projectId: taskTemplate.projectId,
      type: taskType,
      orderToken: taskTemplate.orderToken,
      lastToggledAt: Date.now(),
      horizon: taskTemplate.horizon,
      createdAt: taskTemplate.createdAt,
      templateId: taskTemplate.id,
      templateDate: taskTemplate.lastGeneratedAt,
    };
    yield* insert(tasksTable, [newTask]);

    return newTask;
  }),
  deleteByIds: action(function* (ids: string[]) {
    yield* deleteRows(tasksTable, ids);
  }),
  deleteById: action(function* (id: string): GenReturn<void> {
    yield* tasksSlice2.delete([id]);
  }),
};

export type AnyModel =
  | Task
  | TaskProjection
  | TaskTemplate
  | Project
  | DailyList;

export const allProjectsSlice2 = {
  all: selector(function* (): GenReturn<Project[]> {
    const projects = yield* runQuery(selectFrom(projectsTable, "byOrderToken"));
    return projects;
  }),
  allSorted: selector(function* (): GenReturn<Project[]> {
    const projects = yield* runQuery(selectFrom(projectsTable, "byOrderToken"));
    return projects;
  }),
  childrenIds: selector(function* (): GenReturn<string[]> {
    return (yield* allProjectsSlice2.allSorted()).map((p) => p.id);
  }),
  childrenIdsWithoutInbox: selector(function* (): GenReturn<string[]> {
    const projects = yield* allProjectsSlice2.allSorted();
    return projects.filter((p) => !p.isInbox).map((p) => p.id);
  }),
  firstChild: selector(function* (): GenReturn<Project | undefined> {
    const childrenIds = yield* allProjectsSlice2.childrenIds();
    const firstChildId = childrenIds[0];
    return firstChildId ? yield* projectsSlice2.byId(firstChildId) : undefined;
  }),
  lastChild: selector(function* (): GenReturn<Project | undefined> {
    const childrenIds = yield* allProjectsSlice2.childrenIds();
    const lastChildId = childrenIds[childrenIds.length - 1];
    return lastChildId ? yield* projectsSlice2.byId(lastChildId) : undefined;
  }),
  inbox: selector(function* (): GenReturn<Project> {
    const projects = yield* runQuery(
      selectFrom(projectsTable, "byIsInbox")
        .where((q) => q.eq("isInbox", true))
        .limit(1),
    );
    return projects[0] || defaultProject;
  }),
  siblings: selector(function* (
    projectId: string,
  ): GenReturn<[Project | undefined, Project | undefined]> {
    const childrenIds = yield* allProjectsSlice2.childrenIds();
    const index = childrenIds.findIndex((id) => id === projectId);

    if (index === -1) return [undefined, undefined];

    const beforeId = index > 0 ? childrenIds[index - 1] : undefined;
    const afterId =
      index < childrenIds.length - 1 ? childrenIds[index + 1] : undefined;

    const before = beforeId ? yield* projectsSlice2.byId(beforeId) : undefined;
    const after = afterId ? yield* projectsSlice2.byId(afterId) : undefined;

    return [before, after];
  }),
  dropdownProjectsList: selector(function* (): GenReturn<
    { value: string; label: string }[]
  > {
    const projects = yield* allProjectsSlice2.allSorted();
    return projects.map((p) => {
      return { value: p.id, label: p.title };
    });
  }),
};

// // Focus management types and utilities
// export type FocusKey = string & { __brand: never };
//
// export const buildFocusKey = (
//   id: string,
//   type: string,
//   component?: string,
// ): FocusKey => {
//   if (id.includes("^^")) {
//     throw new Error("id cannot contain ^^");
//   }
//   if (type.includes("^^")) {
//     throw new Error("type cannot contain ^^");
//   }
//   if (component && component.includes("^^")) {
//     throw new Error("component cannot contain ^^");
//   }
//
//   return `${type}^^${id}${component ? `^^${component}` : ""}` as FocusKey;
// };
//
// export const parseColumnKey = (
//   key: FocusKey,
// ): { type: string; id: string; component?: string } => {
//   const [type, id, component] = key.split("^^");
//
//   if (!type || !id) return shouldNeverHappen("key is not valid", { key });
//
//   return { type, id, component };
// };
//
// export type FocusState = {
//   focusItemKey: FocusKey | undefined;
//   editItemKey: FocusKey | undefined;
//   isFocusDisabled: boolean;
// };
//
// export const initialFocusState: FocusState = {
//   focusItemKey: undefined,
//   editItemKey: undefined,
//   isFocusDisabled: false,
// };

// // Simple focus slice - the focusManager from the original is maintained separately
// export const focusSlice2 = {
//   // selectors
//   getFocusKey: selector(function* (): GenReturn<FocusKey | undefined> {
//     // This would need to be stored in a separate state management system
//     // For now, return undefined as a placeholder
//     return undefined;
//   }),
//   getFocusedModelId: selector(function* (): GenReturn<string | undefined> {
//     const key = yield* focusSlice2.getFocusKey();
//     if (!key) return undefined;
//     return parseColumnKey(key).id;
//   }),
//   getEditKey: selector(function* (): GenReturn<FocusKey | undefined> {
//     // This would need to be stored in a separate state management system
//     // For now, return undefined as a placeholder
//     return undefined;
//   }),
//   isFocusDisabled: selector(function* (): GenReturn<boolean> {
//     // This would need to be stored in a separate state management system
//     return false;
//   }),
//   isFocused: selector(function* (key: FocusKey): GenReturn<boolean> {
//     const focusKey = yield* focusSlice2.getFocusKey();
//     const isDisabled = yield* focusSlice2.isFocusDisabled();
//     return !isDisabled && focusKey === key;
//   }),
//   isEditing: selector(function* (key: FocusKey): GenReturn<boolean> {
//     const editKey = yield* focusSlice2.getEditKey();
//     const isDisabled = yield* focusSlice2.isFocusDisabled();
//     return !isDisabled && editKey === key;
//   }),
//   isSomethingEditing: selector(function* (): GenReturn<boolean> {
//     const editKey = yield* focusSlice2.getEditKey();
//     const isDisabled = yield* focusSlice2.isFocusDisabled();
//     return !isDisabled && !!editKey;
//   }),
//   isSomethingFocused: selector(function* (): GenReturn<boolean> {
//     const focusKey = yield* focusSlice2.getFocusKey();
//     const isDisabled = yield* focusSlice2.isFocusDisabled();
//     return !isDisabled && !!focusKey;
//   }),
//
//   // actions (these would need to be implemented with a separate state system)
//   disableFocus: action(function* (): GenReturn<void> {
//     // Placeholder - would need external state management
//   }),
//   enableFocus: action(function* (): GenReturn<void> {
//     // Placeholder - would need external state management
//   }),
//   focusByKey: action(function* (
//     key: FocusKey,
//     skipElFocus = false,
//   ): GenReturn<void> {
//     // Placeholder - would need external state management
//     // Would handle DOM focus and scrolling
//   }),
//   editByKey: action(function* (key: FocusKey): GenReturn<void> {
//     // Placeholder - would need external state management
//   }),
//   resetFocus: action(function* (): GenReturn<void> {
//     // Placeholder - would need external state management
//   }),
//   resetEdit: action(function* (): GenReturn<void> {
//     // Placeholder - would need external state management
//   }),
// };

export const dropSlice2 = {
  // selectors
  canDrop: selector(function* (
    id: string,
    targetId: string,
  ): GenReturn<boolean> {
    const model = yield* appSlice2.byId(id);
    if (!model) return false;

    // Dispatch to appropriate slice based on model type
    switch (model.type) {
      case taskType:
        return yield* tasksSlice2.canDrop(id, targetId);
      case projectionType:
        return yield* projectionsSlice2.canDrop(id, targetId);
      case dailyListType:
        return yield* dailyListsSlice2.canDrop(id, targetId);
      case projectType:
        return yield* projectsSlice2.canDrop(id, targetId);
      default:
        return false;
    }
  }),

  // actions
  handleDrop: action(function* (
    id: string,
    dropId: string,
    edge: "top" | "bottom",
  ): GenReturn<void> {
    const model = yield* appSlice2.byId(id);
    if (!model) return;

    // Dispatch to appropriate slice based on model type
    switch (model.type) {
      case taskType:
        yield* tasksSlice2.handleDrop(id, dropId, edge);
        break;
      case projectionType:
        yield* projectionsSlice2.handleDrop(id, dropId, edge);
        break;
      case dailyListType:
        yield* dailyListsSlice2.handleDrop(id, dropId, edge);
        break;
      case projectType:
        yield* projectsSlice2.handleDrop(id, dropId, edge);
        break;
      default:
        shouldNeverHappen("Unknown drop type: " + model.type);
    }
  }),
};

export const appSlice2 = {
  // selectors
  byId: selector(function* (id: string): GenReturn<AnyModel | undefined> {
    for (const slice of Object.values(appSlices)) {
      const item = yield* slice.byId(id);
      if (item) return item;
    }

    return undefined;
  }),
  byIdOrDefault: selector(function* (id: string): GenReturn<AnyModel> {
    const entity = yield* appSlice2.byId(id);
    if (!entity) {
      return defaultTask;
    }

    return entity;
  }),
  taskOfModel: selector(function* (
    model: AnyModel,
  ): GenReturn<Task | undefined> {
    if (isTask(model)) {
      return model;
    } else if (isTaskProjection(model)) {
      return yield* tasksSlice2.byId(model.taskId);
    }
    return undefined;
  }),
  taskBoxById: selector(function* (
    id: string,
  ): GenReturn<Task | TaskTemplate | TaskProjection | undefined> {
    const slices = [tasksSlice2, projectionsSlice2, taskTemplatesSlice2];
    for (const slice of slices) {
      const res = yield* slice.byId(id);

      if (res) {
        return res;
      }
    }

    return undefined;
  }),
  taskBoxByIdOrDefault: selector(function* (
    id: string,
  ): GenReturn<Task | TaskTemplate | TaskProjection> {
    const entity = yield* appSlice2.taskBoxById(id);
    if (!entity) {
      return defaultTask;
    }

    return entity;
  }),

  // actions
  delete: action(function* (id: string): GenReturn<void> {
    // TODO: use slice.delete
    // for (const slice of Object.values(slices)) {
    //   slice.delete(id);
    // }
    yield* tasksSlice2.delete([id]);
    yield* projectionsSlice2.deleteProjectionsOfTask([id]);
    yield* deleteRows(taskTemplatesTable, [id]);
    yield* deleteRows(projectsTable, [id]);
    yield* deleteRows(dailyListsTable, [id]);
  }),

  createTaskBoxSibling: action(function* (
    taskBox: Task | TaskProjection | TaskTemplate,
    position: "before" | "after",
    taskParams?: Partial<Task>,
  ) {
    if (isTask(taskBox) || isTaskTemplate(taskBox)) {
      return yield* projectItemsSlice2.createSibling(
        taskBox.id,
        position,
        taskParams,
      );
    } else if (isTaskProjection(taskBox)) {
      return yield* projectionsSlice2.createSibling(taskBox.id, position);
    } else {
      assertUnreachable(taskBox);
    }
  }),
};

export const appSyncableTables = [
  { table: tasksTable, modelType: taskType },
  { table: taskProjectionsTable, modelType: projectionType },
  { table: taskTemplatesTable, modelType: taskTemplateType },
  { table: projectsTable, modelType: projectType },
  { table: dailyListsTable, modelType: dailyListType },
] as const;

export type AppSyncableModel =
  | Task
  | TaskProjection
  | TaskTemplate
  | Project
  | DailyList;

export const syncableTablesMap = {
  [tasksTable.tableName]: tasksTable,
  [taskProjectionsTable.tableName]: taskProjectionsTable,
  [taskTemplatesTable.tableName]: taskTemplatesTable,
  [projectsTable.tableName]: projectsTable,
  [dailyListsTable.tableName]: dailyListsTable,
};

export const appSlices = {
  [projectType]: projectsSlice2,
  [taskType]: tasksSlice2,
  [taskTemplateType]: taskTemplatesSlice2,
  [projectionType]: projectionsSlice2,
  [dailyListType]: dailyListsSlice2,
};
