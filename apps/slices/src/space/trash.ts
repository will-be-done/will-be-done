import { deleteRows, insert, selectFrom, v } from "@will-be-done/hyperdb";
import { action, selector } from "../builders";
import { inboxProjectSectionId, projectSectionById } from "./projectSections";
import { taskTemplateById } from "./taskTemplates";
import {
  checklistItemsTable,
  dailyEntriesTable,
  stashEntriesTable,
  tasksTable,
  trashedTasksTable,
  type TrashedTask,
  type TrashedTaskRow,
  type TrashSnapshot,
} from "./tables";

export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export const decodeTrashedTask = (row: TrashedTaskRow): TrashedTask => ({
  id: row.id,
  trashedAt: row.trashedAt,
  ...(JSON.parse(row.snapshot) as TrashSnapshot),
});

// Bounded by retention: rows older than TRASH_RETENTION_MS are purged.
export const trashedTasks = selector({
  name: "trashedTasks",
  args: {},
  handler: function* trashedTasks() {
    const rows = yield* selectFrom(trashedTasksTable, "byTrashedAtId").order(
      "desc",
    );
    return rows.map(decodeTrashedTask);
  },
});

export const restoreTrashedTasks = action({
  name: "restoreTrashedTasks",
  args: { ids: v.array(v.string()) },
  handler: function* restoreTrashedTasks({ ids }) {
    if (ids.length === 0) return;
    const rows = (yield* selectFrom(trashedTasksTable, "byId").where((q) =>
      ids.map((id) => q.eq("id", id)),
    )).map(decodeTrashedTask);

    for (const { task, checklistItems, dailyEntry, stashEntry } of rows) {
      const section = yield* projectSectionById({ id: task.projectSectionId });
      const template = task.templateId
        ? yield* taskTemplateById({ id: task.templateId })
        : undefined;

      yield* insert(tasksTable, [
        {
          ...task,
          projectSectionId: section?.id ?? (yield* inboxProjectSectionId({})),
          ...(template ? {} : { templateId: null, templateDate: null }),
        },
      ]);
      if (checklistItems.length > 0) {
        yield* insert(checklistItemsTable, checklistItems);
      }
      // DailyLists are never deleted, so the entry's list still exists.
      if (dailyEntry) yield* insert(dailyEntriesTable, [dailyEntry]);
      if (stashEntry) yield* insert(stashEntriesTable, [stashEntry]);
    }

    yield* deleteRows(
      trashedTasksTable,
      rows.map((row) => row.id),
    );
  },
});

export const deleteTrashedTasks = action({
  name: "deleteTrashedTasks",
  args: { ids: v.array(v.string()) },
  handler: function* deleteTrashedTasks({ ids }) {
    yield* deleteRows(trashedTasksTable, ids);
  },
});

export const emptyTrash = action({
  name: "emptyTrash",
  args: {},
  handler: function* emptyTrash() {
    const rows = yield* selectFrom(trashedTasksTable, "byTrashedAtId");
    yield* deleteRows(
      trashedTasksTable,
      rows.map((row) => row.id),
    );
  },
});

export const purgeExpiredTrash = action({
  name: "purgeExpiredTrash",
  args: { now: v.number() },
  handler: function* purgeExpiredTrash({ now }) {
    const expired = yield* selectFrom(trashedTasksTable, "byTrashedAtId").where(
      (q) => q.lt("trashedAt", now - TRASH_RETENTION_MS),
    );
    if (expired.length === 0) return;
    yield* deleteRows(
      trashedTasksTable,
      expired.map((row) => row.id),
    );
  },
});
