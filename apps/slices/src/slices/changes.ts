import {
  action,
  insert,
  Row,
  runQuery,
  selectFrom,
  selector,
  table,
  TableDefinition,
  update,
} from "@will-be-done/hyperdb";
import { isEqual } from "es-toolkit";
import { uniq } from "es-toolkit/array";

export type Change = {
  id: string;
  tableName: string;
  createdAt: string;
  lastChangedAt: string;
  deletedAt: string | null;
  clientId: string;
  changes: Record<string, string>;
};
export const changesTable = table<Change>("changes").withIndexes({
  byId: { cols: ["id"], type: "hash" },
  byIds: { cols: ["id"], type: "btree" },
});

type GenReturn<T> = Generator<unknown, T, unknown>;
export const changesSlice = {
  byId: selector(function* (id: string): GenReturn<Change | undefined> {
    const changes = yield* runQuery(
      selectFrom(changesTable, "byId")
        .where((q) => q.eq("id", id))
        .limit(1),
    );

    return changes[0];
  }),

  insertChangeFromInsert: action(function* (
    tableDef: TableDefinition,
    row: Row,
    clientId: string,
    nextClock: () => string,
  ): GenReturn<Change> {
    const createdAt = nextClock();

    const changes: Record<string, string> = {};
    for (const col of Object.keys(row)) {
      changes[col] = createdAt;
    }

    const newChange: Change = {
      id: row.id,
      tableName: tableDef.tableName,
      deletedAt: null,
      clientId: clientId,
      changes,
      createdAt,
      lastChangedAt: createdAt,
    };

    yield* insert(changesTable, [newChange]);

    return newChange;
  }),

  insertChangeFromUpdate: action(function* (
    oldRow: Row,
    newRow: Row,
    nextClock: () => string,
  ): GenReturn<void> {
    if (oldRow.id !== newRow.id) {
      throw new Error("Cannot update row with different id");
    }

    const change = yield* changesSlice.byId(oldRow.id);
    if (!change) {
      console.error("Failed to find change", oldRow.id);

      return;
    }
    const changedAt = nextClock();
    const changedRows: Record<string, string> = change.changes;

    for (const col of uniq([...Object.keys(oldRow), ...Object.keys(newRow)])) {
      if (!isEqual(oldRow[col], newRow[col])) {
        changedRows[col] = changedAt;
      }
    }

    if (Object.keys(changedRows).length === 0) {
      return;
    }

    const newChange = {
      ...change,
      changes: changedRows,
      lastChangedAt: changedAt,
    };

    yield* insert(changesTable, [newChange]);
  }),

  insertChangeFromDelete: action(function* (
    row: Row,
    nextClock: () => string,
  ): GenReturn<void> {
    const deletedAt = nextClock();

    const change = yield* changesSlice.byId(row.id);
    if (!change) {
      console.error("Failed to find change", row.id);

      return;
    }

    yield* update(changesTable, [
      {
        ...change,
        deletedAt,
        lastChangedAt: deletedAt,
      },
    ]);
  }),
};
