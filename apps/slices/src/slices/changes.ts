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
import { z } from "zod";
import { groupBy } from "es-toolkit";
import { syncableTablesMap } from "../stores";

export type Change = {
  id: string;
  tableName: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  clientId: string;
  changes: Record<string, string>;
};
export const changesTable = table<Change>("changes").withIndexes({
  byId: { cols: ["id"], type: "hash" },
  byIds: { cols: ["id"], type: "btree" },
  byUpdatedAt: { cols: ["updatedAt"], type: "btree" },
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
  allChangesAfter: selector(function* (after: string): GenReturn<Change[]> {
    return yield* runQuery(
      selectFrom(changesTable, "byUpdatedAt").where((q) =>
        q.gt("updatedAt", after),
      ),
    );
  }),
  getChangesetAfter: selector(function* (
    after: string,
  ): GenReturn<{ changesets: ChangesetArrayType; maxClock: string }> {
    const changesToSend = yield* changesSlice.allChangesAfter(after);
    const changesets: ChangesetArrayType = [];
    let maxClock = "";

    if (changesToSend.length === 0) {
      return { changesets: [], maxClock };
    }

    for (const c of changesToSend) {
      if (c.updatedAt > maxClock) {
        maxClock = c.updatedAt;
      }
    }

    const groupedChanges = groupBy(changesToSend, (c) => c.tableName);

    for (const [tableName, changes] of Object.entries(groupedChanges)) {
      const table = syncableTablesMap[tableName];
      if (!table) {
        console.error("Unknown table, skipping sync for it", tableName);
        continue;
      }

      const rows = yield* runQuery(
        selectFrom(table, "byId").where((q) =>
          changes.map((c) => q.eq("id", c.id)),
        ),
      );
      const rowsMap = new Map(rows.map((r) => [r.id, r]));

      const data = changes
        .map((c) => {
          const row = rowsMap.get(c.id);

          if (!row) {
            if (c.deletedAt == null) {
              console.error(
                "failed to find row for not deleted change, skipping sync",
                c,
              );

              return undefined;
            }

            return { change: c };
          }

          return {
            row: row,
            change: c,
          };
        })
        .filter((c) => c != undefined);

      changesets.push({
        tableName,
        data,
      });
    }

    return { changesets, maxClock };
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
      updatedAt: createdAt,
    };

    yield* insert(changesTable, [newChange]);

    return newChange;
  }),

  insertChangeFromUpdate: action(function* (
    tableDef: TableDefinition,
    oldRow: Row,
    newRow: Row,
    clientId: string,
    nextClock: () => string,
  ): GenReturn<void> {
    if (oldRow.id !== newRow.id) {
      throw new Error("Cannot update row with different id");
    }

    const updatedAt = nextClock();
    const change: Change =
      (yield* changesSlice.byId(oldRow.id)) ||
      ({
        id: oldRow.id,
        tableName: tableDef.tableName,
        createdAt: updatedAt,
        updatedAt: updatedAt,
        deletedAt: null,
        clientId: clientId,
        changes: {},
      } satisfies Change);
    const changedRows: Record<string, string> = change.changes;

    for (const col of uniq([...Object.keys(oldRow), ...Object.keys(newRow)])) {
      if (!isEqual(oldRow[col], newRow[col])) {
        changedRows[col] = updatedAt;
      }
    }

    if (Object.keys(changedRows).length === 0) {
      return;
    }

    const newChange: Change = {
      ...change,
      changes: changedRows,
      updatedAt: updatedAt,
    };

    yield* insert(changesTable, [newChange]);
  }),

  insertChangeFromDelete: action(function* (
    tableDef: TableDefinition,
    row: Row,
    clientId: string,
    nextClock: () => string,
  ): GenReturn<void> {
    const deletedAt = nextClock();

    const change = (yield* changesSlice.byId(row.id)) || {
      id: row.id,
      tableName: tableDef.tableName,
      createdAt: deletedAt,
      updatedAt: deletedAt,
      deletedAt: null,
      clientId: clientId,
      changes: {},
    };

    yield* update(changesTable, [
      {
        ...change,
        deletedAt,
        updatedAt: deletedAt,
      },
    ]);
  }),
};

const row = z.intersection(
  z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.null()]),
  ),
  z.object({
    id: z.string(),
  }),
);

// const row = z.union([
//   z.record(z.intersection([z.string(), z.number(), z.boolean(), z.null()])),
//   z.object({ id: z.string() }),
// ]);
export const Changeset = z.object({
  tableName: z.string(),
  data: z.array(
    z.object({
      row: row.optional(),
      change: z.object({
        id: z.string(),
        tableName: z.string(),
        deletedAt: z.string().nullable(),
        clientId: z.string(),
        changes: z.record(z.string()),
        createdAt: z.string(),
        updatedAt: z.string(),
      }),
    }),
  ),
});
export type ChangesetType = z.input<typeof Changeset>;
export const ChangesetArray = z.array(Changeset);
export type ChangesetArrayType = z.input<typeof ChangesetArray>;
