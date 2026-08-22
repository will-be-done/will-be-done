import { selectFrom, upsert, v } from "@will-be-done/hyperdb";
import { action, selector } from "../builders";
import { getDMY } from "./utils";
import {
  dailyEntryByTaskId,
  dailyEntriesByDailyListIds,
  scheduleTask,
} from "./dailyEntries";
import { dailyListById } from "./dailyLists";
import { taskById, tasksByIds } from "./tasks";
import { packDailyListTimeBlocks } from "./timeBlockPacking";
import { type Task, dailyListsTable, tasksTable } from "./tables";

const MAX_CALENDAR_TASKS = 200;
const DEFAULT_DURATION_MINUTES = 30;

export function taskTimeBlockEnd(task: Task): number | undefined {
  if (task.startsAt == null || task.durationMinutes == null) return undefined;
  return task.startsAt + task.durationMinutes * 60 * 1000;
}

export function hasTimeBlock(
  task: Task,
): task is Task & { startsAt: number; durationMinutes: number } {
  return (
    task.startsAt != null &&
    task.durationMinutes != null &&
    task.durationMinutes > 0
  );
}

export const timedTasksForRange = selector({
  name: "timedTasksForRange",
  args: {
    fromInclusive: v.number(),
    toExclusive: v.number(),
  },
  handler: function* timedTasksForRange({
    fromInclusive,
    toExclusive,
  }): Generator<unknown, Task[], unknown> {
    const fromDate = getDMY(new Date(fromInclusive));
    const toDate = getDMY(new Date(toExclusive - 1));
    const lists = yield* selectFrom(dailyListsTable, "byDateOrdered")
      .where((q) => q.gte("date", fromDate).lte("date", toDate))
      .order("asc")
      .limit(31);

    const entries = yield* dailyEntriesByDailyListIds({
      dailyListIds: lists.map((list) => list.id),
    });
    const tasks = yield* tasksByIds({
      ids: entries.slice(0, MAX_CALENDAR_TASKS).map((entry) => entry.taskId),
    });

    return tasks.filter((task) => {
      if (!hasTimeBlock(task)) return false;
      const end = taskTimeBlockEnd(task);
      if (end == null) return false;
      return task.startsAt < toExclusive && end > fromInclusive;
    });
  },
});

function* packTaskDailyList(taskId: string) {
  const existing = yield* dailyEntryByTaskId({ taskId });
  if (!existing) return;
  yield* packDailyListTimeBlocks({ dailyListId: existing.dailyListId });
}

export const placeTaskOnCalendar = action({
  name: "placeTaskOnCalendar",
  args: {
    taskId: v.string(),
    startsAt: v.number(),
    durationMinutes: v.optional(v.number()),
  },
  handler: function* placeTaskOnCalendar({
    taskId,
    startsAt,
    durationMinutes,
  }): Generator<unknown, Task, unknown> {
    const task = yield* taskById({ id: taskId });
    if (!task) throw new Error("Task not found");

    const nextDuration =
      durationMinutes ??
      (task.durationMinutes != null && task.durationMinutes > 0
        ? task.durationMinutes
        : DEFAULT_DURATION_MINUTES);

    const date = getDMY(new Date(startsAt));
    const existing = yield* dailyEntryByTaskId({ taskId });
    const existingList = existing
      ? yield* dailyListById({ id: existing.dailyListId })
      : undefined;
    if (existingList?.date !== date) {
      yield* scheduleTask({
        taskId,
        date,
        position: "append",
      });
    }

    const latest = (yield* taskById({ id: taskId })) ?? task;
    yield* upsert(tasksTable, [
      {
        ...latest,
        durationMinutes: nextDuration,
        startsAt,
        timeBlockPinned: true,
      },
    ]);
    yield* packTaskDailyList(taskId);

    const updated = yield* taskById({ id: taskId });
    if (!updated) throw new Error("Task not found");
    return updated;
  },
});

export const setTaskTimeBlock = action({
  name: "setTaskTimeBlock",
  args: {
    id: v.string(),
    startsAt: v.optional(v.union(v.number(), v.null())),
    durationMinutes: v.optional(v.union(v.number(), v.null())),
  },
  handler: function* setTaskTimeBlock({
    id,
    startsAt,
    durationMinutes,
  }): Generator<unknown, Task, unknown> {
    if (typeof startsAt === "number") {
      return yield* placeTaskOnCalendar({
        taskId: id,
        startsAt,
        durationMinutes:
          typeof durationMinutes === "number" ? durationMinutes : undefined,
      });
    }

    const task = yield* taskById({ id });
    if (!task) throw new Error("Task not found");

    const next: Task = { ...task };

    if (startsAt === null) {
      delete next.startsAt;
      delete next.timeBlockPinned;
    }

    if (durationMinutes === null) {
      delete next.durationMinutes;
    } else if (typeof durationMinutes === "number" && durationMinutes > 0) {
      next.durationMinutes = durationMinutes;
    }

    yield* upsert(tasksTable, [next]);
    yield* packTaskDailyList(id);
    return (yield* taskById({ id })) ?? next;
  },
});
