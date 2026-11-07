import { Effect } from "effect";
import {
  dailyListByDate,
  dailyEntryByTaskId,
  dailyEntrySiblings,
  removeFromDailyList,
  scheduleTask as scheduleTaskAction,
} from "@will-be-done/slices/space";
import { getSpaceDatabase } from "./databaseAccess";
import { dispatch, select } from "./hyperdb";
import { resolveCreatePosition, type Placement } from "./placement";
import {
  getTaskSchedule,
  requireTask,
  toPublicTask,
  type PublicTask,
} from "./tasks";

export interface ScheduledTaskResponse {
  task: PublicTask;
  date: string;
  previousDate: string | null;
}

export const scheduleTask = Effect.fn("scheduleTask")(function* ({
  spaceId,
  taskId,
  userId,
  date,
  time,
  placement = { kind: "last" },
}: {
  spaceId: string;
  taskId: string;
  userId: string;
  date: string;
  time?: string | null;
  placement?: Placement;
}) {
  const db = yield* getSpaceDatabase(spaceId, userId);
  const task = yield* requireTask(db, taskId);
  const previousDate = (yield* getTaskSchedule(db, taskId))?.date ?? null;

  const dailyList = yield* select(db, {
    selector: dailyListByDate,
    args: { date },
  });
  const anchor =
    placement.kind === "before" || placement.kind === "after"
      ? yield* select(db, {
          selector: dailyEntryByTaskId,
          args: { taskId: placement.anchorId },
        })
      : undefined;
  let position: Parameters<typeof scheduleTaskAction>[0]["position"];
  if (anchor && dailyList && anchor.dailyListId === dailyList.id) {
    const [before, after] = yield* select(db, {
      selector: dailyEntrySiblings,
      args: { taskId: anchor.taskId },
    });
    position =
      placement.kind === "before"
        ? [before ?? null, anchor]
        : [anchor, after ?? null];
  } else {
    position = yield* resolveCreatePosition({ entities: [], placement });
  }

  const entry = yield* dispatch(
    db,
    scheduleTaskAction({
      taskId,
      date,
      position,
      ...(time === undefined ? {} : { time }),
    }),
  );

  const response: ScheduledTaskResponse = {
    task: toPublicTask(task, { date, time: entry?.time ?? null }),
    date,
    previousDate,
  };
  return response;
});

export const clearTaskSchedule = Effect.fn("clearTaskSchedule")(function* ({
  spaceId,
  taskId,
  userId,
}: {
  spaceId: string;
  taskId: string;
  userId: string;
}) {
  const db = yield* getSpaceDatabase(spaceId, userId);
  yield* requireTask(db, taskId);
  const previousDate = (yield* getTaskSchedule(db, taskId))?.date ?? null;

  yield* dispatch(db, removeFromDailyList({ taskId }));
  return previousDate;
});
