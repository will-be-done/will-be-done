import { selectAsync } from "@will-be-done/hyperdb";
import { tasksPageByCreatedAt } from "@will-be-done/slices/space";
import { getSpaceDatabase } from "./databaseAccess";
import { decodeNumericCursor, encodeNumericCursor } from "./pagination";
import { getTaskScheduledDates, toPublicTask, type PublicTask } from "./tasks";

export interface TaskSearchResult {
  tasks: PublicTask[];
  nextCursor: string | null;
}

export async function listSpaceTasks({
  spaceId,
  userId,
  cursor,
  limit,
}: {
  spaceId: string;
  userId: string;
  cursor?: string;
  limit: number;
}): Promise<TaskSearchResult> {
  const db = await getSpaceDatabase(spaceId, userId);
  const decodedCursor = cursor ? decodeNumericCursor(cursor) : null;
  const tasks = await selectAsync(db, {
    selector: tasksPageByCreatedAt,
    args: {
      cursorCreatedAt: decodedCursor?.sort ?? null,
      cursorId: decodedCursor?.id ?? null,
      limit: limit + 1,
    },
  });
  const page = tasks.slice(0, limit);
  const scheduledDateByTaskId = await getTaskScheduledDates(
    db,
    page.map((task) => task.id),
  );
  const last = page.at(-1);
  return {
    tasks: page.map((task) =>
      toPublicTask(task, scheduledDateByTaskId.get(task.id) ?? null),
    ),
    nextCursor:
      tasks.length > limit && last
        ? encodeNumericCursor({ sort: last.createdAt, id: last.id })
        : null,
  };
}
