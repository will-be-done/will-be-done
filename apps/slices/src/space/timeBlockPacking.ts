import { parse } from "date-fns";
import { selectFrom, upsert, v } from "@will-be-done/hyperdb";
import { action } from "../builders";
import {
  type MinuteInterval,
  normalizeWorkday,
  spacePreferences,
} from "./spacePreferences";
import {
  DailyEntry,
  DailyList,
  Task,
  dailyEntriesTable,
  dailyListsTable,
  tasksTable,
} from "./tables";
import { dailyDateFormat } from "./utils";

export function startsAtFromDateAndMinutes(
  date: string,
  minutesOfDay: number,
): number {
  const parsed = parse(date, dailyDateFormat, new Date());
  parsed.setHours(0, 0, 0, 0);
  return parsed.getTime() + minutesOfDay * 60 * 1000;
}

export function minutesFromTimestamp(timestamp: number): number {
  const date = new Date(timestamp);
  return date.getHours() * 60 + date.getMinutes();
}

export function workWindows(
  startMinutes: number,
  endMinutes: number,
  breaks: MinuteInterval[],
): MinuteInterval[] {
  const windows: MinuteInterval[] = [];
  let cursor = startMinutes;
  for (const item of [...breaks].sort(
    (a, b) => a.startMinutes - b.startMinutes,
  )) {
    if (item.startMinutes > cursor) {
      windows.push({
        startMinutes: cursor,
        endMinutes: Math.min(item.startMinutes, endMinutes),
      });
    }
    cursor = Math.max(cursor, item.endMinutes);
  }
  if (cursor < endMinutes) {
    windows.push({ startMinutes: cursor, endMinutes });
  }
  return windows.filter((window) => window.endMinutes > window.startMinutes);
}

export function subtractOccupied(
  windows: MinuteInterval[],
  occupied: MinuteInterval[],
): MinuteInterval[] {
  let next = windows;
  for (const item of occupied) {
    next = next.flatMap((window) => splitWindow(window, item));
  }
  return next.filter((window) => window.endMinutes > window.startMinutes);
}

function splitWindow(
  window: MinuteInterval,
  occupied: MinuteInterval,
): MinuteInterval[] {
  const overlapStart = Math.max(window.startMinutes, occupied.startMinutes);
  const overlapEnd = Math.min(window.endMinutes, occupied.endMinutes);
  if (overlapStart >= overlapEnd) return [window];

  const parts: MinuteInterval[] = [];
  if (window.startMinutes < overlapStart) {
    parts.push({
      startMinutes: window.startMinutes,
      endMinutes: overlapStart,
    });
  }
  if (overlapEnd < window.endMinutes) {
    parts.push({
      startMinutes: overlapEnd,
      endMinutes: window.endMinutes,
    });
  }
  return parts;
}

export function placeDuration(
  windows: MinuteInterval[],
  durationMinutes: number,
  fallbackStartMinutes = 0,
): { startMinutes: number; windows: MinuteInterval[] } {
  const index = windows.findIndex(
    (window) => window.endMinutes - window.startMinutes >= durationMinutes,
  );
  const startMinutes =
    index >= 0
      ? windows[index].startMinutes
      : (windows[0]?.startMinutes ?? fallbackStartMinutes);
  return {
    startMinutes,
    windows: subtractOccupied(windows, [
      { startMinutes, endMinutes: startMinutes + durationMinutes },
    ]),
  };
}

function withDuration(task: Task): task is Task & { durationMinutes: number } {
  return task.durationMinutes != null && task.durationMinutes > 0;
}

function isFrozenTimeBlock(task: Task): boolean {
  return task.timeBlockPinned === true || task.state === "done";
}

export const packDailyListTimeBlocks = action({
  name: "packDailyListTimeBlocks",
  args: { dailyListId: v.string() },
  handler: function* packDailyListTimeBlocks({
    dailyListId,
  }): Generator<unknown, void, unknown> {
    const lists = yield* selectFrom(dailyListsTable, "byId")
      .where((q) => q.eq("id", dailyListId))
      .limit(1);
    const list = lists[0] as DailyList | undefined;
    if (!list) return;

    const entries = (yield* selectFrom(
      dailyEntriesTable,
      "byDailyListIdTokenOrdered",
    ).where((q) => q.eq("dailyListId", dailyListId))) as DailyEntry[];
    if (entries.length === 0) return;

    const tasks = (yield* selectFrom(tasksTable, "byId").where((q) =>
      entries.map((entry) => q.eq("id", entry.taskId)),
    )) as Task[];
    const taskById = new Map(tasks.map((task) => [task.id, task]));
    const workday = normalizeWorkday(yield* spacePreferences({}));

    let windows = workWindows(
      workday.dayStartMinutes,
      workday.dayEndMinutes,
      workday.breaks,
    );
    const occupied: MinuteInterval[] = [];
    for (const entry of entries) {
      const task = taskById.get(entry.taskId);
      if (!task || !withDuration(task) || !isFrozenTimeBlock(task)) continue;
      if (task.startsAt == null) continue;
      const startMinutes = minutesFromTimestamp(task.startsAt);
      occupied.push({
        startMinutes,
        endMinutes: startMinutes + task.durationMinutes,
      });
    }
    windows = subtractOccupied(windows, occupied);

    const updates: Task[] = [];
    for (const entry of entries) {
      const task = taskById.get(entry.taskId);
      if (!task) continue;

      if (!withDuration(task)) {
        if (task.startsAt != null || task.timeBlockPinned) {
          const next = { ...task };
          delete next.startsAt;
          delete next.timeBlockPinned;
          updates.push(next);
        }
        continue;
      }

      if (isFrozenTimeBlock(task) && task.startsAt != null) continue;

      const placed = placeDuration(
        windows,
        task.durationMinutes,
        workday.dayStartMinutes,
      );
      windows = placed.windows;
      const startsAt = startsAtFromDateAndMinutes(
        list.date,
        placed.startMinutes,
      );
      if (task.startsAt !== startsAt || task.timeBlockPinned) {
        const next = { ...task, startsAt };
        delete next.timeBlockPinned;
        updates.push(next);
      }
    }

    if (updates.length > 0) {
      yield* upsert(tasksTable, updates);
    }
  },
});

export const packAllDailyListTimeBlocks = action({
  name: "packAllDailyListTimeBlocks",
  args: {},
  handler: function* packAllDailyListTimeBlocks(): Generator<
    unknown,
    void,
    unknown
  > {
    const lists = (yield* selectFrom(dailyListsTable, "byIds").where(
      (q) => q,
    )) as DailyList[];
    for (const list of lists) {
      yield* packDailyListTimeBlocks({ dailyListId: list.id });
    }
  },
});
