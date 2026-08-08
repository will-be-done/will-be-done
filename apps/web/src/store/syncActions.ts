import { deleteRows, selectFrom, upsert, v } from "@will-be-done/hyperdb";
import {
  changesTable,
  type Change,
  getChangesetAfter,
  getSyncStateOrDefault,
  updateSyncState,
} from "@will-be-done/slices/common";
import { action } from "./builders";
import {
  changesetArraySchema,
  syncableTableNameMapSchema,
} from "./syncValidators";

export const createApplyServerChangesIfNoClientChanges = (
  nextClock: () => string,
) =>
  action({
    name: "applyServerChangesIfNoClientChanges",
    args: {
      registeredSyncableTableNameMap: syncableTableNameMapSchema,
      syncState: v.object({
        lastSentClock: v.string(),
      }),
      serverChanges: v.object({
        changesets: changesetArraySchema,
        maxClock: v.string(),
      }),
      clientId: v.string(),
    },
    handler: function* applyServerChangesIfNoClientChanges({
      registeredSyncableTableNameMap,
      syncState,
      serverChanges,
      clientId,
    }) {
      const { changesets } = yield* getChangesetAfter({
        after: syncState.lastSentClock,
        registeredSyncableTableNameMap,
      });
      if (changesets.length !== 0) {
        console.warn(
          "some new client changes appeared, skipping server changes apply",
        );

        return;
      }

      const allChanges: Change[] = [];

      let maxNewClientClock = "";

      for (const changeset of serverChanges.changesets) {
        const toDeleteRows: string[] = [];
        const toUpsertRows: { id: string; [key: string]: unknown }[] = [];

        const table = registeredSyncableTableNameMap[changeset.tableName];
        if (!table) {
          throw new Error("Unknown table: " + changeset.tableName);
        }

        for (const { change, row } of changeset.data) {
          if (change.deletedAt != null) {
            toDeleteRows.push(change.entityId);
          } else if (row) {
            toUpsertRows.push(row);
          }

          const currentClock = nextClock();

          if (currentClock > maxNewClientClock) {
            maxNewClientClock = currentClock;
          }

          allChanges.push({
            id: change.id,
            entityId: change.entityId,
            tableName: table.tableName,
            // TODO: use local createdAt value. Or maybe not?
            createdAt: change.createdAt,
            updatedAt: currentClock,
            deletedAt: change.deletedAt,
            clientId,
            changes: change.changes,
          });
        }

        yield* deleteRows(table, toDeleteRows);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        yield* upsert(table, toUpsertRows as any);
      }

      yield* upsert(changesTable, allChanges);

      yield* updateSyncState({
        updates: {
          lastServerAppliedClock: serverChanges.maxClock,
          lastSentClock: maxNewClientClock,
        },
      });
    },
  });

export const getChangesToSendToServer = action({
  name: "getChangesToSendToServer",
  args: {
    registeredSyncableTableNameMap: syncableTableNameMapSchema,
  },
  handler: function* getChangesToSendToServer({
    registeredSyncableTableNameMap,
  }) {
    const currentSyncState = yield* getSyncStateOrDefault({});

    const { changesets, maxClock } = yield* getChangesetAfter({
      after: currentSyncState.lastSentClock,
      registeredSyncableTableNameMap,
    });

    return { changesets, maxClock };
  },
});

export const resetEmptyPersistedSyncCursor = action({
  name: "resetEmptyPersistedSyncCursor",
  args: {},
  handler: function* resetEmptyPersistedSyncCursor() {
    const currentSyncState = yield* getSyncStateOrDefault({});
    if (
      currentSyncState.lastServerAppliedClock === "" &&
      currentSyncState.lastSentClock === ""
    ) {
      return false;
    }

    const persistedChanges = yield* selectFrom(
      changesTable,
      "byUpdatedAt",
    ).limit(1);
    if (persistedChanges.length !== 0) {
      return false;
    }

    yield* updateSyncState({
      updates: {
        lastServerAppliedClock: "",
        lastSentClock: "",
      },
    });

    return true;
  },
});
