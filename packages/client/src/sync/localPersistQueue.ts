import { type Op, type SubscribableDB } from "@will-be-done/hyperdb";
import {
  changesTable,
  type Change,
  type ChangesetArrayType,
  type PrimitiveRow,
} from "@will-be-done/slices/common";
import { flushPendingDrafts } from "./pendingDraftFlushes";
import type { ChangePersistedEvent } from "./syncTypes";
import type { ClientPlatform } from "./platform";

type CreateLocalPersistQueueArgs = {
  syncSubDb: SubscribableDB;
  postChanges: (event: ChangePersistedEvent) => void;
  onPersisted: () => void;
  lifecycle: Pick<ClientPlatform["lifecycle"], "onHide">;
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

    const row =
      change.deletedAt == null
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
  lifecycle,
}: CreateLocalPersistQueueArgs) => {
  const flushDraftsAndPersist = async () => {
    flushPendingDrafts();
  };

  const flushDraftsAndPersistBestEffort = () => {
    void flushDraftsAndPersist();
  };

  return {
    start: () => {
      lifecycle.onHide(flushDraftsAndPersistBestEffort);

      syncSubDb.subscribe((ops, traits) => {
        if (traits.some((t) => t.type === "skip-sync")) {
          return;
        }

        const changeset = createChangesetFromOps(ops);
        if (changeset.length === 0) return;

        postChanges({ changeset });
        onPersisted();
      });
    },
    drain: flushDraftsAndPersist,
    flushDraftsAndPersist,
  };
};
