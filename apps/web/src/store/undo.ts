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
} from "@will-be-done/hyperdb/undo";
import {
  loadSpaceBackup,
  registeredSpaceSyncableTables,
} from "@will-be-done/slices/space";
import { toast } from "sonner";

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
const enqueue = <T>(
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
