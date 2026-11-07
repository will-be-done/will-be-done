import {
  execAsync,
  execMaybeAsync,
  type Op,
  type SubscribableDB,
} from "@will-be-done/hyperdb";
import {
  changesTable,
  type Change,
  type ChangesetArrayType,
  isDeletedChange,
  type PrimitiveRow,
} from "@will-be-done/slices/common";
import { Cause, Effect, Fiber } from "effect";
import { flushPendingDrafts } from "./pendingDraftFlushes.ts";
import type { ChangePersistedEvent } from "./syncTypes";

type CreateLocalPersistQueueArgs = {
  syncSubDb: SubscribableDB;
  postChanges: (event: ChangePersistedEvent) => void;
  onPersisted: () => void;
};

type RowType = PrimitiveRow;

const opRowKey = (tableName: string, rowId: string) => `${tableName}:${rowId}`;

const getChangedRows = (ops: Op[]) => {
  const rows = new Map<string, RowType>();

  for (const op of ops) {
    if (op.table === changesTable) continue;

    if (op.type === "delete") {
      continue;
    }

    rows.set(
      opRowKey(op.table.tableName, op.newValue.id),
      op.newValue as RowType,
    );
  }

  return rows;
};

const getChangeFromOp = (op: Op): Change | undefined => {
  if (op.table !== changesTable) return undefined;
  if (op.type === "delete") return undefined;

  return op.newValue as Change;
};

const createChangesetFromOps = (ops: Op[]): ChangesetArrayType => {
  const changedRows = getChangedRows(ops);
  const changesByTable = new Map<
    string,
    Array<{ row?: RowType; change: Change }>
  >();

  for (const op of ops) {
    const change = getChangeFromOp(op);
    if (!change) continue;

    if (!changesByTable.has(change.tableName)) {
      changesByTable.set(change.tableName, []);
    }

    const row = !isDeletedChange(change)
      ? changedRows.get(opRowKey(change.tableName, change.entityId))
      : undefined;

    changesByTable.get(change.tableName)!.push({ row, change });
  }

  const changeset: ChangesetArrayType = [];
  for (const [tableName, data] of changesByTable) {
    changeset.push({
      tableName,
      data,
    });
  }

  return changeset;
};

export const createLocalPersistQueue = ({
  syncSubDb,
  postChanges,
  onPersisted,
}: CreateLocalPersistQueueArgs) => {
  const publications = new Set<Fiber.Fiber<void>>();
  let unsubscribe: (() => void) | undefined;

  const drain = async () => {
    flushPendingDrafts();
    await execAsync(syncSubDb.waitForPersistence());
    await Effect.runPromise(Fiber.awaitAll(publications));
  };

  const drainBestEffort = () => {
    void drain();
  };

  const drainWhenHidden = () => {
    if (document.visibilityState === "hidden") {
      drainBestEffort();
    }
  };

  return {
    start: () => {
      window.addEventListener("beforeunload", drainBestEffort, {
        capture: true,
      });
      window.addEventListener("pagehide", drainBestEffort, { capture: true });
      document.addEventListener("visibilitychange", drainWhenHidden, {
        capture: true,
      });

      unsubscribe = syncSubDb.subscribe((ops, traits) => {
        if (traits.some((t) => t.type === "skip-sync")) {
          return;
        }

        const changeset = createChangesetFromOps(ops);
        if (changeset.length === 0) return;

        const publish = () => {
          postChanges({ changeset });
          onPersisted();
        };
        const persisted = execMaybeAsync(syncSubDb.waitForPersistence());
        if (!(persisted instanceof Promise)) {
          publish();
          return;
        }
        // Other tabs and the syncer must only see changes that are durable.
        const publication = Effect.runFork(
          Effect.promise(() => persisted).pipe(
            Effect.andThen(Effect.sync(publish)),
            Effect.catchCause((cause) =>
              Effect.sync(() => console.error(Cause.squash(cause))),
            ),
          ),
        );
        publications.add(publication);
        publication.addObserver(() => publications.delete(publication));
      });
    },
    stop: () => {
      window.removeEventListener("beforeunload", drainBestEffort, {
        capture: true,
      });
      window.removeEventListener("pagehide", drainBestEffort, {
        capture: true,
      });
      document.removeEventListener("visibilitychange", drainWhenHidden, {
        capture: true,
      });
      unsubscribe?.();
      unsubscribe = undefined;
    },
    drain,
  };
};
