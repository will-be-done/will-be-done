import {
  deleteRows,
  insert,
  Row,
  selectFrom,
  TableDefinition,
  upsert,
  type Validator,
  v,
} from "@will-be-done/hyperdb";
import { action, selector } from "../builders";
import { isEqual } from "es-toolkit";
import { uniq } from "es-toolkit/array";
import { z } from "zod";
import { groupBy } from "es-toolkit";
import { changesTable, type Change } from "./tables";

export { changesTable, type Change } from "./tables";

export type PrimitiveRow = Record<string, string | number | boolean | null> & {
  id: string;
};

const SELECT_OR_CHUNK_SIZE = 400;
export const changeId = (tableName: string, entityId: string): string =>
  `${tableName}:${entityId}`;
const primitiveValueSchema = v.union(
  v.string(),
  v.number(),
  v.boolean(),
  v.null(),
);
const rowSchema = v.record(
  v.string(),
  primitiveValueSchema,
) as Validator<PrimitiveRow>;
export const tableDefinitionArgSchema = v.object({
  tableName: v.string(),
});
const changeSchema = v.object({
  id: v.string(),
  entityId: v.string(),
  tableName: v.string(),
  deletedAt: v.union(v.string(), v.null()),
  clientId: v.string(),
  changes: v.record(v.string(), v.string()),
  createdAt: v.string(),
  updatedAt: v.string(),
});
export const changesetArrayValidator = v.array(
  v.object({
    tableName: v.string(),
    data: v.array(
      v.object({
        row: v.optional(rowSchema),
        change: changeSchema,
      }),
    ),
  }),
);

const chunkArray = <T>(items: T[], chunkSize: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
};

const getChangeByEntityAndTableName = selector({
  name: "getChangeByEntityAndTableName",
  args: {
    entityId: v.string(),
    tableName: v.string(),
  },
  handler: function* getChangeByEntityAndTableName({ entityId, tableName }) {
    return (yield* selectFrom(changesTable, "byId")
      .where((q) => q.eq("id", changeId(tableName, entityId)))
      .first()) as Change | undefined;
  },
});

const allChangesAfter = selector({
  name: "allChangesAfter",
  args: { after: v.string() },
  handler: function* allChangesAfter({ after }) {
    return (yield* selectFrom(changesTable, "byUpdatedAt").where((q) =>
      q.gt("updatedAt", after),
    )) as Change[];
  },
});

export const getChangesetAfter = selector({
  name: "getChangesetAfter",
  args: {
    after: v.string(),
    registeredSyncableTableNameMap: v.record(
      v.string(),
      tableDefinitionArgSchema,
    ),
  },
  handler: function* getChangesetAfter({
    after,
    registeredSyncableTableNameMap,
  }) {
    const allChangesToSend = yield* allChangesAfter({ after });
    const changesets: ChangesetArrayType = [];
    let maxClock = "";

    for (const c of allChangesToSend) {
      if (c.updatedAt > maxClock) {
        maxClock = c.updatedAt;
      }
    }

    if (allChangesToSend.length === 0) {
      return { changesets: [], maxClock };
    }

    const groupedChanges = groupBy(allChangesToSend, (c) => c.tableName);

    for (const [tableName, changes] of Object.entries(groupedChanges)) {
      const table = registeredSyncableTableNameMap[tableName] as
        | TableDefinition
        | undefined;
      if (!table) {
        console.error("Unknown table, skipping sync for it", tableName);
        continue;
      }

      const rows: Row[] = [];
      for (const changesChunk of chunkArray(changes, SELECT_OR_CHUNK_SIZE)) {
        rows.push(
          ...(yield* selectFrom(table, "byId").where((q) =>
            changesChunk.map((c) => q.eq("id", c.entityId)),
          )),
        );
      }
      const rowsMap = new Map(rows.map((r) => [r.id, r]));

      const data = changes
        .map((c) => {
          const row = rowsMap.get(c.entityId);

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
            row: row as PrimitiveRow,
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
  },
});

export const insertChangeFromInsert = action({
  name: "insertChangeFromInsert",
  args: {
    tableDef: tableDefinitionArgSchema,
    row: rowSchema,
    clientId: v.string(),
    nextClock: v.string(),
  },
  handler: function* insertChangeFromInsert({
    tableDef,
    row,
    clientId,
    nextClock,
  }) {
    const createdAt = nextClock;

    const changes: Record<string, string> = {};
    for (const col of Object.keys(row)) {
      changes[col] = createdAt;
    }

    const newChange: Change = {
      id: changeId(tableDef.tableName, row.id),
      entityId: row.id,
      tableName: tableDef.tableName,
      deletedAt: null,
      clientId: clientId,
      changes,
      createdAt,
      updatedAt: createdAt,
    };

    yield* upsert(changesTable, [newChange]);

    return newChange;
  },
});

export const insertChangeFromUpdate = action({
  name: "insertChangeFromUpdate",
  args: {
    tableDef: tableDefinitionArgSchema,
    oldRow: rowSchema,
    newRow: rowSchema,
    clientId: v.string(),
    nextClock: v.string(),
  },
  handler: function* insertChangeFromUpdate({
    tableDef,
    oldRow,
    newRow,
    clientId,
    nextClock,
  }) {
    if (oldRow.id !== newRow.id) {
      throw new Error("Cannot update row with different id");
    }

    const updatedAt = nextClock;
    const change: Change =
      (yield* getChangeByEntityAndTableName({
        entityId: oldRow.id,
        tableName: tableDef.tableName,
      })) ||
      ({
        id: changeId(tableDef.tableName, oldRow.id),
        entityId: oldRow.id,
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
      return undefined as Change | undefined;
    }

    const newChange: Change = {
      ...change,
      changes: changedRows,
      updatedAt: updatedAt,
    };

    yield* upsert(changesTable, [newChange]);

    return newChange as Change | undefined;
  },
});

export const insertChangeFromDelete = action({
  name: "insertChangeFromDelete",
  args: {
    tableDef: tableDefinitionArgSchema,
    row: rowSchema,
    clientId: v.string(),
    nextClock: v.string(),
  },
  handler: function* insertChangeFromDelete({
    tableDef,
    row,
    clientId,
    nextClock,
  }) {
    const deletedAt = nextClock;

    const change = (yield* getChangeByEntityAndTableName({
      entityId: row.id,
      tableName: tableDef.tableName,
    })) || {
      id: changeId(tableDef.tableName, row.id),
      entityId: row.id,
      tableName: tableDef.tableName,
      createdAt: deletedAt,
      updatedAt: deletedAt,
      deletedAt: null,
      clientId: clientId,
      changes: {},
    };

    const deletedChange: Change = {
      ...change,
      deletedAt,
      updatedAt: deletedAt,
    };

    yield* upsert(changesTable, [deletedChange]);

    return deletedChange;
  },
});

/**
 * Merges must be idempotent. Reapplying the same client changes, even with a
 * newer receipt clock, must not write entity rows or Change rows again.
 * `nextClock` stamps newly converged state; it must not make a replay a change.
 */
export const mergeChanges = action({
  name: "mergeChangesAction",
  args: {
    input: changesetArrayValidator,
    nextClock: v.string(),
    clientId: v.string(),
    registeredSyncableTableNameMap: v.record(
      v.string(),
      tableDefinitionArgSchema,
    ),
  },
  handler: function* mergeChanges({
    input,
    nextClock,
    registeredSyncableTableNameMap,
  }) {
    for (const changeset of input) {
      const table = registeredSyncableTableNameMap[changeset.tableName] as
        | TableDefinition
        | undefined;
      if (!table) {
        throw new Error("Unknown table: " + changeset.tableName);
      }

      const currentChanges: Change[] = [];
      for (const dataChunk of chunkArray(
        changeset.data,
        SELECT_OR_CHUNK_SIZE,
      )) {
        currentChanges.push(
          ...((yield* selectFrom(changesTable, "byId").where((q) =>
            dataChunk.map((c) =>
              q.eq("id", changeId(changeset.tableName, c.change.entityId)),
            ),
          )) as Change[]),
        );
      }
      const currentChangesMap = new Map(
        currentChanges.map((c) => [c.entityId, c as Change]),
      );
      const originalChangesMap = new Map(currentChangesMap);

      const currentRows: Row[] = [];
      for (const dataChunk of chunkArray(
        changeset.data,
        SELECT_OR_CHUNK_SIZE,
      )) {
        currentRows.push(
          ...(yield* selectFrom(table, "byId").where((q) =>
            dataChunk.map((c) => q.eq("id", c.change.entityId)),
          )),
        );
      }
      const currentRowsMap = new Map(currentRows.map((r) => [r.id, r]));
      const originalRowsMap = new Map(currentRowsMap);
      const touchedEntityIds = new Set<string>();

      for (const {
        change: incomingChange,
        row: incomingRow,
      } of changeset.data) {
        touchedEntityIds.add(incomingChange.entityId);
        const currentChanges = currentChangesMap.get(incomingChange.entityId);
        const currentRow = currentRowsMap.get(incomingChange.entityId);

        // First-creator-wins: when both sides created the same entity,
        // the earlier creator's values always take precedence
        if (
          currentChanges != null &&
          currentRow != null &&
          incomingRow != null &&
          incomingChange.deletedAt == null &&
          currentChanges.deletedAt == null &&
          currentChanges.createdAt !== incomingChange.createdAt
        ) {
          const currentCreatedFirst =
            currentChanges.createdAt <= incomingChange.createdAt;

          // Winner's fields overwrite loser's (spread winner second)
          const winnerRow = currentCreatedFirst
            ? currentRow
            : (incomingRow as Row);
          const loserRow = currentCreatedFirst
            ? (incomingRow as Row)
            : currentRow;
          const winnerChanges = currentCreatedFirst
            ? currentChanges.changes
            : incomingChange.changes;
          const loserChanges = currentCreatedFirst
            ? incomingChange.changes
            : currentChanges.changes;

          const fcwMergedChanges = { ...loserChanges, ...winnerChanges };
          const fcwMergedRow = { ...loserRow, ...winnerRow } as Row;
          const currentClock = nextClock;
          const mergedChange: Change = {
            id: changeId(table.tableName, incomingChange.entityId),
            entityId: incomingChange.entityId,
            tableName: table.tableName,
            createdAt: currentCreatedFirst
              ? currentChanges.createdAt
              : incomingChange.createdAt,
            updatedAt: currentClock,
            deletedAt: null,
            clientId: currentCreatedFirst
              ? currentChanges.clientId
              : incomingChange.clientId,
            changes: fcwMergedChanges,
          };

          if (
            isSameMergedState(
              currentChanges,
              currentRow,
              mergedChange,
              fcwMergedRow,
              false,
            )
          ) {
            continue;
          }

          currentRowsMap.set(incomingChange.entityId, fcwMergedRow);
          currentChangesMap.set(incomingChange.entityId, mergedChange);

          continue; // Skip normal LWW merge
        }

        const { mergedChanges, mergedRow } = lwwMerge(
          currentChanges?.changes ?? {},
          incomingChange.changes,
          currentRow ?? { id: incomingChange.entityId },
          incomingRow ?? { id: incomingChange.entityId },
        );

        const currentDeletedAt = currentChanges?.deletedAt ?? null;
        const incomingDeletedAt = incomingChange.deletedAt;
        const isDeleted = currentDeletedAt != null || incomingDeletedAt != null;

        const currentClock = nextClock;
        const lastDeletedAt =
          currentDeletedAt == null
            ? incomingDeletedAt
            : incomingDeletedAt == null
              ? currentDeletedAt
              : currentDeletedAt > incomingDeletedAt
                ? currentDeletedAt
                : incomingDeletedAt;
        const incomingDeleteWins =
          incomingDeletedAt != null &&
          (currentDeletedAt == null ||
            incomingDeletedAt > currentDeletedAt ||
            (incomingDeletedAt === currentDeletedAt &&
              incomingChange.clientId >
                (currentChanges?.clientId ?? incomingChange.clientId)));
        const incomingStateWins =
          currentChanges === undefined ||
          !isEqual(currentChanges.changes, mergedChanges) ||
          !isEqual(currentRow, mergedRow);
        const winnerClientId =
          isDeleted && !incomingDeleteWins
            ? (currentChanges?.clientId ?? incomingChange.clientId)
            : isDeleted || incomingStateWins
              ? incomingChange.clientId
              : currentChanges.clientId;
        const mergedCreatedAt =
          currentChanges == null ||
          incomingChange.createdAt < currentChanges.createdAt
            ? incomingChange.createdAt
            : currentChanges.createdAt;

        const mergedChange: Change = {
          id: changeId(table.tableName, incomingChange.entityId),
          entityId: incomingChange.entityId,
          tableName: table.tableName,
          createdAt: mergedCreatedAt,
          updatedAt: currentClock,
          deletedAt: lastDeletedAt,
          clientId: winnerClientId,
          changes: mergedChanges,
        };
        if (
          isSameMergedState(
            currentChanges,
            currentRow,
            mergedChange,
            mergedRow,
            isDeleted,
          )
        ) {
          continue;
        }

        // A tombstone is permanent: deleted IDs cannot be reused.
        if (isDeleted) {
          currentRowsMap.delete(incomingChange.entityId);
        } else {
          currentRowsMap.set(incomingChange.entityId, mergedRow);
        }
        currentChangesMap.set(incomingChange.entityId, mergedChange);
      }

      const toDeleteRows: string[] = [];
      const toUpdateRows: Row[] = [];
      const toInsertRows: Row[] = [];
      const changesToUpsert: Change[] = [];
      for (const entityId of touchedEntityIds) {
        const originalRow = originalRowsMap.get(entityId);
        const finalRow = currentRowsMap.get(entityId);
        if (originalRow !== undefined && finalRow === undefined) {
          toDeleteRows.push(entityId);
        } else if (originalRow === undefined && finalRow !== undefined) {
          toInsertRows.push(finalRow);
        } else if (
          originalRow !== undefined &&
          finalRow !== undefined &&
          !isEqual(originalRow, finalRow)
        ) {
          toUpdateRows.push(finalRow);
        }

        const finalChange = currentChangesMap.get(entityId);
        if (
          finalChange !== undefined &&
          !isSameMergedState(
            originalChangesMap.get(entityId),
            originalRow,
            finalChange,
            finalRow ?? { id: entityId },
            finalChange.deletedAt !== null,
          )
        ) {
          changesToUpsert.push(finalChange);
        }
      }

      yield* deleteRows(table, toDeleteRows);
      yield* insert(table, toInsertRows);
      yield* upsert(table, toUpdateRows);
      yield* upsert(changesTable, changesToUpsert);
    }
  },
});

const isSameMergedState = (
  currentChange: Change | undefined,
  currentRow: Row | undefined,
  mergedChange: Change,
  mergedRow: Row,
  isDeleted: boolean,
): boolean =>
  // Receipt metadata must not turn an already-converged merge into a change.
  (isDeleted ? currentRow === undefined : isEqual(currentRow, mergedRow)) &&
  currentChange !== undefined &&
  currentChange.createdAt === mergedChange.createdAt &&
  currentChange.deletedAt === mergedChange.deletedAt &&
  currentChange.clientId === mergedChange.clientId &&
  isEqual(currentChange.changes, mergedChange.changes);

const lwwMerge = (
  aChange: Record<string, string>,
  bChange: Record<string, string>,
  aRow: Row,
  bRow: Row,
): { mergedChanges: Record<string, string>; mergedRow: Row } => {
  const mergedChanges: Record<string, string> = {};
  const primitiveARow = aRow as PrimitiveRow;
  const primitiveBRow = bRow as PrimitiveRow;
  // Start with aRow as the base. Unchanged fields will be preserved.
  const mergedRow: PrimitiveRow = {
    ...primitiveARow,
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
        winningValue = primitiveARow[key]!;
      } else {
        // B is the winner (or they are equal, B wins the tie)
        winningTimestamp = changeTimestampB;
        winningValue = primitiveBRow[key]!;
      }
    } else if (changeTimestampA !== undefined) {
      // --- Key was only changed in A ---
      winningTimestamp = changeTimestampA;
      winningValue = primitiveARow[key]!;
    } else {
      // --- Key was only changed in B ---
      // We can assert changeTimestampB is not undefined here.
      winningTimestamp = changeTimestampB!;
      winningValue = primitiveBRow[key]!;
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

export const Changeset = z.object({
  tableName: z.string(),
  data: z.array(
    z.object({
      row: row.optional(),
      change: z.object({
        id: z.string(),
        entityId: z.string(),
        tableName: z.string(),
        deletedAt: z.string().nullable(),
        clientId: z.string(),
        changes: z.record(z.string(), z.string()),
        createdAt: z.string(),
        updatedAt: z.string(),
      }),
    }),
  ),
});
export type ChangesetType = z.input<typeof Changeset>;
export const ChangesetArray = z.array(Changeset);
export type ChangesetArrayType = z.input<typeof ChangesetArray>;
