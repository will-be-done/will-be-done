import {
  v,
  deleteRows,
  insert,
  selectFrom,
  upsert,
} from "@will-be-done/hyperdb";
import { action, selector } from "../builders";
import { getDMY } from "./utils";
import { allChecklistItems } from "./checklistItems";
import { allProjectSections } from "./projectSections";
import { allProjects } from "./projectsAll";
import { allTasks } from "./tasks";
import { allTaskTemplates } from "./taskTemplates";
import { dailyListAllIds, dailyListById, dailyListGetId } from "./dailyLists";
import { allDailyReports, dailyReportGetId } from "./dailyReports";
import { dailyEntryAllIds, dailyEntryById } from "./dailyEntries";
import { inboxProjectId as getInboxProjectId } from "./projects";
import { appTypeTablesMap } from "./maps";
import { registeredSpaceSyncableTables } from "./syncMap";
import {
  AnyModel,
  ChecklistItem,
  checklistItemType,
  ChecklistParentType,
  DailyList,
  DailyReport,
  DailyReportRating,
  dailyListsTable,
  dailyListType,
  dailyReportRating,
  dailyReportType,
  Project,
  ProjectSection,
  projectSectionType,
  dailyEntryType,
  projectType,
  Task,
  DailyEntry,
  TaskTemplate,
  taskTemplateType,
  taskType,
} from "./tables";
import { uuidv7 } from "uuidv7";

// TODO: use type from  vackupValidator
interface ProjectSectionBackup {
  id: string;
  title: string;
  projectId: string;
  createdAt: number;
  orderToken: string;
}

interface TaskBackup {
  id: string;
  title: string;
  content?: string;
  state: "todo" | "done";
  projectSectionId: string;
  orderToken: string;
  lastToggledAt: number;
  createdAt: number;
  nature?: "red" | "green" | "unknown";
  templateId: string | null;
  templateDate: number | null;
  // Legacy fields for backwards compatibility (when loading old backups)
  dailyListId?: string | null;
  dailyListOrderToken?: string | null;
}

interface ProjectBackup {
  id: string;
  title: string;
  icon: string;
  isInbox: boolean;
  orderToken: string;
  createdAt: number;
}

interface DailyListBackup {
  id: string;
  date: string;
}

interface DailyReportBackup {
  id: string;
  date: string;
  notes: string;
  completedTasks: { id: string; title: string }[];
  mood?: DailyReportRating;
  energy?: DailyReportRating;
  focus?: DailyReportRating;
  accomplishment?: DailyReportRating;
  createdAt: number;
  updatedAt: number;
}

interface DailyEntryBackup {
  id: string;
  taskId?: string; // Optional only when loading backups from the task-id era.
  orderToken: string;
  listId: string; // dailyListId
  createdAt: number;
}

interface TaskTemplateBackup {
  id: string;
  title: string;
  content?: string;
  orderToken: string;
  repeatRule: string;
  repeatRuleDtStart?: number;
  createdAt: number;
  lastGeneratedAt: number;
  projectSectionId: string;
  startsAtMinutes?: number;
  durationMinutes?: number;
}

interface ChecklistItemBackup {
  id: string;
  parentId: string;
  parentType: ChecklistParentType;
  orderToken: string;
  state: "todo" | "done";
  content: string;
  createdAt: number;
  checkedAt: number | null;
}

export interface Backup {
  tasks: TaskBackup[];
  projects: ProjectBackup[];
  dailyLists: DailyListBackup[];
  taskTemplates: TaskTemplateBackup[];
  projectSections: ProjectSectionBackup[];
  dailyEntries?: DailyEntryBackup[];
  checklistItems?: ChecklistItemBackup[];
  dailyReports?: DailyReportBackup[];
}

interface LegacyEntryBackupFields {
  dailyListProjections?: DailyEntryBackup[];
}

interface LegacyTaskBackup extends Omit<TaskBackup, "projectSectionId"> {
  projectCategoryId: string;
}

interface LegacyTaskTemplateBackup extends Omit<
  TaskTemplateBackup,
  "projectSectionId"
> {
  projectCategoryId: string;
}

interface LegacyBackup
  extends
    Omit<Backup, "tasks" | "taskTemplates" | "projectSections">,
    LegacyEntryBackupFields {
  tasks: LegacyTaskBackup[];
  taskTemplates: LegacyTaskTemplateBackup[];
  projectCategories: ProjectSectionBackup[];
}

type BackupInput = Backup & LegacyEntryBackupFields;

const backupSchema = v.object({
  tasks: v.array(
    v.object({
      id: v.string(),
      title: v.string(),
      content: v.optional(v.string()),
      state: v.union(v.literal("todo"), v.literal("done")),
      projectSectionId: v.string(),
      orderToken: v.string(),
      lastToggledAt: v.number(),
      createdAt: v.number(),
      nature: v.optional(
        v.union(v.literal("red"), v.literal("green"), v.literal("unknown")),
      ),
      templateId: v.union(v.string(), v.null()),
      templateDate: v.union(v.number(), v.null()),
      dailyListId: v.optional(v.union(v.string(), v.null())),
      dailyListOrderToken: v.optional(v.union(v.string(), v.null())),
    }),
  ),
  projects: v.array(
    v.object({
      id: v.string(),
      title: v.string(),
      icon: v.string(),
      isInbox: v.boolean(),
      orderToken: v.string(),
      createdAt: v.number(),
    }),
  ),
  dailyLists: v.array(
    v.object({
      id: v.string(),
      date: v.string(),
    }),
  ),
  taskTemplates: v.array(
    v.object({
      id: v.string(),
      title: v.string(),
      content: v.optional(v.string()),
      orderToken: v.string(),
      repeatRule: v.string(),
      repeatRuleDtStart: v.optional(v.number()),
      createdAt: v.number(),
      lastGeneratedAt: v.number(),
      projectSectionId: v.string(),
      startsAtMinutes: v.optional(v.number()),
      durationMinutes: v.optional(v.number()),
    }),
  ),
  projectSections: v.array(
    v.object({
      id: v.string(),
      title: v.string(),
      projectId: v.string(),
      createdAt: v.number(),
      orderToken: v.string(),
    }),
  ),
  dailyEntries: v.optional(
    v.array(
      v.object({
        id: v.string(),
        taskId: v.optional(v.string()),
        orderToken: v.string(),
        listId: v.string(),
        createdAt: v.number(),
      }),
    ),
  ),
  dailyListProjections: v.optional(
    v.array(
      v.object({
        id: v.string(),
        taskId: v.optional(v.string()),
        orderToken: v.string(),
        listId: v.string(),
        createdAt: v.number(),
      }),
    ),
  ),
  checklistItems: v.optional(
    v.array(
      v.object({
        id: v.string(),
        parentId: v.string(),
        parentType: v.union(v.literal("task"), v.literal("template")),
        orderToken: v.string(),
        state: v.union(v.literal("todo"), v.literal("done")),
        content: v.string(),
        createdAt: v.number(),
        checkedAt: v.union(v.number(), v.null()),
      }),
    ),
  ),
  dailyReports: v.optional(
    v.array(
      v.object({
        id: v.string(),
        date: v.string(),
        notes: v.string(),
        completedTasks: v.array(
          v.object({
            id: v.string(),
            title: v.string(),
          }),
        ),
        mood: v.optional(dailyReportRating),
        energy: v.optional(dailyReportRating),
        focus: v.optional(dailyReportRating),
        accomplishment: v.optional(dailyReportRating),
        createdAt: v.number(),
        updatedAt: v.number(),
      }),
    ),
  ),
});

const legacyBackupSchema = v.object({
  tasks: v.array(
    v.object({
      id: v.string(),
      title: v.string(),
      content: v.optional(v.string()),
      state: v.union(v.literal("todo"), v.literal("done")),
      projectCategoryId: v.string(),
      orderToken: v.string(),
      lastToggledAt: v.number(),
      createdAt: v.number(),
      nature: v.optional(
        v.union(v.literal("red"), v.literal("green"), v.literal("unknown")),
      ),
      templateId: v.union(v.string(), v.null()),
      templateDate: v.union(v.number(), v.null()),
      dailyListId: v.optional(v.union(v.string(), v.null())),
      dailyListOrderToken: v.optional(v.union(v.string(), v.null())),
    }),
  ),
  projects: v.array(
    v.object({
      id: v.string(),
      title: v.string(),
      icon: v.string(),
      isInbox: v.boolean(),
      orderToken: v.string(),
      createdAt: v.number(),
    }),
  ),
  dailyLists: v.array(
    v.object({
      id: v.string(),
      date: v.string(),
    }),
  ),
  taskTemplates: v.array(
    v.object({
      id: v.string(),
      title: v.string(),
      content: v.optional(v.string()),
      orderToken: v.string(),
      repeatRule: v.string(),
      repeatRuleDtStart: v.optional(v.number()),
      createdAt: v.number(),
      lastGeneratedAt: v.number(),
      projectCategoryId: v.string(),
      startsAtMinutes: v.optional(v.number()),
      durationMinutes: v.optional(v.number()),
    }),
  ),
  projectCategories: v.array(
    v.object({
      id: v.string(),
      title: v.string(),
      projectId: v.string(),
      createdAt: v.number(),
      orderToken: v.string(),
    }),
  ),
  dailyListProjections: v.optional(
    v.array(
      v.object({
        id: v.string(),
        taskId: v.optional(v.string()),
        orderToken: v.string(),
        listId: v.string(),
        createdAt: v.number(),
      }),
    ),
  ),
  dailyEntries: v.optional(
    v.array(
      v.object({
        id: v.string(),
        taskId: v.optional(v.string()),
        orderToken: v.string(),
        listId: v.string(),
        createdAt: v.number(),
      }),
    ),
  ),
  checklistItems: v.optional(
    v.array(
      v.object({
        id: v.string(),
        parentId: v.string(),
        parentType: v.union(v.literal("task"), v.literal("template")),
        orderToken: v.string(),
        state: v.union(v.literal("todo"), v.literal("done")),
        content: v.string(),
        createdAt: v.number(),
        checkedAt: v.union(v.number(), v.null()),
      }),
    ),
  ),
  dailyReports: v.optional(
    v.array(
      v.object({
        id: v.string(),
        date: v.string(),
        notes: v.string(),
        completedTasks: v.array(
          v.object({
            id: v.string(),
            title: v.string(),
          }),
        ),
        mood: v.optional(dailyReportRating),
        energy: v.optional(dailyReportRating),
        focus: v.optional(dailyReportRating),
        accomplishment: v.optional(dailyReportRating),
        createdAt: v.number(),
        updatedAt: v.number(),
      }),
    ),
  ),
});

const backupInputSchema = v.union(backupSchema, legacyBackupSchema);

export function normalizeSpaceBackup(
  backup: BackupInput | LegacyBackup,
): Backup {
  const { dailyListProjections, ...backupWithoutLegacyEntries } = backup;
  const dailyEntries = backup.dailyEntries ?? dailyListProjections;
  const entryFields = dailyEntries === undefined ? {} : { dailyEntries };

  if ("projectSections" in backupWithoutLegacyEntries) {
    return {
      ...backupWithoutLegacyEntries,
      ...entryFields,
    };
  }

  const { projectCategories, tasks, taskTemplates, ...rest } =
    backupWithoutLegacyEntries;
  return {
    ...rest,
    ...entryFields,
    projectSections: projectCategories,
    tasks: tasks.map(({ projectCategoryId, ...task }) => ({
      ...task,
      projectSectionId: projectCategoryId,
    })),
    taskTemplates: taskTemplates.map(({ projectCategoryId, ...template }) => ({
      ...template,
      projectSectionId: projectCategoryId,
    })),
  };
}

const getNewModels = action({
  name: "getNewModels",
  args: { backup: backupSchema },
  handler: function* getNewModels({ backup }) {
    const models: AnyModel[] = [];

    const inboxProjectIdInBackup = backup.projects.find((p) => p.isInbox)?.id;
    const inboxProjectId = yield* getInboxProjectId({});

    // First, create all projects
    for (const projectBackup of backup.projects) {
      const project: Project = {
        type: projectType,
        id: projectBackup.isInbox
          ? yield* getInboxProjectId({})
          : projectBackup.id,
        title: projectBackup.title,
        icon: projectBackup.icon,
        isInbox: projectBackup.isInbox,
        orderToken: projectBackup.orderToken,
        createdAt: projectBackup.createdAt,
      };

      models.push(project);
    }

    for (const sectionBackup of backup.projectSections) {
      const section: ProjectSection = {
        type: projectSectionType,
        id: sectionBackup.id,
        title: sectionBackup.title,
        projectId:
          sectionBackup.projectId === inboxProjectIdInBackup
            ? inboxProjectId
            : sectionBackup.projectId,
        createdAt: sectionBackup.createdAt,
        orderToken: sectionBackup.orderToken,
      };

      models.push(section);
    }

    const dailyEntriesByTaskId = new Map<string, DailyEntryBackup[]>();
    if (backup.dailyEntries) {
      for (const entry of backup.dailyEntries) {
        const taskId = entry.taskId ?? entry.id;
        const existing = dailyEntriesByTaskId.get(taskId) || [];
        existing.push(entry);
        dailyEntriesByTaskId.set(taskId, existing);
      }
    }
    const selectedDailyEntries = new Set(
      [...dailyEntriesByTaskId.values()].map((entries) =>
        entries.reduce((latest, entry) =>
          entry.createdAt > latest.createdAt ||
          (entry.createdAt === latest.createdAt && entry.id > latest.id)
            ? entry
            : latest,
        ),
      ),
    );

    // Then create all tasks
    for (const taskBackup of backup.tasks) {
      const section = backup.projectSections.find(
        (p) => p.id === taskBackup.projectSectionId,
      );
      if (!section) {
        console.warn(
          `Project section ${taskBackup.projectSectionId} not found for task ${taskBackup.id}`,
        );
        continue;
      }

      const task: Task = {
        type: taskType,
        id: taskBackup.id,
        title: taskBackup.title,
        content: taskBackup.content,
        state: taskBackup.state,
        projectSectionId: taskBackup.projectSectionId,
        orderToken: taskBackup.orderToken,
        lastToggledAt: taskBackup.lastToggledAt,
        createdAt: taskBackup.createdAt,
        nature: taskBackup.nature || "unknown",
        templateId: taskBackup.templateId ?? null,
        templateDate: taskBackup.templateDate ?? null,
      };

      models.push(task);
    }

    const dailyListIdMap = new Map<string, string>();

    // Create daily lists
    for (const dailyListBackup of backup.dailyLists) {
      if (dailyListBackup.date.length !== 10) {
        dailyListBackup.date = getDMY(new Date(dailyListBackup.date));
      }

      const dailyList: DailyList = {
        type: dailyListType,
        id: yield* dailyListGetId({ date: dailyListBackup.date }),
        date: dailyListBackup.date,
      };

      dailyListIdMap.set(dailyListBackup.id, dailyList.id);

      models.push(dailyList);
    }

    // Create task templates
    for (const templateBackup of backup.taskTemplates || []) {
      const section = backup.projectSections.find(
        (p) => p.id === templateBackup.projectSectionId,
      );
      if (!section) {
        console.warn(
          `Project section ${templateBackup.projectSectionId} not found for template ${templateBackup.id}`,
        );
        continue;
      }

      const template: TaskTemplate = {
        type: taskTemplateType,
        id: templateBackup.id,
        title: templateBackup.title,
        content: templateBackup.content,
        orderToken: templateBackup.orderToken,
        repeatRule: templateBackup.repeatRule,
        repeatRuleDtStart:
          templateBackup.repeatRuleDtStart ?? templateBackup.createdAt,
        createdAt: templateBackup.createdAt,
        lastGeneratedAt: templateBackup.lastGeneratedAt,
        projectSectionId: section.id,
        ...(templateBackup.startsAtMinutes == null
          ? {}
          : { startsAtMinutes: templateBackup.startsAtMinutes }),
        ...(templateBackup.durationMinutes == null
          ? {}
          : { durationMinutes: templateBackup.durationMinutes }),
      };

      models.push(template);
    }

    // Create entries from both independent-id backups and older task-id entries.
    if (backup.dailyEntries) {
      for (const entryBackup of backup.dailyEntries) {
        if (!selectedDailyEntries.has(entryBackup)) continue;

        const taskId = entryBackup.taskId || entryBackup.id;

        // Verify the task exists
        const taskExists = backup.tasks.some((t) => t.id === taskId);
        if (!taskExists) {
          console.warn(`Task ${taskId} not found for entry`);
          continue;
        }

        const entry: DailyEntry = {
          type: dailyEntryType,
          id: uuidv7(),
          taskId,
          orderToken: entryBackup.orderToken,
          dailyListId: dailyListIdMap.get(entryBackup.listId)!,
          createdAt: entryBackup.createdAt,
        };

        models.push(entry);
      }
    }

    for (const itemBackup of backup.checklistItems || []) {
      const parentExists =
        itemBackup.parentType === taskType
          ? backup.tasks.some((task) => task.id === itemBackup.parentId)
          : (backup.taskTemplates || []).some(
              (template) => template.id === itemBackup.parentId,
            );

      if (!parentExists) {
        console.warn(
          `Checklist parent ${itemBackup.parentId} not found for checklist item ${itemBackup.id}`,
        );
        continue;
      }

      const checklistItem: ChecklistItem = {
        type: checklistItemType,
        id: itemBackup.id,
        parentId: itemBackup.parentId,
        parentType: itemBackup.parentType,
        orderToken: itemBackup.orderToken,
        state: itemBackup.state,
        content: itemBackup.content,
        createdAt: itemBackup.createdAt,
        checkedAt: itemBackup.checkedAt,
      };

      models.push(checklistItem);
    }

    for (const reportBackup of backup.dailyReports || []) {
      let date = reportBackup.date;
      if (date.length !== 10) {
        date = getDMY(new Date(date));
      }

      const dailyReport: DailyReport = {
        type: dailyReportType,
        id: yield* dailyReportGetId({ date }),
        date,
        notes: reportBackup.notes,
        completedTasks: reportBackup.completedTasks,
        createdAt: reportBackup.createdAt,
        updatedAt: reportBackup.updatedAt,
        ...(reportBackup.mood !== undefined ? { mood: reportBackup.mood } : {}),
        ...(reportBackup.energy !== undefined
          ? { energy: reportBackup.energy }
          : {}),
        ...(reportBackup.focus !== undefined
          ? { focus: reportBackup.focus }
          : {}),
        ...(reportBackup.accomplishment !== undefined
          ? { accomplishment: reportBackup.accomplishment }
          : {}),
      };

      models.push(dailyReport);
    }

    // Handle legacy backup format where dailyListId was on tasks directly
    for (const taskBackup of backup.tasks) {
      // Skip if we already have an entry for this task.
      const hasEntry = backup.dailyEntries?.some(
        (p) => (p.taskId || p.id) === taskBackup.id,
      );
      if (hasEntry) continue;

      // Check if task has legacy dailyListId field
      if (taskBackup.dailyListId && taskBackup.dailyListOrderToken) {
        const entry: DailyEntry = {
          type: dailyEntryType,
          id: uuidv7(),
          taskId: taskBackup.id,
          orderToken: taskBackup.dailyListOrderToken,
          dailyListId: taskBackup.dailyListId,
          createdAt: taskBackup.createdAt,
        };

        models.push(entry);
      }
    }

    return models;
  },
});

export const loadSpaceBackup = selector({
  name: "loadSpaceBackup",
  args: { backup: backupInputSchema },
  handler: function* loadSpaceBackup({ backup }) {
    for (const table of registeredSpaceSyncableTables) {
      // DailyLists are deterministic, ensure-only scaffolding. A backup that
      // omits a date must not turn that absence into a permanent tombstone.
      if (table === dailyListsTable) continue;
      const allIds = (yield* selectFrom(table, "byIds")).map((r) => r.id);

      yield* deleteRows(table, allIds);
    }

    const models = yield* getNewModels({
      backup: normalizeSpaceBackup(backup),
    });
    const modelsByTable = new Map<
      (typeof registeredSpaceSyncableTables)[number],
      AnyModel[]
    >();

    for (const model of models) {
      const table = appTypeTablesMap[model.type];
      const tableModels = modelsByTable.get(table) || [];
      tableModels.push(model);
      modelsByTable.set(table, tableModels);
    }

    for (const [table, tableModels] of modelsByTable) {
      if (table === dailyListsTable) {
        yield* upsert(dailyListsTable, tableModels as DailyList[]);
      } else {
        yield* insert(table, tableModels);
      }
    }
  },
});

export const getSpaceBackup = selector({
  name: "getSpaceBackup",
  args: {},
  handler: function* getSpaceBackup() {
    const tasks: Task[] = yield* allTasks({});
    const projects: Project[] = yield* allProjects({});
    const taskTemplates: TaskTemplate[] = yield* allTaskTemplates({});
    const checklistItems: ChecklistItem[] = yield* allChecklistItems({});
    const dailyLists: DailyList[] = [];

    // Get all daily lists
    const allDailyListIds = yield* dailyListAllIds({});
    for (const id of allDailyListIds) {
      const dailyList = yield* dailyListById({ id });
      if (dailyList) {
        dailyLists.push(dailyList);
      }
    }

    // Get all entries
    const entries: DailyEntry[] = [];
    const allEntryIds = yield* dailyEntryAllIds({});
    for (const id of allEntryIds) {
      const entry = yield* dailyEntryById({ id });
      if (entry) {
        entries.push(entry);
      }
    }

    const allSections = yield* allProjectSections({});
    const dailyReports: DailyReport[] = yield* allDailyReports({});

    return {
      projectSections: allSections.map((group) => ({
        id: group.id,
        title: group.title,
        projectId: group.projectId,
        createdAt: group.createdAt,
        orderToken: group.orderToken,
      })),
      tasks: tasks.map((task) => ({
        id: task.id,
        title: task.title,
        state: task.state,
        orderToken: task.orderToken,
        lastToggledAt: task.lastToggledAt,
        createdAt: task.createdAt,
        templateId: task.templateId,
        templateDate: task.templateDate,
        projectSectionId: task.projectSectionId,
        content: task.content || "",
      })),
      projects: projects.map((project) => ({
        id: project.id,
        title: project.title,
        icon: project.icon,
        isInbox: project.isInbox,
        orderToken: project.orderToken,
        createdAt: project.createdAt,
      })),
      dailyLists: dailyLists.map((dailyList) => ({
        id: dailyList.id,
        date: dailyList.date,
      })),
      dailyEntries: entries.map((entry) => ({
        id: entry.id,
        taskId: entry.taskId,
        orderToken: entry.orderToken,
        listId: entry.dailyListId,
        createdAt: entry.createdAt,
      })),
      taskTemplates: taskTemplates.map((template) => ({
        id: template.id,
        title: template.title,
        content: template.content || "",
        orderToken: template.orderToken,
        repeatRule: template.repeatRule,
        repeatRuleDtStart: template.repeatRuleDtStart,
        createdAt: template.createdAt,
        lastGeneratedAt: template.lastGeneratedAt,
        projectSectionId: template.projectSectionId,
        ...(template.startsAtMinutes == null
          ? {}
          : { startsAtMinutes: template.startsAtMinutes }),
        ...(template.durationMinutes == null
          ? {}
          : { durationMinutes: template.durationMinutes }),
      })),
      checklistItems: checklistItems.map((item) => ({
        id: item.id,
        parentId: item.parentId,
        parentType: item.parentType,
        orderToken: item.orderToken,
        state: item.state,
        content: item.content,
        createdAt: item.createdAt,
        checkedAt: item.checkedAt,
      })),
      dailyReports: dailyReports.map((report) => ({
        id: report.id,
        date: report.date,
        notes: report.notes,
        completedTasks: report.completedTasks,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
        ...(report.mood !== undefined ? { mood: report.mood } : {}),
        ...(report.energy !== undefined ? { energy: report.energy } : {}),
        ...(report.focus !== undefined ? { focus: report.focus } : {}),
        ...(report.accomplishment !== undefined
          ? { accomplishment: report.accomplishment }
          : {}),
      })),
    } satisfies Backup;
  },
});
