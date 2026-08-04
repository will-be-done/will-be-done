import { selectSync } from "@will-be-done/hyperdb";
import {
  dailyEntriesByIds,
  dailyListsByIds,
  tasksPageByCreatedAt,
} from "@will-be-done/slices/space";
import { getSpaceDatabase } from "./databaseAccess";
import { decodeNumericCursor, encodeNumericCursor } from "./pagination";
import { toPublicTask, type PublicTask } from "./tasks";

export interface TaskSearchResult {
  tasks: PublicTask[];
  nextCursor: string | null;
}

export function listSpaceTasks({
  spaceId,
  userId,
  cursor,
  limit,
}: {
  spaceId: string;
  userId: string;
  cursor?: string;
  limit: number;
}): TaskSearchResult {
  const db = getSpaceDatabase(spaceId, userId);
  const decodedCursor = cursor ? decodeNumericCursor(cursor) : null;
  const tasks = selectSync(db, {
    selector: tasksPageByCreatedAt,
    args: {
      cursorCreatedAt: decodedCursor?.sort ?? null,
      cursorId: decodedCursor?.id ?? null,
      limit: limit + 1,
    },
  });
  const page = tasks.slice(0, limit);

  const entries = selectSync(db, {
    selector: dailyEntriesByIds,
    args: { ids: page.map((task) => task.id) },
  });
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
