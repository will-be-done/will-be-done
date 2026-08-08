import {
  deleteRows,
  selectFrom,
  type SubscribableDB,
  upsert,
  v,
} from "@will-be-done/hyperdb";
import { action, selector } from "../builders";
import {
  type ProjectSection,
  type ProjectSectionTaskStats,
  type Project,
  type ScheduledTodoTask,
  type Task,
  type DailyEntry,
  type DailyList,
  dailyListsTable,
  projectSectionsTable,
  projectSectionTaskStatsTable,
  projectsTable,
  scheduledTodoTasksTable,
  spaceMigrationsTable,
  dailyEntriesTable,
  tasksTable,
} from "./tables";
import { projectSectionsByProjectId } from "./projectSections";
import { tasksByIds } from "./tasks";
import { dailyDateFormat } from "./utils";
import { parse } from "date-fns";

const projectSectionTaskStatsMigrationId = "project-section-task-stats-v1";
const scheduledTodoTasksMigrationId = "scheduled-todo-tasks-project-section-v1";

const emptyProjectSectionTaskStats = (id: string): ProjectSectionTaskStats => ({
  id,
  total: 0,
  todo: 0,
  done: 0,
});

function applyTaskDelta(
  stats: ProjectSectionTaskStats,
  task: Task,
  delta: 1 | -1,
): ProjectSectionTaskStats {
  return {
    ...stats,
    total: stats.total + delta,
    [task.state]: stats[task.state] + delta,
  };
}

function normalizeProjectSectionTaskStats(
  stats: ProjectSectionTaskStats,
): ProjectSectionTaskStats {
  return {
    ...stats,
    total: Math.max(0, stats.total),
    todo: Math.max(0, stats.todo),
    done: Math.max(0, stats.done),
  };
}

function getScheduledAt(dailyList: DailyList): number {
  return parse(dailyList.date, dailyDateFormat, new Date()).getTime();
}

function* refreshScheduledTodoTasks(
  taskIds: Iterable<string>,
): Generator<unknown, void, unknown> {
  const uniqueTaskIds = [...new Set(taskIds)];
  if (uniqueTaskIds.length === 0) return;

  const tasks = yield* selectFrom(tasksTable, "byId").where((q) =>
    uniqueTaskIds.map((id) => q.eq("id", id)),
  );
  const taskById = new Map((tasks as Task[]).map((task) => [task.id, task]));

  const entries = yield* selectFrom(dailyEntriesTable, "byId").where((q) =>
    uniqueTaskIds.map((id) => q.eq("id", id)),
  );
  const dailyEntryMapByTaskId = new Map(
    (entries as DailyEntry[]).map((entry) => [entry.id, entry]),
  );
  const dailyListIds = [
    ...new Set((entries as DailyEntry[]).map((entry) => entry.dailyListId)),
  ];
  const dailyLists =
    dailyListIds.length > 0
      ? yield* selectFrom(dailyListsTable, "byId").where((q) =>
          dailyListIds.map((id) => q.eq("id", id)),
        )
      : [];
  const dailyListById = new Map(
    (dailyLists as DailyList[]).map((dailyList) => [dailyList.id, dailyList]),
  );

  const nextRows: ScheduledTodoTask[] = [];
  const staleIds: string[] = [];

  for (const taskId of uniqueTaskIds) {
    const task = taskById.get(taskId);
    const entry = dailyEntryMapByTaskId.get(taskId);
    const dailyList = entry ? dailyListById.get(entry.dailyListId) : undefined;

    if (task?.state === "todo" && dailyList) {
      nextRows.push({
        id: task.id,
        scheduledAt: getScheduledAt(dailyList),
        projectSectionId: task.projectSectionId,
      });
    } else {
      staleIds.push(taskId);
    }
  }

  if (nextRows.length > 0) {
    yield* upsert(scheduledTodoTasksTable, nextRows);
  }
  if (staleIds.length > 0) {
    yield* deleteRows(scheduledTodoTasksTable, staleIds);
  }
}

function* refreshScheduledTodoTasksForDailyLists(
  dailyListIds: Iterable<string>,
): Generator<unknown, void, unknown> {
  const uniqueDailyListIds = [...new Set(dailyListIds)];
  if (uniqueDailyListIds.length === 0) return;

  const entries = yield* selectFrom(
    dailyEntriesTable,
    "byDailyListIdTokenOrdered",
  ).where((q) =>
    uniqueDailyListIds.map((dailyListId) => q.eq("dailyListId", dailyListId)),
  );

  yield* refreshScheduledTodoTasks(
    (entries as DailyEntry[]).map((entry) => entry.id),
  );
}

export const rebuildProjectSectionTaskStats = action({
  name: "rebuildProjectSectionTaskStats",
  args: {},
  handler: function* rebuildProjectSectionTaskStats(): Generator<
    unknown,
    void,
    unknown
  > {
    const existingStats = yield* selectFrom(
      projectSectionTaskStatsTable,
      "byIds",
    );
    if (existingStats.length > 0) {
      yield* deleteRows(
        projectSectionTaskStatsTable,
        existingStats.map((stats) => stats.id),
      );
    }

    const tasks = yield* selectFrom(
      tasksTable,
      "byProjectSectionIdOrderStates",
    );
    const statsBySectionId = new Map<string, ProjectSectionTaskStats>();

    for (const task of tasks) {
      const existingStats =
        statsBySectionId.get(task.projectSectionId) ??
        emptyProjectSectionTaskStats(task.projectSectionId);

      statsBySectionId.set(
        task.projectSectionId,
        applyTaskDelta(existingStats, task, 1),
      );
    }

    const nextStats = [...statsBySectionId.values()].filter(
      (stats) => stats.total > 0,
    );
    if (nextStats.length > 0) {
      yield* upsert(projectSectionTaskStatsTable, nextStats);
    }
  },
});

export const migrateProjectSectionTaskStats = action({
  name: "migrateProjectSectionTaskStats",
  args: {},
  handler: function* migrateProjectSectionTaskStats(): Generator<
    unknown,
    void,
    unknown
  > {
    const existingMigration = yield* selectFrom(spaceMigrationsTable, "byId")
      .where((q) => q.eq("id", projectSectionTaskStatsMigrationId))
      .firstOr(null);
    if (existingMigration) return;

    yield* rebuildProjectSectionTaskStats({});
    yield* upsert(spaceMigrationsTable, [
      {
        id: projectSectionTaskStatsMigrationId,
        appliedAt: Date.now(),
      },
    ]);
  },
});

export const rebuildScheduledTodoTasks = action({
  name: "rebuildScheduledTodoTasks",
  args: {},
  handler: function* rebuildScheduledTodoTasks(): Generator<
    unknown,
    void,
    unknown
  > {
    const existingRows = yield* selectFrom(scheduledTodoTasksTable, "byIds");
    if (existingRows.length > 0) {
      yield* deleteRows(
        scheduledTodoTasksTable,
        existingRows.map((row) => row.id),
      );
    }

    const entries = yield* selectFrom(dailyEntriesTable, "byIds");
    yield* refreshScheduledTodoTasks(
      (entries as DailyEntry[]).map((entry) => entry.id),
    );
  },
});

export const migrateScheduledTodoTasks = action({
  name: "migrateScheduledTodoTasks",
  args: {},
  handler: function* migrateScheduledTodoTasks(): Generator<
    unknown,
    void,
    unknown
  > {
    const existingMigration = yield* selectFrom(spaceMigrationsTable, "byId")
      .where((q) => q.eq("id", scheduledTodoTasksMigrationId))
      .firstOr(null);
    if (existingMigration) return;

    yield* rebuildScheduledTodoTasks({});
    yield* upsert(spaceMigrationsTable, [
      {
        id: scheduledTodoTasksMigrationId,
        appliedAt: Date.now(),
      },
    ]);
  },
});

export const projectTasksCount = selector({
  name: "projectTasksCount",
  args: { projectId: v.string() },
  handler: function* projectTasksCount({ projectId }) {
    const sections = yield* projectSectionsByProjectId({ projectId });
    const projectSectionIds = sections.map((section) => section.id);
    if (projectSectionIds.length === 0) return 0;

    const stats = yield* selectFrom(projectSectionTaskStatsTable, "byId").where(
      (q) => projectSectionIds.map((id) => q.eq("id", id)),
    );

    return stats.reduce((count, stat) => count + stat.todo, 0);
  },
});

export const allScheduledTodoTasks = selector({
  name: "allScheduledTodoTasks",
  args: {},
  handler: function* allScheduledTodoTasks() {
    return (yield* selectFrom(
      scheduledTodoTasksTable,
      "byScheduledAtId",
    )) as ScheduledTodoTask[];
  },
});

export type ScheduledTodoTaskPageItem = {
  task: Task;
  scheduledAt: number;
};

export type ScheduledTodoTaskPage = {
  items: ScheduledTodoTaskPageItem[];
  nextCursor: { scheduledAt: number; id: string } | null;
};

export const listScheduledTasks = selector({
  name: "listScheduledTasks",
  args: {
    fromInclusive: v.number(),
    toExclusive: v.number(),
    cursorScheduledAt: v.union(v.number(), v.null()),
    cursorId: v.union(v.string(), v.null()),
    limit: v.number(),
  },
  handler: function* listScheduledTasks({
    fromInclusive,
    toExclusive,
    cursorScheduledAt,
    cursorId,
    limit,
  }): Generator<unknown, ScheduledTodoTaskPage, unknown> {
    if (
      cursorScheduledAt !== null &&
      (cursorScheduledAt < fromInclusive || cursorScheduledAt >= toExclusive)
    ) {
      return { items: [], nextCursor: null };
    }

    const rawLimit = limit + 1;
    let rows: ScheduledTodoTask[];
    if (cursorScheduledAt === null || cursorId === null) {
      rows = yield* selectFrom(scheduledTodoTasksTable, "byScheduledAtId")
        .where((q) =>
          q.gte("scheduledAt", fromInclusive).lt("scheduledAt", toExclusive),
        )
        .order("asc")
        .limit(rawLimit);
    } else {
      const remainingAtCursor = yield* selectFrom(
        scheduledTodoTasksTable,
        "byScheduledAtId",
      )
        .where((q) =>
          q.eq("scheduledAt", cursorScheduledAt).gte("id", cursorId),
        )
        .order("asc")
        .limit(rawLimit + 1);
      const nextRows =
        remainingAtCursor[0]?.id === cursorId
          ? remainingAtCursor.slice(1)
          : remainingAtCursor.slice(0, rawLimit);

      if (nextRows.length < rawLimit) {
        nextRows.push(
          ...(yield* selectFrom(scheduledTodoTasksTable, "byScheduledAtId")
            .where((q) =>
              q
                .gt("scheduledAt", cursorScheduledAt)
                .lt("scheduledAt", toExclusive),
            )
            .order("asc")
            .limit(rawLimit - nextRows.length)),
        );
      }
      rows = nextRows;
    }

    const tasks = yield* tasksByIds({ ids: rows.map((row) => row.id) });
    const taskById = new Map(tasks.map((task) => [task.id, task]));
    const items = rows.flatMap((row) => {
      const task = taskById.get(row.id);
      return task ? [{ task, scheduledAt: row.scheduledAt }] : [];
    });

    const lastPageItem = items[limit - 1];
    const lastRawRow = rows.at(-1);
    const nextCursor =
      items.length > limit && lastPageItem
        ? { scheduledAt: lastPageItem.scheduledAt, id: lastPageItem.task.id }
        : rows.length > limit && lastRawRow
          ? { scheduledAt: lastRawRow.scheduledAt, id: lastRawRow.id }
          : null;

    return { items: items.slice(0, limit), nextCursor };
  },
});

export type ProjectWithTaskStats = {
  project: Project;
  notDoneCount: number;
  overdueCount: number;
};

export const projectsWithTaskStats = selector({
  name: "projectsWithTaskStats",
  args: { currentDate: v.number() },
  handler: function* ({
    currentDate,
  }): Generator<unknown, ProjectWithTaskStats[], unknown> {
    const projects = yield* selectFrom(projectsTable, "byOrderToken");
    if (projects.length === 0) return [];

    const sections = yield* selectFrom(
      projectSectionsTable,
      "byProjectIdOrderToken",
    ).where((q) => projects.map((project) => q.eq("projectId", project.id)));
    const projectSectionIds = sections.map((section) => section.id);

    const stats =
      projectSectionIds.length > 0
        ? yield* selectFrom(projectSectionTaskStatsTable, "byId").where((q) =>
            projectSectionIds.map((id) => q.eq("id", id)),
          )
        : [];
    const statsBySectionId = new Map(stats.map((stat) => [stat.id, stat]));

    const notDoneCountByProjectId = new Map<string, number>();
    for (const section of sections) {
      const count = statsBySectionId.get(section.id)?.todo ?? 0;
      notDoneCountByProjectId.set(
        section.projectId,
        (notDoneCountByProjectId.get(section.projectId) ?? 0) + count,
      );
    }

    const sectionById = new Map(
      sections.map((section) => [section.id, section]),
    );
    const overdueScheduledTasks = yield* selectFrom(
      scheduledTodoTasksTable,
      "byScheduledAtId",
    ).where((q) => q.lt("scheduledAt", currentDate));
    const overdueCountByProjectId = new Map<string, number>();
    for (const scheduledTask of overdueScheduledTasks) {
      const section = sectionById.get(scheduledTask.projectSectionId);
      if (!section) continue;

      overdueCountByProjectId.set(
        section.projectId,
        (overdueCountByProjectId.get(section.projectId) ?? 0) + 1,
      );
    }

    return projects.map((project) => ({
      project,
      notDoneCount: notDoneCountByProjectId.get(project.id) ?? 0,
      overdueCount: overdueCountByProjectId.get(project.id) ?? 0,
    }));
  },
});

export function installProjectTaskStatsHooks(db: SubscribableDB) {
  db.afterChange(
    function* updateProjectSectionTaskStats(_db, table, _traits, ops) {
      if (ops.length === 0) return;
      if (table !== tasksTable && table !== projectSectionsTable) return;

      if (table === projectSectionsTable) {
        const deletedSectionIds = ops
          .filter((op) => op.type === "delete")
          .map((op) => (op.oldValue as ProjectSection).id);

        if (deletedSectionIds.length > 0) {
          yield* deleteRows(projectSectionTaskStatsTable, deletedSectionIds);
        }
        return;
      }

      const changedSectionIds = new Set<string>();
      for (const op of ops) {
        if (op.type === "insert") {
          changedSectionIds.add((op.newValue as Task).projectSectionId);
        } else if (op.type === "upsert") {
          if (op.oldValue) {
            changedSectionIds.add((op.oldValue as Task).projectSectionId);
          }
          changedSectionIds.add((op.newValue as Task).projectSectionId);
        } else {
          changedSectionIds.add((op.oldValue as Task).projectSectionId);
        }
      }

      if (changedSectionIds.size === 0) return;

      const existingStats = yield* selectFrom(
        projectSectionTaskStatsTable,
        "byId",
      ).where((q) => [...changedSectionIds].map((id) => q.eq("id", id)));
      const statsBySectionId = new Map(
        existingStats.map((stats) => [stats.id, stats]),
      );

      for (const projectSectionId of changedSectionIds) {
        if (!statsBySectionId.has(projectSectionId)) {
          statsBySectionId.set(
            projectSectionId,
            emptyProjectSectionTaskStats(projectSectionId),
          );
        }
      }

      for (const op of ops) {
        if (op.type === "insert") {
          const task = op.newValue as Task;
          const stats = statsBySectionId.get(task.projectSectionId)!;
          statsBySectionId.set(
            task.projectSectionId,
            applyTaskDelta(stats, task, 1),
          );
        } else if (op.type === "upsert") {
          if (op.oldValue) {
            const oldTask = op.oldValue as Task;
            const stats = statsBySectionId.get(oldTask.projectSectionId)!;
            statsBySectionId.set(
              oldTask.projectSectionId,
              applyTaskDelta(stats, oldTask, -1),
            );
          }

          const newTask = op.newValue as Task;
          const stats = statsBySectionId.get(newTask.projectSectionId)!;
          statsBySectionId.set(
            newTask.projectSectionId,
            applyTaskDelta(stats, newTask, 1),
          );
        } else {
          const task = op.oldValue as Task;
          const stats = statsBySectionId.get(task.projectSectionId)!;
          statsBySectionId.set(
            task.projectSectionId,
            applyTaskDelta(stats, task, -1),
          );
        }
      }

      const nextStats: ProjectSectionTaskStats[] = [];
      const emptyStatsIds: string[] = [];

      for (const stats of statsBySectionId.values()) {
        const normalizedStats = normalizeProjectSectionTaskStats(stats);
        if (normalizedStats.total <= 0) {
          emptyStatsIds.push(normalizedStats.id);
        } else {
          nextStats.push(normalizedStats);
        }
      }

      if (nextStats.length > 0) {
        yield* upsert(projectSectionTaskStatsTable, nextStats);
      }
      if (emptyStatsIds.length > 0) {
        yield* deleteRows(projectSectionTaskStatsTable, emptyStatsIds);
      }
    },
  );

  db.afterChange(function* updateScheduledTodoTasks(_db, table, _traits, ops) {
    if (ops.length === 0) return;
    if (
      table !== tasksTable &&
      table !== dailyEntriesTable &&
      table !== dailyListsTable &&
      table !== projectSectionsTable
    ) {
      return;
    }

    if (table === projectSectionsTable) {
      const deletedSectionIds = ops
        .filter((op) => op.type === "delete")
        .map((op) => (op.oldValue as ProjectSection).id);
      if (deletedSectionIds.length === 0) return;

      const staleRows = yield* selectFrom(
        scheduledTodoTasksTable,
        "byProjectSectionId",
      ).where((q) =>
        deletedSectionIds.map((projectSectionId) =>
          q.eq("projectSectionId", projectSectionId),
        ),
      );
      if (staleRows.length > 0) {
        yield* deleteRows(
          scheduledTodoTasksTable,
          staleRows.map((row) => row.id),
        );
      }
      return;
    }

    if (table === dailyListsTable) {
      const changedDailyListIds = new Set<string>();
      for (const op of ops) {
        if (op.type === "insert") {
          changedDailyListIds.add((op.newValue as DailyList).id);
        } else if (op.type === "upsert") {
          if (op.oldValue) {
            changedDailyListIds.add((op.oldValue as DailyList).id);
          }
          changedDailyListIds.add((op.newValue as DailyList).id);
        } else {
          changedDailyListIds.add((op.oldValue as DailyList).id);
        }
      }

      yield* refreshScheduledTodoTasksForDailyLists(changedDailyListIds);
      return;
    }

    const changedTaskIds = new Set<string>();
    for (const op of ops) {
      if (op.type === "insert") {
        changedTaskIds.add((op.newValue as Task | DailyEntry).id);
      } else if (op.type === "upsert") {
        if (op.oldValue) {
          changedTaskIds.add((op.oldValue as Task | DailyEntry).id);
        }
        changedTaskIds.add((op.newValue as Task | DailyEntry).id);
      } else {
        changedTaskIds.add((op.oldValue as Task | DailyEntry).id);
      }
    }

    yield* refreshScheduledTodoTasks(changedTaskIds);
  });
}
