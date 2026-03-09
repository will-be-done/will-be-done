import { generateJitteredKeyBetween } from "fractional-indexing-jittered";
import { uuidv7 } from "uuidv7";
import type { Backup } from "../backup";

// Column indices in TickTick CSV (after header)
const COL_FOLDER = 0;
const COL_LIST = 1;
const COL_TITLE = 2;
const COL_CONTENT = 5;
const COL_START_DATE = 7;
const COL_DUE_DATE = 8;
const COL_REPEAT = 10;
const COL_STATUS = 12;
const COL_CREATED_TIME = 13;
const COL_COMPLETED_TIME = 14;
const COL_ORDER = 15;

/**
 * RFC 4180 compliant CSV parser.
 * Handles quoted fields with embedded commas, newlines, and escaped quotes ("").
 */
export function parseCSV(csv: string): string[][] {
  const rows: string[][] = [];
  let pos = 0;
  const len = csv.length;

  while (pos < len) {
    const row: string[] = [];

    while (pos < len) {
      let field: string;

      if (csv[pos] === '"') {
        // Quoted field
        pos++; // skip opening quote
        let buf = "";
        while (pos < len) {
          if (csv[pos] === '"') {
            if (pos + 1 < len && csv[pos + 1] === '"') {
              // Escaped quote
              buf += '"';
              pos += 2;
            } else {
              pos++; // skip closing quote
              break;
            }
          } else {
            buf += csv[pos++];
          }
        }
        field = buf;
      } else {
        // Unquoted field — read until comma or end of line
        const start = pos;
        while (
          pos < len &&
          csv[pos] !== "," &&
          csv[pos] !== "\n" &&
          csv[pos] !== "\r"
        ) {
          pos++;
        }
        field = csv.slice(start, pos);
      }

      row.push(field);

      if (pos < len && csv[pos] === ",") {
        pos++; // consume comma, continue to next field
      } else {
        break; // end of row
      }
    }

    // Skip row terminator (\r\n or \n)
    if (pos < len && csv[pos] === "\r") pos++;
    if (pos < len && csv[pos] === "\n") pos++;

    rows.push(row);
  }

  return rows;
}

function parseEpoch(dateStr: string): number {
  return new Date(dateStr).getTime();
}

/** Convert an ISO 8601 date string to a yyyy-MM-dd string in local time. */
function toDateString(isoStr: string): string {
  const d = new Date(isoStr);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Parses a TickTick CSV export and returns a Backup object compatible with loadBackup().
 *
 * TickTick CSV structure:
 *   Row 0: date metadata
 *   Row 1: version metadata
 *   Row 2: status legend (multiline quoted field)
 *   Row 3: header row
 *   Row 4+: task data rows
 *
 * Mapping:
 *   Folder/List → Project (title = "Folder/List", one project per unique pair)
 *   Each Project gets one default ProjectCategory (titled after the List)
 *   Repeat + Status=0 → TaskTemplate (recurring active)
 *   Otherwise   → Task (state based on Status: 0=todo, 1/2=done)
 */
export function parseTickTickCSV(csv: string): Backup {
  const allRows = parseCSV(csv);
  const dataRows = allRows.slice(4); // skip 3 metadata rows + 1 header row

  // Collect unique (folder, list) pairs, preserving insertion order
  const seenCatKeys: string[] = [];

  for (const row of dataRows) {
    const folder = row[COL_FOLDER] ?? "";
    const list = row[COL_LIST] ?? "";
    const catKey = `${folder}::${list}`;

    if (!seenCatKeys.includes(catKey)) seenCatKeys.push(catKey);
  }

  // Each (folder, list) pair → one Project titled "Folder/List"
  // and one default ProjectCategory within it.
  const projectsMap = new Map<
    string,
    { id: string; title: string; createdAt: number; orderToken: string }
  >();
  const categoriesMap = new Map<
    string,
    {
      id: string;
      title: string;
      projectId: string;
      createdAt: number;
      orderToken: string;
    }
  >();
  {
    let prevProject: string | null = null;
    for (const catKey of seenCatKeys) {
      const sepIdx = catKey.indexOf("::");
      const folder = catKey.slice(0, sepIdx);
      const listName = catKey.slice(sepIdx + 2);
      const projectTitle = folder ? `${folder}/${listName}` : listName;

      const projectId = uuidv7();
      const projectToken = generateJitteredKeyBetween(prevProject, null);
      prevProject = projectToken;

      projectsMap.set(catKey, {
        id: projectId,
        title: projectTitle,
        createdAt: Date.now(),
        orderToken: projectToken,
      });

      // Single default category per project, named after the list
      categoriesMap.set(catKey, {
        id: uuidv7(),
        title: "Tasks",
        projectId,
        createdAt: Date.now(),
        orderToken: generateJitteredKeyBetween(null, null),
      });
    }
  }

  // Sort rows by (folder, list, Order) for sequential orderToken generation within each category
  const sortedRows = [...dataRows].sort((a, b) => {
    const folderCmp = (a[COL_FOLDER] ?? "").localeCompare(b[COL_FOLDER] ?? "");
    if (folderCmp !== 0) return folderCmp;
    const listCmp = (a[COL_LIST] ?? "").localeCompare(b[COL_LIST] ?? "");
    if (listCmp !== 0) return listCmp;
    return Number(a[COL_ORDER] ?? 0) - Number(b[COL_ORDER] ?? 0);
  });

  const categoryLastToken = new Map<string, string | null>();

  const tasks: Backup["tasks"] = [];
  const taskTemplates: Backup["taskTemplates"] = [];
  // date string (yyyy-MM-dd) → DailyListBackup (id = date, used as local key)
  const dailyListsMap = new Map<string, { id: string; date: string }>();
  const dailyListProjections: NonNullable<Backup["dailyListProjections"]> = [];
  const projectionLastToken = new Map<string, string | null>();

  for (const row of sortedRows) {
    const folder = row[COL_FOLDER] ?? "";
    const list = row[COL_LIST] ?? "";
    const catKey = `${folder}::${list}`;
    const category = categoriesMap.get(catKey);
    if (!category) continue;

    const title = row[COL_TITLE] ?? "";
    const content = row[COL_CONTENT] ?? "";
    const status = row[COL_STATUS] ?? "0";
    const repeat = (row[COL_REPEAT] ?? "").trim();
    const createdTimeStr = row[COL_CREATED_TIME] ?? "";
    const completedTimeStr = row[COL_COMPLETED_TIME] ?? "";
    const startDateStr = row[COL_START_DATE] ?? "";
    const dueDateStr = row[COL_DUE_DATE] ?? "";

    const createdAt = createdTimeStr ? parseEpoch(createdTimeStr) : Date.now();
    const lastToggledAt = completedTimeStr
      ? parseEpoch(completedTimeStr)
      : createdAt;

    // Generate sequential orderToken within this category
    const prev = categoryLastToken.get(category.id) ?? null;
    const orderToken = generateJitteredKeyBetween(prev, null);
    categoryLastToken.set(category.id, orderToken);

    const isRecurring = repeat !== "";
    const isActive = status === "0";

    if (isRecurring && isActive) {
      // Recurring active task → TaskTemplate
      taskTemplates.push({
        id: uuidv7(),
        title,
        orderToken,
        horizon: "someday",
        repeatRule: repeat,
        repeatRuleDtStart: startDateStr ? parseEpoch(startDateStr) : createdAt,
        createdAt,
        lastGeneratedAt: createdAt,
        projectCategoryId: category.id,
      });
    } else {
      // Regular task or completed recurring instance → Task
      const taskId = uuidv7();
      tasks.push({
        id: taskId,
        title,
        content: content || undefined,
        state: isActive ? "todo" : "done",
        projectCategoryId: category.id,
        orderToken,
        lastToggledAt,
        createdAt,
        horizon: "someday",
        templateId: null,
        templateDate: null,
      });

      // If the task has a due date, create a daily list projection for it
      const plannedDateStr = dueDateStr || startDateStr;
      if (plannedDateStr) {
        const dateKey = toDateString(plannedDateStr);
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
    projects: [...projectsMap.values()].map((p) => ({
      id: p.id,
      title: p.title,
      icon: "",
      isInbox: p.title === "Inbox",
      orderToken: p.orderToken,
      createdAt: p.createdAt,
    })),

    projectCategories: [...categoriesMap.values()].map((c) => ({
      id: c.id,
      title: c.title,
      projectId: c.projectId,
      createdAt: c.createdAt,
      orderToken: c.orderToken,
    })),
    tasks,
    taskTemplates,
    dailyLists: [...dailyListsMap.values()],
    dailyListProjections,
  };
}
