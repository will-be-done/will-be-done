import { selectSync } from "@will-be-done/hyperdb";
import {
  allProjectSections,
  allTasks,
  dailyEntriesByIds,
  dailyEntryAllIds,
  dailyListsByIds,
} from "@will-be-done/slices/space";
import { getSpaceDatabase } from "./databaseAccess";
import { decodeNumericCursor, encodeNumericCursor } from "./pagination";
import {
  toPublicTask,
  type PublicTask,
  type PublicTaskNature,
  type PublicTaskState,
} from "./tasks";

export interface TaskSearchResult {
  tasks: PublicTask[];
  nextCursor: string | null;
}

export function listSpaceTasks({
  spaceId,
  userId,
  state,
  sectionId,
  projectId,
  scheduledFrom,
  scheduledTo,
  nature,
  search,
  cursor,
  limit,
}: {
  spaceId: string;
  userId: string;
  state?: PublicTaskState;
  sectionId?: string;
  projectId?: string;
  scheduledFrom?: string;
  scheduledTo?: string;
  nature?: PublicTaskNature;
  search?: string;
  cursor?: string;
  limit: number;
}): TaskSearchResult {
  const db = getSpaceDatabase(spaceId, userId);
  const sections = selectSync(db, { selector: allProjectSections, args: {} });
  const sectionById = new Map(sections.map((section) => [section.id, section]));

  const entryIds = selectSync(db, { selector: dailyEntryAllIds, args: {} });
  const entries = entryIds.length
    ? selectSync(db, { selector: dailyEntriesByIds, args: { ids: entryIds } })
    : [];
  const dailyListIds = [...new Set(entries.map((entry) => entry.dailyListId))];
  const dailyLists = dailyListIds.length
    ? selectSync(db, {
        selector: dailyListsByIds,
        args: { ids: dailyListIds },
      })
    : [];
  const dateByDailyListId = new Map(
    dailyLists.map((dailyList) => [dailyList.id, dailyList.date]),
  );
  const scheduledDateByTaskId = new Map(
    entries.map((entry) => [
      entry.id,
      dateByDailyListId.get(entry.dailyListId) ?? null,
    ]),
  );

  const normalizedSearch = search?.trim().toLocaleLowerCase();
  let tasks = selectSync(db, { selector: allTasks, args: {} }).filter(
    (task) => {
      if (state !== undefined && task.state !== state) return false;
      if (sectionId !== undefined && task.projectSectionId !== sectionId) {
        return false;
      }
      if (
        projectId !== undefined &&
        sectionById.get(task.projectSectionId)?.projectId !== projectId
      ) {
        return false;
      }
      if (nature !== undefined && (task.nature ?? "unknown") !== nature) {
        return false;
      }

      const scheduledDate = scheduledDateByTaskId.get(task.id) ?? null;
      if (scheduledFrom !== undefined) {
        if (scheduledDate === null || scheduledDate < scheduledFrom)
          return false;
      }
      if (scheduledTo !== undefined) {
        if (scheduledDate === null || scheduledDate > scheduledTo) return false;
      }

      if (normalizedSearch) {
        const haystack =
          `${task.title}\n${task.content ?? ""}`.toLocaleLowerCase();
        if (!haystack.includes(normalizedSearch)) return false;
      }
      return true;
    },
  );

  tasks.sort(
    (left, right) =>
      right.createdAt - left.createdAt || left.id.localeCompare(right.id),
  );

  if (cursor !== undefined) {
    const decoded = decodeNumericCursor(cursor);
    tasks = tasks.filter(
      (task) =>
        task.createdAt < decoded.sort ||
        (task.createdAt === decoded.sort && task.id > decoded.id),
    );
  }

  const page = tasks.slice(0, limit);
  const last = page.at(-1);
  return {
    tasks: page.map((task) =>
      toPublicTask(db, task, scheduledDateByTaskId.get(task.id) ?? null),
    ),
    nextCursor:
      tasks.length > limit && last
        ? encodeNumericCursor({ sort: last.createdAt, id: last.id })
        : null,
  };
}
