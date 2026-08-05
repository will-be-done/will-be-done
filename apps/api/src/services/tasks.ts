import {
  createAction,
  selectSync,
  syncDispatch,
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

type SpaceDatabase = ReturnType<typeof getSpaceDatabase>;

const action = createAction();
const replaceTask = action({
  name: "replaceApiTask",
  args: { task: tasksTable.v() },
  handler: function* ({ task }) {
    yield* upsert(tasksTable, [task]);
  },
});

export function getTaskScheduledDate(
  db: SpaceDatabase,
  taskId: string,
  knownScheduledDate?: string | null,
): string | null {
  if (knownScheduledDate !== undefined) return knownScheduledDate;

  const entry = selectSync(db, {
    selector: dailyEntryByTaskId,
    args: { taskId },
  });
  if (!entry) return null;

  const dailyList = selectSync(db, {
    selector: dailyListById,
    args: { id: entry.dailyListId },
  });
  return dailyList?.date ?? null;
}

export function getTaskScheduledDates(
  db: SpaceDatabase,
  taskIds: string[],
): Map<string, string | null> {
  if (taskIds.length === 0) return new Map();

  const entries = selectSync(db, {
    selector: dailyEntriesByIds,
    args: { ids: taskIds },
  });
  const dailyListIds = [...new Set(entries.map((entry) => entry.dailyListId))];
  const dailyLists = selectSync(db, {
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
  db: SpaceDatabase,
  task: Task,
  knownScheduledDate?: string | null,
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
    scheduledDate: getTaskScheduledDate(db, task.id, knownScheduledDate),
  };
}

export function getTask({
  spaceId,
  taskId,
  userId,
}: {
  spaceId: string;
  taskId: string;
  userId: string;
}): PublicTask {
  const db = getSpaceDatabase(spaceId, userId);
  const task = selectSync(db, { selector: taskById, args: { id: taskId } });
  if (!task) throw new ResourceNotFoundError("Task");
  return toPublicTask(db, task);
}

export function createSectionTask({
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
}): PublicTask {
  const db = getSpaceDatabase(spaceId, userId);
  requireSection(db, sectionId);
  const position = resolveCreatePosition({
    entities:
      placement.kind === "before" || placement.kind === "after"
        ? itemsInSection(db, sectionId)
        : [],
    placement,
  });

  const task = syncDispatch(
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
  return toPublicTask(db, task);
}

export function updateTask({
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
}): PublicTask {
  const db = getSpaceDatabase(spaceId, userId);
  const current = selectSync(db, { selector: taskById, args: { id: taskId } });
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

  syncDispatch(db, replaceTask({ task: next }));

  return getTask({ spaceId, taskId, userId });
}

export function moveTask({
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
}): PublicTask {
  const db = getSpaceDatabase(spaceId, userId);
  const current = selectSync(db, { selector: taskById, args: { id: taskId } });
  if (!current) throw new ResourceNotFoundError("Task");
  if (current.state === "done") {
    throw new InvalidPlacementError("Completed tasks cannot be moved");
  }
  requireSection(db, projectSectionId);

  syncDispatch(
    db,
    updateTaskAction({
      id: taskId,
      task: {
        projectSectionId,
        orderToken: resolveOrderToken({
          entities: itemsInSection(db, projectSectionId, taskId),
          placement,
        }),
      },
    }),
  );
  return getTask({ spaceId, taskId, userId });
}

export function deleteTask({
  spaceId,
  taskId,
  userId,
}: {
  spaceId: string;
  taskId: string;
  userId: string;
}): void {
  const db = getSpaceDatabase(spaceId, userId);
  const task = selectSync(db, { selector: taskById, args: { id: taskId } });
  if (!task) throw new ResourceNotFoundError("Task");
  syncDispatch(db, deleteTaskById({ id: taskId }));
}
