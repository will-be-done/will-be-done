import { selectSync } from "@will-be-done/hyperdb";
import {
  allScheduledTodoTasks,
  allTasks,
  dailyDateFormat,
  getDMY,
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

  let rows = selectSync(db, {
    selector: allScheduledTodoTasks,
    args: {},
  }).filter((row) =>
    scope === "overdue"
      ? row.scheduledAt < boundary
      : row.scheduledAt >= boundary &&
        (exclusiveEnd === undefined || row.scheduledAt < exclusiveEnd),
  );
  rows.sort(
    (left, right) =>
      left.scheduledAt - right.scheduledAt || left.id.localeCompare(right.id),
  );

  if (cursor !== undefined) {
    const decoded = decodeNumericCursor(cursor);
    rows = rows.filter(
      (row) =>
        row.scheduledAt > decoded.sort ||
        (row.scheduledAt === decoded.sort && row.id > decoded.id),
    );
  }

  const tasksById = new Map(
    selectSync(db, { selector: allTasks, args: {} }).map((task) => [
      task.id,
      task,
    ]),
  );
  const matchingRows = rows.filter((row) => tasksById.has(row.id));
  const page = matchingRows.slice(0, limit);
  const last = page.at(-1);
  return {
    tasks: page.map((row) =>
      toPublicTask(
        db,
        tasksById.get(row.id)!,
        getDMY(new Date(row.scheduledAt)),
      ),
    ),
    nextCursor:
      matchingRows.length > limit && last
        ? encodeNumericCursor({ sort: last.scheduledAt, id: last.id })
        : null,
  };
}
