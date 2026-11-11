import { deleteRows, insert, selectFrom, v } from "@will-be-done/hyperdb";
import { action, selector } from "../builders";
import { inboxProjectSectionId, projectSectionById } from "./projectSections";
import { taskTemplateById } from "./taskTemplates";
import { mindmapById } from "./mindmaps";
import { deleteItemAttachmentLinks } from "./attachments";
import {
  checklistItemsTable,
  dailyEntriesTable,
  type MindmapNode,
  mindmapNodesTable,
  notesTable,
  noteType,
  stashEntriesTable,
  tasksTable,
  taskType,
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

// A node whose parent is gone shows as a main branch (see mindmapTree).
function* restoreMindmapNodes(nodes: MindmapNode[]) {
  const restored: MindmapNode[] = [];
  for (const node of nodes) {
    if (yield* mindmapById({ id: node.mindmapId })) restored.push(node);
  }
  if (restored.length > 0) yield* insert(mindmapNodesTable, restored);
}

export const restoreTrashedTasks = action({
  name: "restoreTrashedTasks",
  args: { ids: v.array(v.string()) },
  handler: function* restoreTrashedTasks({ ids }) {
    if (ids.length === 0) return;
    const rows = (yield* selectFrom(trashedTasksTable, "byId").where((q) =>
      ids.map((id) => q.eq("id", id)),
    )).map(decodeTrashedTask);

    for (const row of rows) {
      if ("note" in row) {
        const section = yield* projectSectionById({
          id: row.note.projectSectionId,
        });
        yield* insert(notesTable, [
          {
            ...row.note,
            projectSectionId: section?.id ?? (yield* inboxProjectSectionId({})),
          },
        ]);
        yield* restoreMindmapNodes(row.mindmapNodes ?? []);
        continue;
      }

      const {
        task,
        checklistItems,
        dailyEntry,
        stashEntry,
        mindmapNodes = [],
      } = row;
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
      yield* restoreMindmapNodes(mindmapNodes);
    }

    yield* deleteRows(
      trashedTasksTable,
      rows.map((row) => row.id),
    );
  },
});

// Trashed items keep their file links until they are purged.
function* purgeTrashRows(rows: TrashedTaskRow[]) {
  if (rows.length === 0) return;
  const ids = rows.map((row) => row.id);
  yield* deleteRows(trashedTasksTable, ids);
  yield* deleteItemAttachmentLinks(taskType, ids);
  yield* deleteItemAttachmentLinks(noteType, ids);
}

export const deleteTrashedTasks = action({
  name: "deleteTrashedTasks",
  args: { ids: v.array(v.string()) },
  handler: function* deleteTrashedTasks({ ids }) {
    if (ids.length === 0) return;
    const rows = yield* selectFrom(trashedTasksTable, "byId").where((q) =>
      ids.map((id) => q.eq("id", id)),
    );
    yield* purgeTrashRows(rows);
  },
});

export const emptyTrash = action({
  name: "emptyTrash",
  args: {},
  handler: function* emptyTrash() {
    yield* purgeTrashRows(
      yield* selectFrom(trashedTasksTable, "byTrashedAtId"),
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
    yield* purgeTrashRows(expired);
  },
});
