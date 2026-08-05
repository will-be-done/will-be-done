import { selectAsync } from "@will-be-done/hyperdb";
import {
  dailyListByDate,
  dailyEntriesByDailyListIds,
  dailyListsInDateRange,
  dailyListTasksByState,
  tasksByIds,
  type Task,
} from "@will-be-done/slices/space";
import { getSpaceDatabase } from "./databaseAccess";
import { decodeStringCursor, encodeStringCursor } from "./pagination";
import { toPublicTask, type PublicTask } from "./tasks";

export async function listDailyListItems({
  spaceId,
  userId,
  date,
  state = "todo",
}: {
  spaceId: string;
  userId: string;
  date: string;
  state?: "todo" | "done";
}): Promise<PublicTask[]> {
  const db = await getSpaceDatabase(spaceId, userId);
  const dailyList = await selectAsync(db, {
    selector: dailyListByDate,
    args: { date },
  });
  if (!dailyList) return [];

  return (
    await selectAsync(db, {
      selector: dailyListTasksByState,
      args: { dailyListId: dailyList.id, state },
    })
  ).map((task) => toPublicTask(task, dailyList.date));
}

export interface PublicDailyList {
  date: string;
  items: PublicTask[];
}

export interface DailyListSearchResult {
  dailyLists: PublicDailyList[];
  nextCursor: string | null;
}

export async function listDailyListsInRange({
  spaceId,
  userId,
  from,
  to,
  state = "todo",
  cursor,
  limit,
}: {
  spaceId: string;
  userId: string;
  from: string;
  to: string;
  state?: "todo" | "done";
  cursor?: string;
  limit: number;
}): Promise<DailyListSearchResult> {
  const db = await getSpaceDatabase(spaceId, userId);
  const decodedCursor = cursor ? decodeStringCursor(cursor) : null;
  const dailyLists = await selectAsync(db, {
    selector: dailyListsInDateRange,
    args: {
      from,
      to,
      cursorDate: decodedCursor?.sort ?? null,
      cursorId: decodedCursor?.id ?? null,
      limit: limit + 1,
    },
  });
  const page = dailyLists.slice(0, limit);
  if (page.length === 0) return { dailyLists: [], nextCursor: null };

  const entries = await selectAsync(db, {
    selector: dailyEntriesByDailyListIds,
    args: { dailyListIds: page.map((dailyList) => dailyList.id) },
  });
  const tasks = await selectAsync(db, {
    selector: tasksByIds,
    args: { ids: entries.map((entry) => entry.id) },
  });
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const entriesByDailyListId = new Map<string, typeof entries>();
  for (const entry of entries) {
    const dailyListEntries = entriesByDailyListId.get(entry.dailyListId) ?? [];
    dailyListEntries.push(entry);
    entriesByDailyListId.set(entry.dailyListId, dailyListEntries);
  }

  const publicDailyLists = page.map((dailyList) => {
    const matchingTasks = (entriesByDailyListId.get(dailyList.id) ?? [])
      .map((entry) => taskById.get(entry.id))
      .filter((task): task is Task => task?.state === state);
    if (state === "done") {
      matchingTasks.sort(
        (left, right) => right.lastToggledAt - left.lastToggledAt,
      );
    }

    return {
      date: dailyList.date,
      items: matchingTasks.map((task) => toPublicTask(task, dailyList.date)),
    };
  });
  const last = page.at(-1);
  return {
    dailyLists: publicDailyLists,
    nextCursor:
      dailyLists.length > limit && last
        ? encodeStringCursor({ sort: last.date, id: last.id })
        : null,
  };
}
