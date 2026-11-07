import type { HyperDB } from "@will-be-done/hyperdb";
import { Effect } from "effect";
import {
  addToStash,
  createTaskInStash,
  inboxProjectId,
  removeFromStash,
  stashEntryByTaskId,
  stashEntryPlacementNeighbors,
  stashTasksByState,
  type StashEntry,
} from "@will-be-done/slices/space";
import { getSpaceDatabase } from "./databaseAccess";
import { ConflictError, ResourceNotFoundError } from "./errors";
import { dispatch, select } from "./hyperdb";
import { type Placement } from "./placement";
import {
  getTaskSchedules,
  getTaskSchedule,
  requireTask,
  toPublicTask,
  type PublicTaskNature,
  type PublicTaskState,
} from "./tasks";

const resolveStashPosition = Effect.fnUntraced(function* ({
  db,
  placement,
  movingTaskId,
}: {
  db: HyperDB;
  placement: Placement;
  movingTaskId?: string;
}): Effect.fn.Return<
  "prepend" | "append" | [StashEntry | null, StashEntry | null],
  ConflictError
> {
  if (placement.kind === "first") return "prepend";
  if (placement.kind === "last") return "append";

  const anchor = yield* select(db, {
    selector: stashEntryByTaskId,
    args: { taskId: placement.anchorId },
  });
  if (!anchor || anchor.taskId === movingTaskId) {
    return yield* new ConflictError({
      message: "Placement anchor must be a task in the destination stash",
    });
  }

  const [before, after] = yield* select(db, {
    selector: stashEntryPlacementNeighbors,
    args: {
      taskId: anchor.taskId,
      ...(movingTaskId === undefined ? {} : { excludeTaskId: movingTaskId }),
    },
  });
  return placement.kind === "before"
    ? [before ?? null, anchor]
    : [anchor, after ?? null];
});

export const listStashTasks = Effect.fn("listStashTasks")(function* ({
  spaceId,
  userId,
  state = "todo",
}: {
  spaceId: string;
  userId: string;
  state?: PublicTaskState;
}) {
  const db = yield* getSpaceDatabase(spaceId, userId);
  const tasks = yield* select(db, {
    selector: stashTasksByState,
    args: { state },
  });
  const schedules = yield* getTaskSchedules(
    db,
    tasks.map((task) => task.id),
  );

  return tasks.map((task) =>
    toPublicTask(task, schedules.get(task.id) ?? null),
  );
});

export const putTaskInStash = Effect.fn("putTaskInStash")(function* ({
  spaceId,
  taskId,
  userId,
  placement,
}: {
  spaceId: string;
  taskId: string;
  userId: string;
  placement?: Placement;
}) {
  const db = yield* getSpaceDatabase(spaceId, userId);
  const task = yield* requireTask(db, taskId);
  if (task.state === "done") {
    return yield* new ConflictError({
      message: "Completed tasks cannot be added to the stash",
    });
  }

  const existingEntry = yield* select(db, {
    selector: stashEntryByTaskId,
    args: { taskId },
  });
  if (!existingEntry || placement !== undefined) {
    const position = yield* resolveStashPosition({
      db,
      placement: placement ?? { kind: "first" },
      movingTaskId: taskId,
    });
    yield* dispatch(db, addToStash({ taskId, position }));
  }

  return toPublicTask(task, yield* getTaskSchedule(db, task.id));
});

export const removeTaskFromStash = Effect.fn("removeTaskFromStash")(function* ({
  spaceId,
  taskId,
  userId,
}: {
  spaceId: string;
  taskId: string;
  userId: string;
}) {
  const db = yield* getSpaceDatabase(spaceId, userId);
  const entry = yield* select(db, {
    selector: stashEntryByTaskId,
    args: { taskId },
  });
  if (!entry) {
    return yield* new ResourceNotFoundError({ resource: "Stash task" });
  }

  yield* dispatch(db, removeFromStash({ taskId }));
});

export const createStashTask = Effect.fn("createStashTask")(function* ({
  spaceId,
  userId,
  title,
  content,
  nature,
  durationMinutes,
  placement = { kind: "first" },
}: {
  spaceId: string;
  userId: string;
  title: string;
  content?: string;
  nature?: PublicTaskNature;
  durationMinutes?: number;
  placement?: Placement;
}) {
  const db = yield* getSpaceDatabase(spaceId, userId);
  const position = yield* resolveStashPosition({ db, placement });
  const projectId = yield* select(db, { selector: inboxProjectId, args: {} });

  const task = yield* dispatch(
    db,
    createTaskInStash({
      projectId,
      position,
      sectionPosition: "prepend",
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
