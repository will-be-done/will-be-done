import { Effect } from "effect";
import {
  dailyDateFormat,
  listScheduledTasks as listScheduledTasksSelector,
} from "@will-be-done/slices/space";
import { addDays, parse } from "date-fns";
import { getSpaceDatabase } from "./databaseAccess";
import { select } from "./hyperdb";
import { decodeNumericCursor, encodeNumericCursor } from "./pagination";
import { getTaskSchedules, toPublicTask, type PublicTask } from "./tasks";

export interface ScheduledTaskSearchResult {
  tasks: PublicTask[];
  nextCursor: string | null;
}

export const listScheduledTasks = Effect.fn("listScheduledTasks")(function* ({
  spaceId,
  userId,
  scope,
  relativeTo,
  to,
  cursor,
  limit,
}: {
  spaceId: string;
  userId: string;
  scope: "overdue" | "upcoming";
  relativeTo: string;
  to?: string;
  cursor?: string;
  limit: number;
}) {
  const db = yield* getSpaceDatabase(spaceId, userId);
  const boundary = parse(relativeTo, dailyDateFormat, new Date()).getTime();
  const exclusiveEnd = to
    ? addDays(parse(to, dailyDateFormat, new Date()), 1).getTime()
    : undefined;
  const decodedCursor = cursor ? yield* decodeNumericCursor(cursor) : null;
  const page = yield* select(db, {
    selector: listScheduledTasksSelector,
    args: {
      fromInclusive: scope === "overdue" ? Number.MIN_SAFE_INTEGER : boundary,
      toExclusive:
        scope === "overdue"
          ? boundary
          : (exclusiveEnd ?? Number.MAX_SAFE_INTEGER),
      cursorScheduledAt: decodedCursor?.sort ?? null,
      cursorId: decodedCursor?.id ?? null,
      limit,
    },
  });
  const schedules = yield* getTaskSchedules(
    db,
    page.items.map((row) => row.task.id),
  );
  const result: ScheduledTaskSearchResult = {
    tasks: page.items.map((row) =>
      toPublicTask(row.task, schedules.get(row.task.id) ?? null),
    ),
    nextCursor: page.nextCursor
      ? encodeNumericCursor({
          sort: page.nextCursor.scheduledAt,
          id: page.nextCursor.id,
        })
      : null,
  };
  return result;
});
