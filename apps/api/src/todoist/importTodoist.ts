import { TodoistApi } from "@doist/todoist-api-typescript";
import type {
  Task as TodoistTask,
  PersonalProject,
  WorkspaceProject,
  Section as TodoistSection,
} from "@doist/todoist-api-typescript";
import { generateJitteredKeyBetween } from "fractional-indexing-jittered";
import { uuidv7 } from "uuidv7";
import type { Backup } from "@will-be-done/slices/space";

// ---------------------------------------------------------------------------
// Pagination helpers
// ---------------------------------------------------------------------------

async function fetchAllTasks(api: TodoistApi): Promise<TodoistTask[]> {
  const all: TodoistTask[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const res = await api.getTasks({ cursor, limit: 200 });
    all.push(...res.results);
    cursor = res.nextCursor;
  } while (cursor);
  return all;
}

async function fetchAllCompletedTasks(api: TodoistApi): Promise<TodoistTask[]> {
  const all: TodoistTask[] = [];

  // The Todoist API limits the date range for completed tasks queries,
  // so we fetch in 3-month chunks going backwards from now.
  const now = new Date();
  const MONTHS_PER_CHUNK = 3;
  const MAX_YEARS_BACK = 15;
  const totalChunks = (MAX_YEARS_BACK * 12) / MONTHS_PER_CHUNK;

  try {
    for (let i = 0; i < totalChunks; i++) {
      const until = new Date(now);
      until.setMonth(until.getMonth() - i * MONTHS_PER_CHUNK);

      const since = new Date(now);
      since.setMonth(since.getMonth() - (i + 1) * MONTHS_PER_CHUNK);

      const sinceStr = since.toISOString().replace("Z", "");
      const untilStr = until.toISOString().replace("Z", "");

      let cursor: string | null | undefined = undefined;
      let chunkCount = 0;
      do {
        const res = await api.getCompletedTasksByCompletionDate({
          since: sinceStr,
          until: untilStr,
          cursor,
          limit: 200,
        });
        all.push(...res.items);
        chunkCount += res.items.length;
        cursor = res.nextCursor;
      } while (cursor);

      // If an older chunk returned nothing, stop going further back
      if (chunkCount === 0 && i > 0) break;
    }
  } catch (e) {
    // Completed tasks API may require Todoist Premium — gracefully skip
    console.warn(
      "Could not fetch completed tasks (may require Todoist Premium):",
      e instanceof Error ? e.message : e,
    );
  }
  return all;
}

async function fetchAllProjects(
  api: TodoistApi,
): Promise<(PersonalProject | WorkspaceProject)[]> {
  const all: (PersonalProject | WorkspaceProject)[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const res = await api.getProjects({ cursor, limit: 200 });
    all.push(...res.results);
    cursor = res.nextCursor;
  } while (cursor);
  return all;
}

async function fetchAllSections(api: TodoistApi): Promise<TodoistSection[]> {
  const all: TodoistSection[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const res = await api.getSections({ cursor, limit: 200 });
    all.push(...res.results);
    cursor = res.nextCursor;
  } while (cursor);
  return all;
}

// ---------------------------------------------------------------------------
// Recurrence conversion
// ---------------------------------------------------------------------------

const DAY_MAP: Record<string, string> = {
  monday: "MO",
  tuesday: "TU",
  wednesday: "WE",
  thursday: "TH",
  friday: "FR",
  saturday: "SA",
  sunday: "SU",
  mon: "MO",
  tue: "TU",
  wed: "WE",
  thu: "TH",
  fri: "FR",
  sat: "SA",
  sun: "SU",
};

/**
 * Best-effort conversion from Todoist's natural language recurrence string
 * to an RRule string. Returns null if the pattern is not recognised.
 */
export function todoistRecurrenceToRRule(dueString: string): string | null {
  const s = dueString.toLowerCase().trim();

  // "every day" / "daily"
  if (s === "every day" || s === "daily") return "FREQ=DAILY;INTERVAL=1";

  // "every week" / "weekly"
  if (s === "every week" || s === "weekly") return "FREQ=WEEKLY;INTERVAL=1";

  // "every month" / "monthly"
  if (s === "every month" || s === "monthly") return "FREQ=MONTHLY;INTERVAL=1";

  // "every year" / "yearly" / "annually"
  if (s === "every year" || s === "yearly" || s === "annually")
    return "FREQ=YEARLY;INTERVAL=1";

  // "every N days/weeks/months/years"
  const FREQ_MAP: Record<string, string> = {
    day: "DAILY",
    week: "WEEKLY",
    month: "MONTHLY",
    year: "YEARLY",
  };
  const intervalMatch = s.match(/^every\s+(\d+)\s+(day|week|month|year)s?$/);
  if (intervalMatch) {
    const n = intervalMatch[1];
    const freq = FREQ_MAP[intervalMatch[2]];
    return `FREQ=${freq};INTERVAL=${n}`;
  }

  // "every <weekday>" e.g. "every monday", "every mon"
  const dayMatch = s.match(/^every\s+(\w+)$/);
  if (dayMatch) {
    const dayCode = DAY_MAP[dayMatch[1]];
    if (dayCode) return `FREQ=WEEKLY;INTERVAL=1;BYDAY=${dayCode}`;
  }

  // "every other day/week/month/year"
  const otherMatch = s.match(/^every\s+other\s+(day|week|month|year)$/);
  if (otherMatch) {
    const freq = FREQ_MAP[otherMatch[1]];
    return `FREQ=${freq};INTERVAL=2`;
  }

  // "every other <weekday>"
  const otherDayMatch = s.match(/^every\s+other\s+(\w+)$/);
  if (otherDayMatch) {
    const dayCode = DAY_MAP[otherDayMatch[1]];
    if (dayCode) return `FREQ=WEEKLY;INTERVAL=2;BYDAY=${dayCode}`;
  }

  // Unrecognised pattern
  return null;
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/** Convert an ISO 8601 / YYYY-MM-DD date string to yyyy-MM-dd. */
function toDateKey(dateStr: string): string {
  // Todoist dates can be "2024-03-15" or "2024-03-15T10:00:00Z"
  return dateStr.slice(0, 10);
}

function parseEpoch(dateStr: string | null | undefined): number {
  if (!dateStr) return Date.now();
  return new Date(dateStr).getTime();
}

function isPersonalProject(
  p: PersonalProject | WorkspaceProject,
): p is PersonalProject {
  return "inboxProject" in p;
}

export function buildBackup(
  todoistProjects: (PersonalProject | WorkspaceProject)[],
  todoistSections: TodoistSection[],
  allTodoistTasks: TodoistTask[],
): Backup {
  const projectIdMap = new Map<string, string>(); // todoist id → wbd id
  const projects: Backup["projects"] = [];
  let prevProjectToken: string | null = null;

  for (const tp of todoistProjects) {
    const wbdId = uuidv7();
    projectIdMap.set(tp.id, wbdId);

    const orderToken = generateJitteredKeyBetween(prevProjectToken, null);
    prevProjectToken = orderToken;

    const isInbox = isPersonalProject(tp) && tp.inboxProject === true;

    projects.push({
      id: wbdId,
      title: tp.name,
      icon: "",
      isInbox,
      orderToken,
      createdAt: parseEpoch(tp.createdAt),
    });
  }

  const categoryIdMap = new Map<string, string>(); // todoist section id → wbd category id
  const defaultCategoryMap = new Map<string, string>(); // todoist project id → default wbd category id
  const projectCategories: Backup["projectCategories"] = [];

  // Group sections by project for ordering
  const sectionsByProject = new Map<string, TodoistSection[]>();
  for (const s of todoistSections) {
    const arr = sectionsByProject.get(s.projectId) || [];
    arr.push(s);
    sectionsByProject.set(s.projectId, arr);
  }

  // For each project: create default category + one category per section
  for (const tp of todoistProjects) {
    const wbdProjectId = projectIdMap.get(tp.id)!;
    let prevCatToken: string | null = null;

    // Default category for tasks with no section
    const defaultCatId = uuidv7();
    const defaultCatToken = generateJitteredKeyBetween(prevCatToken, null);
    prevCatToken = defaultCatToken;

    defaultCategoryMap.set(tp.id, defaultCatId);
    projectCategories.push({
      id: defaultCatId,
      title: "Tasks",
      projectId: wbdProjectId,
      createdAt: parseEpoch(tp.createdAt),
      orderToken: defaultCatToken,
    });

    // Sections sorted by sectionOrder
    const sections = (sectionsByProject.get(tp.id) || []).sort(
      (a, b) => a.sectionOrder - b.sectionOrder,
    );

    for (const sec of sections) {
      const catId = uuidv7();
      categoryIdMap.set(sec.id, catId);

      const catToken = generateJitteredKeyBetween(prevCatToken, null);
      prevCatToken = catToken;

      projectCategories.push({
        id: catId,
        title: sec.name,
        projectId: wbdProjectId,
        createdAt: parseEpoch(sec.addedAt),
        orderToken: catToken,
      });
    }
  }

  const tasks: Backup["tasks"] = [];
  const taskTemplates: Backup["taskTemplates"] = [];
  const dailyListsMap = new Map<string, { id: string; date: string }>();
  const dailyListProjections: NonNullable<Backup["dailyListProjections"]> = [];
  const projectionLastToken = new Map<string, string | null>();

  const tasksByCategory = new Map<string, TodoistTask[]>();

  for (const t of allTodoistTasks) {
    let catId: string;
    if (t.sectionId) {
      catId =
        categoryIdMap.get(t.sectionId) ||
        defaultCategoryMap.get(t.projectId) ||
        "";
    } else {
      catId = defaultCategoryMap.get(t.projectId) || "";
    }
    if (!catId) continue; // project not found

    const arr = tasksByCategory.get(catId) || [];
    arr.push(t);
    tasksByCategory.set(catId, arr);
  }

  // Process tasks per category, sorted by childOrder
  for (const [catId, catTasks] of tasksByCategory) {
    const sorted = catTasks.sort((a, b) => a.childOrder - b.childOrder);
    let prevToken: string | null = null;

    for (const t of sorted) {
      const orderToken = generateJitteredKeyBetween(prevToken, null);
      prevToken = orderToken;

      const createdAt = parseEpoch(t.addedAt);
      const isRecurring = t.due?.isRecurring === true && !t.checked;

      if (isRecurring && t.due) {
        // Try to convert recurrence to RRule
        const rrule = todoistRecurrenceToRRule(t.due.string);
        if (rrule) {
          const dtStart = t.due.date
            ? new Date(t.due.date).getTime()
            : createdAt;

          taskTemplates.push({
            id: uuidv7(),
            title: t.content,
            orderToken,
            horizon: "someday",
            repeatRule: rrule,
            repeatRuleDtStart: dtStart,
            createdAt,
            lastGeneratedAt: createdAt,
            projectCategoryId: catId,
          });
          continue; // don't create a regular task
        }
        // If RRule conversion fails, fall through to create a regular task
      }

      const taskId = uuidv7();
      tasks.push({
        id: taskId,
        title: t.content,
        content: t.description || "",
        state: t.checked ? "done" : "todo",
        projectCategoryId: catId,
        orderToken,
        lastToggledAt: t.completedAt ? parseEpoch(t.completedAt) : createdAt,
        createdAt,
        horizon: "someday",
        templateId: null,
        templateDate: null,
      });

      // Daily list projection from due date
      if (t.due?.date) {
        const dateKey = toDateKey(t.due.date);
        if (!dailyListsMap.has(dateKey)) {
          dailyListsMap.set(dateKey, { id: dateKey, date: dateKey });
        }
        const projPrev = projectionLastToken.get(dateKey) ?? null;
        const projToken = generateJitteredKeyBetween(projPrev, null);
        projectionLastToken.set(dateKey, projToken);
        dailyListProjections.push({
          id: taskId,
          orderToken: projToken,
          listId: dateKey,
          createdAt,
        });
      }
    }
  }

  return {
    projects,
    projectCategories,
    tasks,
    taskTemplates,
    dailyLists: [...dailyListsMap.values()],
    dailyListProjections,
  };
}

export async function importFromTodoist(apiToken: string): Promise<Backup> {
  const api = new TodoistApi(apiToken);

  // Fetch everything in parallel
  const [todoistProjects, todoistSections, activeTasks, completedTasks] =
    await Promise.all([
      fetchAllProjects(api),
      fetchAllSections(api),
      fetchAllTasks(api),
      fetchAllCompletedTasks(api),
    ]);

  return buildBackup(todoistProjects, todoistSections, [
    ...activeTasks,
    ...completedTasks,
  ]);
}
