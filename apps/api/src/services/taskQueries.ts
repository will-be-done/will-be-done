import { Effect } from "effect";
import { tasksPageByCreatedAt } from "@will-be-done/slices/space";
import { getSpaceDatabase } from "./databaseAccess";
import { select } from "./hyperdb";
import { decodeNumericCursor, encodeNumericCursor } from "./pagination";
import { getTaskSchedules, toPublicTask, type PublicTask } from "./tasks";

export interface TaskSearchResult {
  tasks: PublicTask[];
  nextCursor: string | null;
}

export const listSpaceTasks = Effect.fn("listSpaceTasks")(function* ({
  spaceId,
  userId,
  cursor,
  limit,
}: {
  spaceId: string;
  userId: string;
  cursor?: string;
  limit: number;
}) {
  const db = yield* getSpaceDatabase(spaceId, userId);
  const decodedCursor = cursor ? yield* decodeNumericCursor(cursor) : null;
  const tasks = yield* select(db, {
    selector: tasksPageByCreatedAt,
    args: {
      cursorCreatedAt: decodedCursor?.sort ?? null,
      cursorId: decodedCursor?.id ?? null,
      limit: limit + 1,
    },
  });
  const page = tasks.slice(0, limit);
  const scheduleByTaskId = yield* getTaskSchedules(
    db,
    page.map((task) => task.id),
  );
  const last = page.at(-1);
  const result: TaskSearchResult = {
    tasks: page.map((task) =>
      toPublicTask(task, scheduleByTaskId.get(task.id) ?? null),
    ),
    nextCursor:
      tasks.length > limit && last
        ? encodeNumericCursor({ sort: last.createdAt, id: last.id })
        : null,
  };
  return result;
});
