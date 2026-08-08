import { asyncDispatch, selectAsync } from "@will-be-done/hyperdb";
import {
  addToStash,
  createTaskInStash,
  inboxProjectId,
  removeFromStash,
  stashEntryByTaskId,
  stashEntryPlacementNeighbors,
  stashTasksByState,
  taskById,
  type StashEntry,
} from "@will-be-done/slices/space";
import { getSpaceDatabase } from "./databaseAccess";
import {
  ConflictError,
  InvalidPlacementError,
  ResourceNotFoundError,
} from "./errors";
import { type Placement } from "./placement";
import {
  getTaskScheduledDates,
  getTaskScheduledDate,
  toPublicTask,
  type PublicTask,
  type PublicTaskNature,
  type PublicTaskState,
} from "./tasks";

type StashPosition =
  | "prepend"
  | "append"
  | [StashEntry | null, StashEntry | null];

async function resolveStashPosition({
  db,
  placement,
  movingTaskId,
}: {
  db: Awaited<ReturnType<typeof getSpaceDatabase>>;
  placement: Placement;
  movingTaskId?: string;
}): Promise<StashPosition> {
  if (placement.kind === "first") return "prepend";
  if (placement.kind === "last") return "append";

  const anchor = await selectAsync(db, {
    selector: stashEntryByTaskId,
    args: { taskId: placement.anchorId },
  });
  if (!anchor || anchor.taskId === movingTaskId) {
    throw new InvalidPlacementError(
      "Placement anchor must be a task in the destination stash",
    );
  }

  const [before, after] = await selectAsync(db, {
    selector: stashEntryPlacementNeighbors,
    args: {
      taskId: anchor.taskId,
      ...(movingTaskId === undefined ? {} : { excludeTaskId: movingTaskId }),
    },
  });
  return placement.kind === "before"
    ? [before ?? null, anchor]
    : [anchor, after ?? null];
}

export async function listStashTasks({
  spaceId,
  userId,
  state = "todo",
}: {
  spaceId: string;
  userId: string;
  state?: PublicTaskState;
}): Promise<PublicTask[]> {
  const db = await getSpaceDatabase(spaceId, userId);
  const tasks = await selectAsync(db, {
    selector: stashTasksByState,
    args: { state },
  });
  const scheduledDates = await getTaskScheduledDates(
    db,
    tasks.map((task) => task.id),
  );

  return tasks.map((task) =>
    toPublicTask(task, scheduledDates.get(task.id) ?? null),
  );
}

export async function putTaskInStash({
  spaceId,
  taskId,
  userId,
  placement,
}: {
  spaceId: string;
  taskId: string;
  userId: string;
  placement?: Placement;
}): Promise<PublicTask> {
  const db = await getSpaceDatabase(spaceId, userId);
  const task = await selectAsync(db, {
    selector: taskById,
    args: { id: taskId },
  });
  if (!task) throw new ResourceNotFoundError("Task");
  if (task.state === "done") {
    throw new ConflictError("Completed tasks cannot be added to the stash");
  }

  const existingEntry = await selectAsync(db, {
    selector: stashEntryByTaskId,
    args: { taskId },
  });
  if (existingEntry && placement === undefined) {
    return toPublicTask(task, await getTaskScheduledDate(db, task.id));
  }

  const position = await resolveStashPosition({
    db,
    placement: placement ?? { kind: "first" },
    movingTaskId: taskId,
  });

  await asyncDispatch(db, addToStash({ taskId, position }));
  return toPublicTask(task, await getTaskScheduledDate(db, task.id));
}

export async function removeTaskFromStash({
  spaceId,
  taskId,
  userId,
}: {
  spaceId: string;
  taskId: string;
  userId: string;
}): Promise<void> {
  const db = await getSpaceDatabase(spaceId, userId);
  const entry = await selectAsync(db, {
    selector: stashEntryByTaskId,
    args: { taskId },
  });
  if (!entry) throw new ResourceNotFoundError("Stash task");

  await asyncDispatch(db, removeFromStash({ taskId }));
}

export async function createStashTask({
  spaceId,
  userId,
  title,
  content,
  nature,
  placement = { kind: "first" },
}: {
  spaceId: string;
  userId: string;
  title: string;
  content?: string;
  nature?: PublicTaskNature;
  placement?: Placement;
}): Promise<PublicTask> {
  const db = await getSpaceDatabase(spaceId, userId);
  const position = await resolveStashPosition({ db, placement });
  const projectId = await selectAsync(db, {
    selector: inboxProjectId,
    args: {},
  });

  const task = await asyncDispatch(
    db,
    createTaskInStash({
      projectId,
      position,
      sectionPosition: "prepend",
      taskAttrs: {
        title,
        ...(content === undefined ? {} : { content }),
        ...(nature === undefined ? {} : { nature }),
      },
    }),
  );

  return toPublicTask(task, null);
}
