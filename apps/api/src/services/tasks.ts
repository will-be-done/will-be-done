import {
  asyncDispatch,
  createAction,
  selectAsync,
  upsert,
} from "@will-be-done/hyperdb";
import {
  createTaskInSection,
  dailyEntriesByIds,
  dailyEntryByTaskId,
  dailyListById,
  dailyListsByIds,
  deleteTaskById,
  taskById,
  tasksTable,
  updateTask as updateTaskAction,
  type Task,
} from "@will-be-done/slices/space";
import { getSpaceDatabase } from "./databaseAccess";
import { InvalidPlacementError, ResourceNotFoundError } from "./errors";
import {
  resolveCreatePosition,
  resolveOrderToken,
  type Placement,
} from "./placement";
import { itemsInSection, requireSection } from "./sectionQueries";

export type { Placement } from "./placement";

export type PublicTaskState = "todo" | "done";
export type PublicTaskNature = "red" | "green" | "unknown";

export interface PublicTask {
  type: "task";
  id: string;
  title: string;
  content?: string;
  state: PublicTaskState;
  projectSectionId: string;
  nature: PublicTaskNature;
  createdAt: number;
  lastToggledAt: number;
  scheduledDate: string | null;
}

type SpaceDatabase = Awaited<ReturnType<typeof getSpaceDatabase>>;

const action = createAction();
const replaceTask = action({
  name: "replaceApiTask",
  args: { task: tasksTable.v() },
  handler: function* ({ task }) {
    yield* upsert(tasksTable, [task]);
  },
});

export async function getTaskScheduledDate(
  db: SpaceDatabase,
  taskId: string,
  knownScheduledDate?: string | null,
): Promise<string | null> {
  if (knownScheduledDate !== undefined) return knownScheduledDate;

  const entry = await selectAsync(db, {
    selector: dailyEntryByTaskId,
    args: { taskId },
  });
  if (!entry) return null;

  const dailyList = await selectAsync(db, {
    selector: dailyListById,
    args: { id: entry.dailyListId },
  });
  return dailyList?.date ?? null;
}

export async function getTaskScheduledDates(
  db: SpaceDatabase,
  taskIds: string[],
): Promise<Map<string, string | null>> {
  if (taskIds.length === 0) return new Map();

  const entries = await selectAsync(db, {
    selector: dailyEntriesByIds,
    args: { ids: taskIds },
  });
  const dailyListIds = [...new Set(entries.map((entry) => entry.dailyListId))];
  const dailyLists = await selectAsync(db, {
    selector: dailyListsByIds,
    args: { ids: dailyListIds },
  });
  const dateByDailyListId = new Map(
    dailyLists.map((dailyList) => [dailyList.id, dailyList.date]),
  );
  const entryByTaskId = new Map(entries.map((entry) => [entry.id, entry]));

  return new Map(
    taskIds.map((taskId) => {
      const entry = entryByTaskId.get(taskId);
      return [
        taskId,
        entry ? (dateByDailyListId.get(entry.dailyListId) ?? null) : null,
      ];
    }),
  );
}

export function toPublicTask(
  task: Task,
  scheduledDate: string | null,
): PublicTask {
  return {
    type: "task",
    id: task.id,
    title: task.title,
    ...(task.content === undefined ? {} : { content: task.content }),
    state: task.state,
    projectSectionId: task.projectSectionId,
    nature: task.nature ?? "unknown",
    createdAt: task.createdAt,
    lastToggledAt: task.lastToggledAt,
    scheduledDate,
  };
}

export async function getTask({
  spaceId,
  taskId,
  userId,
}: {
  spaceId: string;
  taskId: string;
  userId: string;
}): Promise<PublicTask> {
  const db = await getSpaceDatabase(spaceId, userId);
  const task = await selectAsync(db, {
    selector: taskById,
    args: { id: taskId },
  });
  if (!task) throw new ResourceNotFoundError("Task");
  return toPublicTask(task, await getTaskScheduledDate(db, task.id));
}

export async function createSectionTask({
  spaceId,
  sectionId,
  userId,
  title,
  content,
  nature,
  placement = { kind: "last" },
}: {
  spaceId: string;
  sectionId: string;
  userId: string;
  title: string;
  content?: string;
  nature?: PublicTaskNature;
  placement?: Placement;
}): Promise<PublicTask> {
  const db = await getSpaceDatabase(spaceId, userId);
  await requireSection(db, sectionId);
  const position = resolveCreatePosition({
    entities:
      placement.kind === "before" || placement.kind === "after"
        ? await itemsInSection(db, sectionId)
        : [],
    placement,
  });

  const task = await asyncDispatch(
    db,
    createTaskInSection({
      projectSectionId: sectionId,
      position,
      taskAttrs: {
        title,
        ...(content === undefined ? {} : { content }),
        ...(nature === undefined ? {} : { nature }),
      },
    }),
  );
  return toPublicTask(task, null);
}

export async function updateTask({
  spaceId,
  taskId,
  userId,
  updates,
}: {
  spaceId: string;
  taskId: string;
  userId: string;
  updates: {
    title?: string;
    content?: string | null;
    state?: PublicTaskState;
    nature?: PublicTaskNature | null;
  };
}): Promise<PublicTask> {
  const db = await getSpaceDatabase(spaceId, userId);
  const current = await selectAsync(db, {
    selector: taskById,
    args: { id: taskId },
  });
  if (!current) throw new ResourceNotFoundError("Task");

  const next: Task = {
    ...current,
    ...(updates.title === undefined ? {} : { title: updates.title }),
    ...(typeof updates.content === "string"
      ? { content: updates.content }
      : {}),
    ...(typeof updates.nature === "string" ? { nature: updates.nature } : {}),
    ...(updates.state === undefined ? {} : { state: updates.state }),
    ...(updates.state !== undefined && updates.state !== current.state
      ? { lastToggledAt: Date.now() }
      : {}),
  };
  if (updates.content === null) delete next.content;
  if (updates.nature === null) delete next.nature;

  await asyncDispatch(db, replaceTask({ task: next }));

  return toPublicTask(next, await getTaskScheduledDate(db, taskId));
}

export async function moveTask({
  spaceId,
  taskId,
  userId,
  projectSectionId,
  placement,
}: {
  spaceId: string;
  taskId: string;
  userId: string;
  projectSectionId: string;
  placement: Placement;
}): Promise<PublicTask> {
  const db = await getSpaceDatabase(spaceId, userId);
  const current = await selectAsync(db, {
    selector: taskById,
    args: { id: taskId },
  });
  if (!current) throw new ResourceNotFoundError("Task");
  if (current.state === "done") {
    throw new InvalidPlacementError("Completed tasks cannot be moved");
  }
  await requireSection(db, projectSectionId);

  await asyncDispatch(
    db,
    updateTaskAction({
      id: taskId,
      task: {
        projectSectionId,
        orderToken: resolveOrderToken({
          entities: await itemsInSection(db, projectSectionId, taskId),
          placement,
        }),
      },
    }),
  );
  return getTask({ spaceId, taskId, userId });
}

export async function deleteTask({
  spaceId,
  taskId,
  userId,
}: {
  spaceId: string;
  taskId: string;
  userId: string;
}): Promise<void> {
  const db = await getSpaceDatabase(spaceId, userId);
  const task = await selectAsync(db, {
    selector: taskById,
    args: { id: taskId },
  });
  if (!task) throw new ResourceNotFoundError("Task");
  await asyncDispatch(db, deleteTaskById({ id: taskId }));
}
