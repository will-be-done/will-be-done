import { upsert, v, type HyperDB } from "@will-be-done/hyperdb";
import { Clock, Effect } from "effect";
import { action } from "../builders";
import {
  createTaskInSection,
  dailyEntriesByTaskIds,
  dailyEntryByTaskId,
  dailyListById,
  dailyListsByIds,
  trashTasks,
  setDailyEntryTime,
  syncItemRichText,
  taskById,
  tasksTable,
  updateTask as updateTaskAction,
  type Task,
} from "@will-be-done/slices/space";
import { getSpaceDatabase } from "./databaseAccess";
import { ConflictError, ResourceNotFoundError } from "./errors";
import { dispatch, select } from "./hyperdb";
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

export const getTaskSchedule = Effect.fnUntraced(function* (
  db: HyperDB,
  taskId: string,
) {
  const entry = yield* select(db, {
    selector: dailyEntryByTaskId,
    args: { taskId },
  });
  if (!entry) return null;

  const dailyList = yield* select(db, {
    selector: dailyListById,
    args: { id: entry.dailyListId },
  });
  return dailyList ? { date: dailyList.date, time: entry.time ?? null } : null;
});

export const getTaskSchedules = Effect.fnUntraced(function* (
  db: HyperDB,
  taskIds: string[],
): Effect.fn.Return<Map<string, TaskSchedule | null>> {
  if (taskIds.length === 0) return new Map();

  const entries = yield* select(db, {
    selector: dailyEntriesByTaskIds,
    args: { taskIds },
  });
  const dailyListIds = [...new Set(entries.map((entry) => entry.dailyListId))];
  const dailyLists = yield* select(db, {
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
});

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

export const requireTask = Effect.fnUntraced(function* (
  db: HyperDB,
  taskId: string,
) {
  const task = yield* select(db, { selector: taskById, args: { id: taskId } });
  if (!task) return yield* new ResourceNotFoundError({ resource: "Task" });
  return task;
});

export const getTask = Effect.fn("getTask")(function* ({
  spaceId,
  taskId,
  userId,
}: {
  spaceId: string;
  taskId: string;
  userId: string;
}) {
  const db = yield* getSpaceDatabase(spaceId, userId);
  const task = yield* requireTask(db, taskId);
  return toPublicTask(task, yield* getTaskSchedule(db, task.id));
});

export const createSectionTask = Effect.fn("createSectionTask")(function* ({
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
}) {
  const db = yield* getSpaceDatabase(spaceId, userId);
  yield* requireSection(db, sectionId);
  const position = yield* resolveCreatePosition({
    entities:
      placement.kind === "before" || placement.kind === "after"
        ? yield* itemsInSection(db, sectionId)
        : [],
    placement,
  });

  const task = yield* dispatch(
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
});

export const updateTask = Effect.fn("updateTask")(function* ({
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
}) {
  const db = yield* getSpaceDatabase(spaceId, userId);
  const current = yield* requireTask(db, taskId);
  if (
    updates.scheduledTime !== undefined &&
    !(yield* getTaskSchedule(db, taskId))
  ) {
    return yield* new ConflictError({
      message: "Unscheduled tasks cannot have a time",
    });
  }

  const proposed: Task = {
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
      ? { lastToggledAt: yield* Clock.currentTimeMillis }
      : {}),
  };
  if (updates.content === null) delete proposed.content;
  if (updates.nature === null) delete proposed.nature;
  const next = syncItemRichText(current, proposed);

  yield* dispatch(
    db,
    replaceTask({ task: next, scheduledTime: updates.scheduledTime }),
  );

  return toPublicTask(next, yield* getTaskSchedule(db, taskId));
});

export const moveTask = Effect.fn("moveTask")(function* ({
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
}) {
  const db = yield* getSpaceDatabase(spaceId, userId);
  const current = yield* requireTask(db, taskId);
  if (current.state === "done") {
    return yield* new ConflictError({
      message: "Completed tasks cannot be moved",
    });
  }
  yield* requireSection(db, projectSectionId);

  yield* dispatch(
    db,
    updateTaskAction({
      id: taskId,
      task: {
        projectSectionId,
        orderToken: yield* resolveOrderToken({
          entities: yield* itemsInSection(db, projectSectionId, taskId),
          placement,
        }),
      },
    }),
  );
  return yield* getTask({ spaceId, taskId, userId });
});

export const deleteTask = Effect.fn("deleteTask")(function* ({
  spaceId,
  taskId,
  userId,
}: {
  spaceId: string;
  taskId: string;
  userId: string;
}) {
  const db = yield* getSpaceDatabase(spaceId, userId);
  const task = yield* requireTask(db, taskId);
  yield* dispatch(db, trashTasks({ ids: [taskId] }));
  return task;
});
