import { asyncDispatch, selectAsync } from "@will-be-done/hyperdb";
import {
  addToStash,
  allStashEntriesOrdered,
  createTaskInStash,
  inboxProjectId,
  removeFromStash,
  stashEntryByTaskId,
  stashTasksByState,
  taskById,
} from "@will-be-done/slices/space";
import { getSpaceDatabase } from "./databaseAccess";
import { ConflictError, ResourceNotFoundError } from "./errors";
import { resolveCreatePosition, type Placement } from "./placement";
import {
  getTaskScheduledDates,
  getTaskScheduledDate,
  toPublicTask,
  type PublicTask,
  type PublicTaskNature,
  type PublicTaskState,
} from "./tasks";

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

  const entries = (
    await selectAsync(db, {
      selector: allStashEntriesOrdered,
      args: {},
    })
  ).filter((entry) => entry.taskId !== taskId);
  const position = resolveCreatePosition({
    entities: entries,
    placement: placement ?? { kind: "first" },
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
  const entries = await selectAsync(db, {
    selector: allStashEntriesOrdered,
    args: {},
  });
  const position = resolveCreatePosition({ entities: entries, placement });
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
