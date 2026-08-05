import { selectSync, syncDispatch } from "@will-be-done/hyperdb";
import {
  addToStash,
  allStashEntriesOrdered,
  createTaskInStash,
  inboxProjectId,
  removeFromStash,
  stashEntryById,
  stashTasksByState,
  taskById,
} from "@will-be-done/slices/space";
import { getSpaceDatabase } from "./databaseAccess";
import { ConflictError, ResourceNotFoundError } from "./errors";
import { resolveCreatePosition, type Placement } from "./placement";
import {
  getTaskScheduledDates,
  toPublicTask,
  type PublicTask,
  type PublicTaskNature,
  type PublicTaskState,
} from "./tasks";

export function listStashTasks({
  spaceId,
  userId,
  state = "todo",
}: {
  spaceId: string;
  userId: string;
  state?: PublicTaskState;
}): PublicTask[] {
  const db = getSpaceDatabase(spaceId, userId);
  const tasks = selectSync(db, {
    selector: stashTasksByState,
    args: { state },
  });
  const scheduledDates = getTaskScheduledDates(
    db,
    tasks.map((task) => task.id),
  );

  return tasks.map((task) =>
    toPublicTask(db, task, scheduledDates.get(task.id) ?? null),
  );
}

export function putTaskInStash({
  spaceId,
  taskId,
  userId,
  placement,
}: {
  spaceId: string;
  taskId: string;
  userId: string;
  placement?: Placement;
}): PublicTask {
  const db = getSpaceDatabase(spaceId, userId);
  const task = selectSync(db, { selector: taskById, args: { id: taskId } });
  if (!task) throw new ResourceNotFoundError("Task");
  if (task.state === "done") {
    throw new ConflictError("Completed tasks cannot be added to the stash");
  }

  const existingEntry = selectSync(db, {
    selector: stashEntryById,
    args: { id: taskId },
  });
  if (existingEntry && placement === undefined) {
    return toPublicTask(db, task);
  }

  const entries = selectSync(db, {
    selector: allStashEntriesOrdered,
    args: {},
  }).filter((entry) => entry.id !== taskId);
  const position = resolveCreatePosition({
    entities: entries,
    placement: placement ?? { kind: "first" },
  });

  syncDispatch(db, addToStash({ taskId, position }));
  return toPublicTask(db, task);
}

export function removeTaskFromStash({
  spaceId,
  taskId,
  userId,
}: {
  spaceId: string;
  taskId: string;
  userId: string;
}): void {
  const db = getSpaceDatabase(spaceId, userId);
  const entry = selectSync(db, {
    selector: stashEntryById,
    args: { id: taskId },
  });
  if (!entry) throw new ResourceNotFoundError("Stash task");

  syncDispatch(db, removeFromStash({ taskId }));
}

export function createStashTask({
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
}): PublicTask {
  const db = getSpaceDatabase(spaceId, userId);
  const entries = selectSync(db, {
    selector: allStashEntriesOrdered,
    args: {},
  });
  const position = resolveCreatePosition({ entities: entries, placement });
  const projectId = selectSync(db, { selector: inboxProjectId, args: {} });

  const task = syncDispatch(
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

  return toPublicTask(db, task, null);
}
