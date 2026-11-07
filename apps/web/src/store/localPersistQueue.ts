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
import { Effect, Fiber, type Scope } from "effect";
import { PageEvents } from "@/services/browser";
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

// Closing the scope stops publishing local writes and flushing on page hide.
export const makeLocalPersistQueue = ({
  syncSubDb,
  postChanges,
  onPersisted,
}: CreateLocalPersistQueueArgs): Effect.Effect<
  { readonly drain: () => Promise<void> },
  never,
  PageEvents | Scope.Scope
> =>
  Effect.gen(function* () {
    const page = yield* PageEvents;
    const runFork = Effect.runForkWith(yield* Effect.context<never>());
    const publications = new Set<Fiber.Fiber<void>>();

    const drain = async () => {
      flushPendingDrafts();
      await execAsync(syncSubDb.waitForPersistence());
      await Effect.runPromise(Fiber.awaitAll(publications));
    };
    const drainBestEffort = () => {
      void drain();
    };

    yield* page.listen("window", "beforeunload", drainBestEffort, {
      capture: true,
    });
    yield* page.listen("window", "pagehide", drainBestEffort, {
      capture: true,
    });
    yield* page.listen(
      "document",
      "visibilitychange",
      () => {
        if (page.visibility() === "hidden") drainBestEffort();
      },
      { capture: true },
    );

    yield* Effect.acquireRelease(
      Effect.sync(() =>
        syncSubDb.subscribe((ops, traits) => {
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
          const publication = runFork(
            Effect.promise(() => persisted).pipe(
              Effect.andThen(Effect.sync(publish)),
              Effect.catchCause((cause) =>
                Effect.logError("Publishing local changes failed", cause),
              ),
            ),
          );
          publications.add(publication);
          publication.addObserver(() => publications.delete(publication));
        }),
      ),
      (unsubscribe) => Effect.sync(unsubscribe),
    );

    return { drain };
  });
