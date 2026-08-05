import { selectSync } from "@will-be-done/hyperdb";
import {
  dailyListByDate,
  dailyEntriesByDailyListIds,
  dailyListsInDateRange,
  dailyListTasksByState,
  tasksByIds,
  type Task,
} from "@will-be-done/slices/space";
import { getSpaceDatabase } from "./databaseAccess";
import { toPublicTask, type PublicTask } from "./tasks";

export function listDailyListItems({
  spaceId,
  userId,
  date,
  state = "todo",
}: {
  spaceId: string;
  userId: string;
  date: string;
  state?: "todo" | "done";
}): PublicTask[] {
  const db = getSpaceDatabase(spaceId, userId);
  const dailyList = selectSync(db, {
    selector: dailyListByDate,
    args: { date },
  });
  if (!dailyList) return [];

  return selectSync(db, {
    selector: dailyListTasksByState,
    args: { dailyListId: dailyList.id, state },
  }).map((task) => toPublicTask(db, task, dailyList.date));
}

export interface PublicDailyList {
  date: string;
  items: PublicTask[];
}

export function listDailyListsInRange({
  spaceId,
  userId,
  from,
  to,
  state = "todo",
}: {
  spaceId: string;
  userId: string;
  from: string;
  to: string;
  state?: "todo" | "done";
}): PublicDailyList[] {
  const db = getSpaceDatabase(spaceId, userId);
  const dailyLists = selectSync(db, {
    selector: dailyListsInDateRange,
    args: { from, to },
  });
  if (dailyLists.length === 0) return [];

  const entries = selectSync(db, {
    selector: dailyEntriesByDailyListIds,
    args: { dailyListIds: dailyLists.map((dailyList) => dailyList.id) },
  });
  const tasks = selectSync(db, {
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

  return dailyLists.map((dailyList) => {
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
      items: matchingTasks.map((task) =>
        toPublicTask(db, task, dailyList.date),
      ),
    };
  });
}
