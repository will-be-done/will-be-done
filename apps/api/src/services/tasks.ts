import {
  asyncDispatch,
  createAction,
  selectAsync,
  upsert,
  v,
} from "@will-be-done/hyperdb";
import {
  createTaskInSection,
  dailyEntriesByTaskIds,
  dailyEntryByTaskId,
  dailyListById,
  dailyListsByIds,
  trashTasks,
  setDailyEntryTime,
  taskById,
  tasksTable,
  updateTask as updateTaskAction,
  type Task,
} from "@will-be-done/slices/space";
import { getSpaceDatabase } from "./databaseAccess";
import {
  ConflictError,
  InvalidPlacementError,
  ResourceNotFoundError,
} from "./errors";
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
  scheduledTime: string | null;
  durationMinutes: number | null;
}

export interface TaskSchedule {
  date: string;
  time: string | null;
}

type SpaceDatabase = Awaited<ReturnType<typeof getSpaceDatabase>>;

const action = createAction();
const replaceTask = action({
  name: "replaceApiTask",
  args: {
    task: tasksTable.v(),
    scheduledTime: v.optional(v.union(v.string(), v.null())),
  },
  handler: function* ({ task, scheduledTime }) {
    yield* upsert(tasksTable, [task]);
    if (scheduledTime !== undefined) {
      yield* setDailyEntryTime({ taskId: task.id, time: scheduledTime });
    }
  },
});

export async function getTaskSchedule(
  db: SpaceDatabase,
  taskId: string,
): Promise<TaskSchedule | null> {
  const entry = await selectAsync(db, {
    selector: dailyEntryByTaskId,
    args: { taskId },
  });
  if (!entry) return null;

  const dailyList = await selectAsync(db, {
    selector: dailyListById,
    args: { id: entry.dailyListId },
  });
  return dailyList ? { date: dailyList.date, time: entry.time ?? null } : null;
}

export async function getTaskSchedules(
  db: SpaceDatabase,
  taskIds: string[],
): Promise<Map<string, TaskSchedule | null>> {
  if (taskIds.length === 0) return new Map();

  const entries = await selectAsync(db, {
    selector: dailyEntriesByTaskIds,
    args: { taskIds },
  });
  const dailyListIds = [...new Set(entries.map((entry) => entry.dailyListId))];
  const dailyLists = await selectAsync(db, {
    selector: dailyListsByIds,
    args: { ids: dailyListIds },
  });
  const dateByDailyListId = new Map(
    dailyLists.map((dailyList) => [dailyList.id, dailyList.date]),
  );
  const entryByTaskId = new Map(entries.map((entry) => [entry.taskId, entry]));

  return new Map(
    taskIds.map((taskId) => {
      const entry = entryByTaskId.get(taskId);
      const date = entry ? dateByDailyListId.get(entry.dailyListId) : undefined;
      return [
        taskId,
        entry && date ? { date, time: entry.time ?? null } : null,
      ];
    }),
  );
}

export function toPublicTask(
  task: Task,
  schedule: TaskSchedule | null,
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
    scheduledDate: schedule?.date ?? null,
    scheduledTime: schedule?.time ?? null,
    durationMinutes: task.durationMinutes ?? null,
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
  return toPublicTask(task, await getTaskSchedule(db, task.id));
}

export async function createSectionTask({
  spaceId,
  sectionId,
  userId,
  title,
  content,
  nature,
  durationMinutes,
  placement = { kind: "last" },
}: {
  spaceId: string;
  sectionId: string;
  userId: string;
  title: string;
  content?: string;
  nature?: PublicTaskNature;
  durationMinutes?: number;
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
        ...(durationMinutes === undefined ? {} : { durationMinutes }),
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
    scheduledTime?: string | null;
    durationMinutes?: number | null;
  };
}): Promise<PublicTask> {
  const db = await getSpaceDatabase(spaceId, userId);
  const current = await selectAsync(db, {
    selector: taskById,
    args: { id: taskId },
  });
  if (!current) throw new ResourceNotFoundError("Task");
  if (
    updates.scheduledTime !== undefined &&
    !(await getTaskSchedule(db, taskId))
  ) {
    throw new ConflictError("Unscheduled tasks cannot have a time");
  }

  const next: Task = {
    ...current,
    ...(updates.title === undefined ? {} : { title: updates.title }),
    ...(typeof updates.content === "string"
      ? { content: updates.content }
      : {}),
    ...(typeof updates.nature === "string" ? { nature: updates.nature } : {}),
    ...(updates.state === undefined ? {} : { state: updates.state }),
    ...(updates.durationMinutes === undefined
      ? {}
      : { durationMinutes: updates.durationMinutes }),
    ...(updates.state !== undefined && updates.state !== current.state
      ? { lastToggledAt: Date.now() }
      : {}),
  };
  if (updates.content === null) delete next.content;
  if (updates.nature === null) delete next.nature;

  await asyncDispatch(
    db,
    replaceTask({ task: next, scheduledTime: updates.scheduledTime }),
  );

  return toPublicTask(next, await getTaskSchedule(db, taskId));
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
}): Promise<Task> {
  const db = await getSpaceDatabase(spaceId, userId);
  const task = await selectAsync(db, {
    selector: taskById,
    args: { id: taskId },
  });
  if (!task) throw new ResourceNotFoundError("Task");
  await asyncDispatch(db, trashTasks({ ids: [taskId] }));
  return task;
}
