import { useCallback } from "react";
import {
  asyncDispatch,
  execAsync,
  type SubscribableDB,
} from "@will-be-done/hyperdb";
import {
  UndoConflictError,
  undoMiddleware,
  withoutUndo,
  type UndoEvent,
  type UndoManager,
  type UndoRowChange,
} from "@will-be-done/hyperdb/undo";
import { useDB } from "@will-be-done/hyperdb/react";
import { richTextMarkdownToPlainText } from "@will-be-done/slices/common";
import {
  checklistItemType,
  dailyEntryType,
  loadSpaceBackup,
  mindmapNodeType,
  mindmapType,
  noteType,
  projectSectionType,
  projectType,
  registeredSpaceSyncableTables,
  stashEntryType,
  taskTemplateType,
  taskType,
} from "@will-be-done/slices/space";
import { toast } from "sonner";
import { ToastCountdown } from "@/components/ui/sonner";
import { buildFocusKey, type FocusKey, useFocusStore } from "./focusSlice";

type History = { manager: UndoManager; queue: Promise<void> };

// History is per tab and in memory only; reloading the page starts it empty.
const histories = new WeakMap<SubscribableDB, History>();

export const installUndo = (db: SubscribableDB) => {
  if (histories.has(db)) return;

  const manager = undoMiddleware(db, {
    tables: registeredSpaceSyncableTables,
    // Sync and cross-tab merges are other devices' edits, not this tab's.
    skip: (traits) => traits.some((trait) => trait.type === "skip-sync"),
    maxUndoLevels: 100,
    maxRedoLevels: 100,
  });
  histories.set(db, { manager, queue: Promise.resolve() });
};

// The manager rejects overlapping replays, and a replay can wait on reading
// rows from persistence, so key repeats run one by one.
const enqueue = <T,>(
  db: SubscribableDB,
  task: (manager: UndoManager) => T | Promise<T>,
): Promise<T | undefined> => {
  const history = histories.get(db);
  if (!history) return Promise.resolve(undefined);

  const result = history.queue
    .then(() => task(history.manager))
    .catch((error: unknown) => {
      console.error(error);
      return undefined;
    });
  history.queue = result.then(() => undefined);
  return result;
};

/** Resolves with the replayed step, or undefined when nothing was replayed. */
export const replayHistory = (db: SubscribableDB, direction: "undo" | "redo") =>
  enqueue(db, async (manager): Promise<UndoEvent | undefined> => {
    const undoing = direction === "undo";
    if (!(undoing ? manager.canUndo : manager.canRedo)) return undefined;

    try {
      return await execAsync(undoing ? manager.undo() : manager.redo());
    } catch (error) {
      if (!(error instanceof UndoConflictError)) throw error;

      // Retrying would hit the same conflict, so skip the step instead of
      // blocking every step behind it.
      if (undoing) manager.dropUndo();
      else manager.dropRedo();
      toast(`Couldn't ${direction}: it was changed on another device or tab`);
      return undefined;
    }
  });

const isRendered = (key: FocusKey) =>
  !!document.querySelector(`[data-focusable-key="${CSS.escape(key)}"]`);

// Focus the first replayed row on screen, so a restored item is visible.
export const replayAndFocus = async (
  db: SubscribableDB,
  direction: "undo" | "redo",
) => {
  const event = await replayHistory(db, direction);
  if (!event) return;

  const keys = event.changes.flatMap(({ id, before, after }) => {
    const type = (direction === "undo" ? before : after)?.type;
    return typeof type === "string" ? [buildFocusKey(id, type)] : [];
  });
  // Let the views render the replayed rows first.
  setTimeout(() => {
    const focus = useFocusStore.getState();
    const key = keys.find(isRendered);
    if (key) focus.focusByKey(key);
    else if (focus.focusItemKey && !isRendered(focus.focusItemKey)) {
      focus.resetFocus();
    }
  }, 0);
};

// Ordered outermost first: deleting a project or map also deletes what is
// inside it, so only the first level with deleted rows is named.
const deletedLevels: {
  labels: Record<string, [one: string, many: string]>;
  verb: string;
}[] = [
  { labels: { [projectType]: ["Project", "projects"] }, verb: "deleted" },
  { labels: { [projectSectionType]: ["Column", "columns"] }, verb: "deleted" },
  { labels: { [mindmapType]: ["Mindmap", "mindmaps"] }, verb: "deleted" },
  {
    labels: {
      [taskType]: ["Task", "tasks"],
      [noteType]: ["Note", "notes"],
      [taskTemplateType]: ["Repeating task", "repeating tasks"],
    },
    verb: "deleted",
  },
  { labels: { [mindmapNodeType]: ["Node", "nodes"] }, verb: "removed" },
  { labels: { [dailyEntryType]: ["Task", "tasks"] }, verb: "unscheduled" },
  {
    labels: { [stashEntryType]: ["Task", "tasks"] },
    verb: "removed from the stash",
  },
  {
    labels: { [checklistItemType]: ["Checklist item", "checklist items"] },
    verb: "deleted",
  },
];

type ChangedRow = NonNullable<UndoRowChange["before"]>;

// Titles and checklist text are stored as rich-text Markdown.
const rowName = (row: ChangedRow) =>
  typeof row.title === "string"
    ? richTextMarkdownToPlainText(row.title, "title").trim()
    : typeof row.content === "string"
      ? richTextMarkdownToPlainText(row.content, "content").trim()
      : "";

const rowsMessage = (
  rows: ChangedRow[],
  [one, many]: [one: string, many: string],
  verb: string,
) => {
  const [first] = rows;
  if (!first) return undefined;
  if (rows.length > 1) return `${rows.length} ${many} were ${verb}`;
  const title = rowName(first);
  if (!title) return `${one} was ${verb}`;
  const name = title.length > 40 ? `${title.slice(0, 40).trimEnd()}…` : title;
  return `${one} "${name}" was ${verb}`;
};

// Converting replaces a Task with a Note under a new ID, or back.
const conversions = [
  {
    from: taskType,
    to: noteType,
    labels: ["Task", "tasks"],
    into: ["a note", "notes"],
  },
  {
    from: noteType,
    to: taskType,
    labels: ["Note", "notes"],
    into: ["a task", "tasks"],
  },
] as const;

const undoMessage = (changes: readonly UndoRowChange[]) => {
  const deleted = changes.flatMap(({ before, after }) =>
    before && !after ? [before] : [],
  );
  const inserted = changes.flatMap(({ before, after }) =>
    after && !before ? [after] : [],
  );

  for (const { from, to, labels, into } of conversions) {
    if (!inserted.some((row) => row.type === to)) continue;
    const rows = deleted.filter((row) => row.type === from);
    const message = rowsMessage(
      rows,
      [...labels],
      `converted to ${into[rows.length > 1 ? 1 : 0]}`,
    );
    if (message) return message;
  }

  for (const { labels, verb } of deletedLevels) {
    const rows = deleted.filter((row) => String(row.type) in labels);
    const [first] = rows;
    if (!first) continue;

    const [one, many] = labels[String(first.type)]!;
    const sameType = rows.every((row) => row.type === first.type);
    return rowsMessage(rows, [one, sameType ? many : "items"], verb);
  }
  return undefined;
};

/**
 * Runs a delete or conversion and shows a toast that undoes it, until another
 * step lands in history and Undo would replay something else.
 */
export const withUndoToast = async <T,>(
  db: SubscribableDB,
  run: () => Promise<T>,
) => {
  const manager = histories.get(db)?.manager;
  const revision = manager?.getRevision();
  const result = await run();
  if (!manager || manager.getRevision() === revision) return result;

  const message = undoMessage(manager.undoQueue.at(-1)?.changes ?? []);
  if (!message) return result;

  const duration = 5000;
  let unsubscribe = () => {};
  const toastId = toast(
    <>
      {message}
      <ToastCountdown duration={duration} />
    </>,
    {
      duration,
      action: {
        label: "Undo",
        onClick: () => void replayAndFocus(db, "undo"),
      },
      onDismiss: () => unsubscribe(),
      onAutoClose: () => unsubscribe(),
    },
  );
  unsubscribe = manager.subscribe(() => {
    unsubscribe();
    toast.dismiss(toastId);
  });
  return result;
};

export const useUndoToast = () => {
  const db = useDB();
  return useCallback(
    <T,>(run: () => Promise<T>) => withUndoToast(db, run),
    [db],
  );
};

// Replacing the whole space is not undoable, and it invalidates every
// recorded step.
export const restoreSpaceBackup = async (
  db: SubscribableDB,
  backup: Parameters<typeof loadSpaceBackup>[0]["backup"],
) => {
  await withoutUndo(db, (scopedDb) =>
    asyncDispatch(scopedDb, loadSpaceBackup({ backup })),
  );
  await enqueue(db, (manager) => {
    manager.clearUndo();
    manager.clearRedo();
  });
};
