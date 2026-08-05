import { selectSync } from "@will-be-done/hyperdb";
import {
  dailyDateFormat,
  getDMY,
  listScheduledTasks as listScheduledTasksSelector,
} from "@will-be-done/slices/space";
import { addDays, parse } from "date-fns";
import { getSpaceDatabase } from "./databaseAccess";
import { decodeNumericCursor, encodeNumericCursor } from "./pagination";
import { toPublicTask, type PublicTask } from "./tasks";

export interface ScheduledTaskSearchResult {
  tasks: PublicTask[];
  nextCursor: string | null;
}

export function listScheduledTasks({
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
}): ScheduledTaskSearchResult {
  const db = getSpaceDatabase(spaceId, userId);
  const boundary = parse(relativeTo, dailyDateFormat, new Date()).getTime();
  const exclusiveEnd = to
    ? addDays(parse(to, dailyDateFormat, new Date()), 1).getTime()
    : undefined;
  const decodedCursor = cursor ? decodeNumericCursor(cursor) : null;
  const page = selectSync(db, {
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
  return {
    tasks: page.items.map((row) =>
      toPublicTask(db, row.task, getDMY(new Date(row.scheduledAt))),
    ),
    nextCursor: page.nextCursor
      ? encodeNumericCursor({
          sort: page.nextCursor.scheduledAt,
          id: page.nextCursor.id,
        })
      : null,
  };
}
