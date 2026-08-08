import { selectFrom, v, type TableDefinition } from "@will-be-done/hyperdb";
import { action } from "../builders";
import {
  changeId,
  changesetArrayValidator,
  changesTable,
  mergeChanges,
  tableDefinitionArgSchema,
  type Change,
  type ChangesetArrayType,
  type PrimitiveRow,
} from "../common";
import {
  dailyEntriesTable,
  stashEntriesTable,
  type DailyEntry,
  type StashEntry,
} from "./tables";

type EntryRow = DailyEntry | StashEntry;
type IncomingData = ChangesetArrayType[number]["data"][number];
type Changeset = ChangesetArrayType[number];

const SELECT_OR_CHUNK_SIZE = 400;

const chunkArray = <T>(items: T[], chunkSize: number): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
};

const groupChangesetsByTable = (input: ChangesetArrayType) => {
  const grouped = new Map<string, Changeset>();

  for (const changeset of input) {
    const existing = grouped.get(changeset.tableName);
    if (existing) {
      existing.data.push(...changeset.data);
    } else {
      grouped.set(changeset.tableName, {
        ...changeset,
        data: [...changeset.data],
      });
    }
  }

  return [...grouped.values()];
};

export type EntryConflictResolution = {
  tableName: string;
  taskId: string;
  winnerId: string;
  loserIds: string[];
};

const loserTombstone = (
  change: Change,
  nextClock: string,
  clientId: string,
): Change => ({
  ...change,
  updatedAt: nextClock,
  deletedAt: nextClock,
  clientId,
});

const fallbackChange = (
  tableName: string,
  row: EntryRow,
  nextClock: string,
  clientId: string,
): Change => ({
  id: changeId(tableName, row.id),
  entityId: row.id,
  tableName,
  createdAt: nextClock,
  updatedAt: nextClock,
  deletedAt: null,
  clientId,
  changes: Object.fromEntries(Object.keys(row).map((key) => [key, nextClock])),
});

const compareCreation = (
  left: { id: string; createdAt: string },
  right: { id: string; createdAt: string },
) =>
  left.createdAt.localeCompare(right.createdAt) ||
  left.id.localeCompare(right.id);

/**
 * Space conflict preprocessing is effect-idempotent, just like mergeChanges:
 * replaying the same client input with a newer receipt clock must not write
 * entity or Change rows again. Resolution metadata describes conflicts newly
 * handled by this invocation and is not guaranteed to repeat on redelivery.
 */
export const mergeSpaceChanges = action({
  name: "mergeSpaceChanges",
  args: {
    input: changesetArrayValidator,
    nextClock: v.string(),
    clientId: v.string(),
    registeredSyncableTableNameMap: v.record(
      v.string(),
      tableDefinitionArgSchema,
    ),
  },
  handler: function* mergeSpaceChanges({
    input,
    nextClock,
    clientId,
    registeredSyncableTableNameMap,
  }) {
    const resolvedInput = groupChangesetsByTable(input);
    const resolutions: EntryConflictResolution[] = [];

    for (const changeset of resolvedInput) {
      const isDaily = changeset.tableName === dailyEntriesTable.tableName;
      const isStash = changeset.tableName === stashEntriesTable.tableName;
      if (!isDaily && !isStash) continue;

      const incomingEntityIds = [
        ...new Set(changeset.data.map((data) => data.change.entityId)),
      ];
      const existingRowsById: EntryRow[] = [];
      for (const entityIds of chunkArray(
        incomingEntityIds,
        SELECT_OR_CHUNK_SIZE,
      )) {
        existingRowsById.push(
          ...((isDaily
            ? yield* selectFrom(dailyEntriesTable, "byId").where((q) =>
                entityIds.map((id) => q.eq("id", id)),
              )
            : yield* selectFrom(stashEntriesTable, "byId").where((q) =>
                entityIds.map((id) => q.eq("id", id)),
              )) as EntryRow[]),
        );
      }
      const existingByEntityId = new Map(
        existingRowsById.map((row) => [row.id, row]),
      );

      // An entry identity always belongs to the task it was created for. A
      // remote update may change scheduling/order fields, but never taskId.
      for (const data of changeset.data) {
        const existingRow = existingByEntityId.get(data.change.entityId);
        if (
          data.change.deletedAt === null &&
          data.row !== undefined &&
          existingRow !== undefined &&
          data.row.taskId !== existingRow.taskId
        ) {
          data.row = { ...data.row, taskId: existingRow.taskId };
        }
      }

      const incomingLive = changeset.data.filter(
        (data): data is IncomingData & { row: PrimitiveRow } =>
          data.change.deletedAt === null &&
          data.row !== undefined &&
          typeof data.row.taskId === "string",
      );
      const taskIds = [
        ...new Set(incomingLive.map((data) => data.row.taskId as string)),
      ];
      if (taskIds.length === 0) continue;

      const existingRowsMap = new Map(
        existingRowsById.map((row) => [row.id, row]),
      );
      for (const taskIdChunk of chunkArray(taskIds, SELECT_OR_CHUNK_SIZE)) {
        const rows = (
          isDaily
            ? yield* selectFrom(dailyEntriesTable, "byTaskId").where((q) =>
                taskIdChunk.map((taskId) => q.eq("taskId", taskId)),
              )
            : yield* selectFrom(stashEntriesTable, "byTaskId").where((q) =>
                taskIdChunk.map((taskId) => q.eq("taskId", taskId)),
              )
        ) as EntryRow[];
        for (const row of rows) existingRowsMap.set(row.id, row);
      }
      const existingRows = [...existingRowsMap.values()];
      const candidateIds = [
        ...new Set([
          ...existingRows.map((row) => row.id),
          ...incomingLive.map((data) => data.change.entityId),
        ]),
      ];
      const storedChanges: Change[] = [];
      for (const entityIds of chunkArray(candidateIds, SELECT_OR_CHUNK_SIZE)) {
        storedChanges.push(
          ...((yield* selectFrom(changesTable, "byId").where((q) =>
            entityIds.map((id) =>
              q.eq("id", changeId(changeset.tableName, id)),
            ),
          )) as Change[]),
        );
      }
      const changeByEntityId = new Map(
        storedChanges.map((change) => [change.entityId, change]),
      );
      const incomingIndexesByEntityId = new Map<string, number[]>();
      const incomingDeletedEntityIds = new Set<string>();
      for (const [index, data] of changeset.data.entries()) {
        const indexes =
          incomingIndexesByEntityId.get(data.change.entityId) ?? [];
        indexes.push(index);
        incomingIndexesByEntityId.set(data.change.entityId, indexes);
        if (data.change.deletedAt !== null) {
          incomingDeletedEntityIds.add(data.change.entityId);
        }
      }

      // A tombstone is permanent. When a client retries the live version of
      // an entry that was already resolved as a loser, feed the exact stored
      // tombstone back into the merge instead of creating a newer one.
      const activeIncomingLive = incomingLive.filter((data) => {
        const storedChange = changeByEntityId.get(data.change.entityId);
        if (storedChange?.deletedAt == null) return true;

        for (const index of incomingIndexesByEntityId.get(
          data.change.entityId,
        ) ?? []) {
          changeset.data[index] = { change: storedChange };
        }
        incomingDeletedEntityIds.add(data.change.entityId);
        return false;
      });

      const candidatesByTaskId = new Map<
        string,
        Map<string, { id: string; createdAt: string }>
      >();
      for (const data of activeIncomingLive) {
        const taskId = data.row.taskId as string;
        const candidates = candidatesByTaskId.get(taskId) ?? new Map();
        const storedCreatedAt = changeByEntityId.get(
          data.change.entityId,
        )?.createdAt;
        candidates.set(data.change.entityId, {
          id: data.change.entityId,
          createdAt:
            storedCreatedAt === undefined ||
            data.change.createdAt < storedCreatedAt
              ? data.change.createdAt
              : storedCreatedAt,
        });
        candidatesByTaskId.set(taskId, candidates);
      }
      for (const row of existingRows) {
        if (incomingDeletedEntityIds.has(row.id)) continue;
        const candidates = candidatesByTaskId.get(row.taskId) ?? new Map();
        if (!candidates.has(row.id)) {
          candidates.set(row.id, {
            id: row.id,
            createdAt: changeByEntityId.get(row.id)?.createdAt ?? "",
          });
        }
        candidatesByTaskId.set(row.taskId, candidates);
      }

      for (const [taskId, candidatesMap] of candidatesByTaskId) {
        const candidates = [...candidatesMap.values()];
        if (candidates.length < 2) continue;

        const winner = candidates.reduce((latest, candidate) =>
          compareCreation(candidate, latest) > 0 ? candidate : latest,
        );
        const loserIds = candidates
          .filter((candidate) => candidate.id !== winner.id)
          .map((candidate) => candidate.id)
          .sort((left, right) => left.localeCompare(right));

        for (const loserId of loserIds) {
          const incomingIndexes = incomingIndexesByEntityId.get(loserId);
          if (incomingIndexes) {
            const storedTombstone = changeByEntityId.get(loserId);
            for (const index of incomingIndexes) {
              const incoming = changeset.data[index]!;
              changeset.data[index] = {
                change:
                  storedTombstone?.deletedAt != null
                    ? storedTombstone
                    : loserTombstone(
                        incoming.change as Change,
                        nextClock,
                        clientId,
                      ),
              };
            }
            continue;
          }

          const existingRow = existingRowsMap.get(loserId);
          if (!existingRow) continue;
          const currentChange =
            changeByEntityId.get(loserId) ??
            fallbackChange(
              changeset.tableName,
              existingRow,
              nextClock,
              clientId,
            );
          changeset.data.push({
            change: loserTombstone(currentChange, nextClock, clientId),
          });
        }

        resolutions.push({
          tableName: changeset.tableName,
          taskId,
          winnerId: winner.id,
          loserIds,
        });
      }
    }

    yield* mergeChanges({
      input: resolvedInput,
      nextClock,
      clientId,
      registeredSyncableTableNameMap: registeredSyncableTableNameMap as Record<
        string,
        TableDefinition
      >,
    });

    return resolutions;
  },
});
