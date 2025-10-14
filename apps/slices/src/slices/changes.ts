import {
  action,
  deleteRows,
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
import { AppSyncableModel, syncableTablesMap } from "./maps";

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
      const table = syncableTablesMap()[tableName];
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

    yield* insert(changesTable, [
      {
        ...change,
        deletedAt,
        updatedAt: deletedAt,
      },
    ]);
  }),

  mergeChanges: action(function* (
    input: ChangesetArrayType,
    nextClock: () => string,
    clientId: string,
  ) {
    const allChanges: Change[] = [];

    for (const changeset of input) {
      const toDeleteRows: string[] = [];
      const toUpdateRows: AppSyncableModel[] = [];
      const toInsertRows: AppSyncableModel[] = [];

      const table = syncableTablesMap()[changeset.tableName];
      if (!table) {
        throw new Error("Unknown table: " + changeset.tableName);
      }

      const currentChanges = yield* runQuery(
        selectFrom(changesTable, "byId").where((q) =>
          changeset.data.map((c) => q.eq("id", c.change.id)),
        ),
      );
      const currentChangesMap = new Map(currentChanges.map((c) => [c.id, c]));

      const currentRows = yield* runQuery(
        selectFrom(table, "byId").where((q) =>
          changeset.data.map((c) => q.eq("id", c.change.id)),
        ),
      );
      const currentRowsMap = new Map(currentRows.map((r) => [r.id, r]));

      for (const {
        change: incomingChange,
        row: incomingRow,
      } of changeset.data) {
        const currentChanges = currentChangesMap.get(incomingChange.id);
        const currentRow = currentRowsMap.get(incomingChange.id);

        const { mergedChanges, mergedRow } = mergeChanges(
          currentChanges?.changes ?? {},
          incomingChange.changes,
          currentRow ?? { id: incomingChange.id },
          incomingRow ?? { id: incomingChange.id },
        );

        // Delete always wins, no conflict resolution needed actually
        if (incomingChange.deletedAt != null) {
          if (currentRow) {
            toDeleteRows.push(currentRow.id);
          }
        } else if (currentRow) {
          toUpdateRows.push(mergedRow as AppSyncableModel);
        } else {
          toInsertRows.push(mergedRow as AppSyncableModel);
        }

        const currentClock = nextClock();
        const lastDeletedAt = (function () {
          // TODO: maybe compare time too instead of reussrection?
          if (incomingChange.deletedAt == null) {
            return null; // resurrection!
          }

          if (currentChanges && currentChanges.deletedAt) {
            return currentChanges.deletedAt;
          }

          if (incomingChange.deletedAt != null) {
            return currentClock;
          }

          return null;
        })();

        allChanges.push({
          id: incomingChange.id,
          tableName: table.tableName,
          createdAt: currentChanges?.createdAt ?? currentClock,
          updatedAt: currentClock,
          deletedAt: lastDeletedAt,
          clientId: clientId,
          changes: mergedChanges,
        });
      }

      yield* insert(table, toInsertRows);
      yield* update(table, toUpdateRows);
      yield* deleteRows(table, toDeleteRows);
    }

    console.log("changes to persist after merge", allChanges);

    yield* insert(changesTable, allChanges);
  }),
};

const mergeChanges = (
  aChange: Record<string, string>,
  bChange: Record<string, string>,
  aRow: Row,
  bRow: Row,
): { mergedChanges: Record<string, string>; mergedRow: Row } => {
  const mergedChanges: Record<string, string> = {};
  // Start with aRow as the base. Unchanged fields will be preserved.
  const mergedRow: Record<string, string | number | boolean | null> = {
    ...aRow,
  };

  // Get all unique keys from both change objects
  const allKeys = new Set([...Object.keys(aChange), ...Object.keys(bChange)]);

  for (const key of allKeys) {
    const changeTimestampA = aChange[key];
    const changeTimestampB = bChange[key];

    let winningTimestamp: string;
    let winningValue: string | number | boolean | null;

    if (changeTimestampA !== undefined && changeTimestampB !== undefined) {
      // --- Conflict: The key was changed in both branches ---
      // Compare the timestamps to find the winner.
      if (changeTimestampA > changeTimestampB) {
        // A is the winner
        winningTimestamp = changeTimestampA;
        winningValue = aRow[key]!;
      } else {
        // B is the winner (or they are equal, B wins the tie)
        winningTimestamp = changeTimestampB;
        winningValue = bRow[key]!;
      }
    } else if (changeTimestampA !== undefined) {
      // --- Key was only changed in A ---
      winningTimestamp = changeTimestampA;
      winningValue = aRow[key]!;
    } else {
      // --- Key was only changed in B ---
      // We can assert changeTimestampB is not undefined here.
      winningTimestamp = changeTimestampB!;
      winningValue = bRow[key]!;
    }

    // Update the merged results with the winning data
    mergedChanges[key] = winningTimestamp;
    mergedRow[key] = winningValue;
  }

  return { mergedChanges, mergedRow: mergedRow as Row };
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
