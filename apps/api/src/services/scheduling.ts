import { asyncDispatch, selectAsync } from "@will-be-done/hyperdb";
import {
  dailyListByDate,
  dailyEntryByTaskId,
  dailyEntrySiblings,
  removeFromDailyList,
  scheduleTask as scheduleTaskAction,
  taskById,
} from "@will-be-done/slices/space";
import { getSpaceDatabase } from "./databaseAccess";
import { ResourceNotFoundError } from "./errors";
import { resolveCreatePosition, type Placement } from "./placement";
import { getTaskSchedule, toPublicTask, type PublicTask } from "./tasks";

export interface ScheduledTaskResponse {
  task: PublicTask;
  date: string;
  previousDate: string | null;
}

export async function scheduleTask({
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
}): Promise<ScheduledTaskResponse> {
  const db = await getSpaceDatabase(spaceId, userId);
  const task = await selectAsync(db, {
    selector: taskById,
    args: { id: taskId },
  });
  if (!task) throw new ResourceNotFoundError("Task");
  const previousDate = (await getTaskSchedule(db, taskId))?.date ?? null;

  const dailyList = await selectAsync(db, {
    selector: dailyListByDate,
    args: { date },
  });
  let position: ReturnType<typeof resolveCreatePosition>;
  if (placement.kind === "before" || placement.kind === "after") {
    const anchor = await selectAsync(db, {
      selector: dailyEntryByTaskId,
      args: { taskId: placement.anchorId },
    });
    if (!dailyList || !anchor || anchor.dailyListId !== dailyList.id) {
      position = resolveCreatePosition({ entities: [], placement });
    } else {
      const [before, after] = await selectAsync(db, {
        selector: dailyEntrySiblings,
        args: { taskId: anchor.taskId },
      });
      position =
        placement.kind === "before"
          ? [before ?? null, anchor]
          : [anchor, after ?? null];
    }
  } else {
    position = resolveCreatePosition({ entities: [], placement });
  }

  const entry = await asyncDispatch(
    db,
    scheduleTaskAction({
      taskId,
      date,
      position,
      ...(time === undefined ? {} : { time }),
    }),
  );

  return {
    task: toPublicTask(task, { date, time: entry?.time ?? null }),
    date,
    previousDate,
  };
}

export async function clearTaskSchedule({
  spaceId,
  taskId,
  userId,
}: {
  spaceId: string;
  taskId: string;
  userId: string;
}): Promise<string | null> {
  const db = await getSpaceDatabase(spaceId, userId);
  const task = await selectAsync(db, {
    selector: taskById,
    args: { id: taskId },
  });
  if (!task) throw new ResourceNotFoundError("Task");
  const previousDate = (await getTaskSchedule(db, taskId))?.date ?? null;

  await asyncDispatch(db, removeFromDailyList({ taskId }));
  return previousDate;
}
