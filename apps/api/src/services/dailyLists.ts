import { Effect } from "effect";
import {
  dailyListByDate,
  dailyEntriesByDailyListIds,
  dailyListsInDateRange,
  dailyListTasksByState,
  tasksByIds,
  type Task,
} from "@will-be-done/slices/space";
import { getSpaceDatabase } from "./databaseAccess";
import { select } from "./hyperdb";
import { decodeStringCursor, encodeStringCursor } from "./pagination";
import { toPublicTask, type PublicTask } from "./tasks";

export const listDailyListItems = Effect.fn("listDailyListItems")(function* ({
  spaceId,
  userId,
  date,
  state = "todo",
}: {
  spaceId: string;
  userId: string;
  date: string;
  state?: "todo" | "done";
}) {
  const db = yield* getSpaceDatabase(spaceId, userId);
  const dailyList = yield* select(db, {
    selector: dailyListByDate,
    args: { date },
  });
  if (!dailyList) return [];

  const tasks = yield* select(db, {
    selector: dailyListTasksByState,
    args: { dailyListId: dailyList.id, state },
  });
  const entries = yield* select(db, {
    selector: dailyEntriesByDailyListIds,
    args: { dailyListIds: [dailyList.id] },
  });
  const timeByTaskId = new Map(
    entries.map((entry) => [entry.taskId, entry.time ?? null]),
  );
  return tasks.map((task) =>
    toPublicTask(task, {
      date: dailyList.date,
      time: timeByTaskId.get(task.id) ?? null,
    }),
  );
});

export interface PublicDailyList {
  date: string;
  items: PublicTask[];
}

export interface DailyListSearchResult {
  dailyLists: PublicDailyList[];
  nextCursor: string | null;
}

export const listDailyListsInRange = Effect.fn("listDailyListsInRange")(
  function* ({
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
  }) {
    const db = yield* getSpaceDatabase(spaceId, userId);
    const decodedCursor = cursor ? yield* decodeStringCursor(cursor) : null;
    const dailyLists = yield* select(db, {
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
    if (page.length === 0) {
      const empty: DailyListSearchResult = { dailyLists: [], nextCursor: null };
      return empty;
    }

    const entries = yield* select(db, {
      selector: dailyEntriesByDailyListIds,
      args: { dailyListIds: page.map((dailyList) => dailyList.id) },
    });
    const tasks = yield* select(db, {
      selector: tasksByIds,
      args: { ids: entries.map((entry) => entry.taskId) },
    });
    const taskById = new Map(tasks.map((task) => [task.id, task]));
    const timeByTaskId = new Map(
      entries.map((entry) => [entry.taskId, entry.time ?? null]),
    );
    const entriesByDailyListId = new Map<string, typeof entries>();
    for (const entry of entries) {
      const dailyListEntries =
        entriesByDailyListId.get(entry.dailyListId) ?? [];
      dailyListEntries.push(entry);
      entriesByDailyListId.set(entry.dailyListId, dailyListEntries);
    }

    const publicDailyLists = page.map((dailyList) => {
      const matchingTasks = (entriesByDailyListId.get(dailyList.id) ?? [])
        .map((entry) => taskById.get(entry.taskId))
        .filter((task): task is Task => task?.state === state);
      if (state === "done") {
        matchingTasks.sort(
          (left, right) => right.lastToggledAt - left.lastToggledAt,
        );
      }

      return {
        date: dailyList.date,
        items: matchingTasks.map((task) =>
          toPublicTask(task, {
            date: dailyList.date,
            time: timeByTaskId.get(task.id) ?? null,
          }),
        ),
      };
    });
    const last = page.at(-1);
    const result: DailyListSearchResult = {
      dailyLists: publicDailyLists,
      nextCursor:
        dailyLists.length > limit && last
          ? encodeStringCursor({ sort: last.date, id: last.id })
          : null,
    };
    return result;
  },
);
