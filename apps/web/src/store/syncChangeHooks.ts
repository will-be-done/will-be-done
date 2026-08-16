import {
  noop,
  type SubscribableDB,
  type TableDefinition,
} from "@will-be-done/hyperdb";
import {
  changesTable,
  insertChangeFromDelete,
  insertChangeFromInsert,
  insertChangeFromUpdate,
  getLatestChangeCursor,
  type HlcClock,
  type PrimitiveRow,
} from "@will-be-done/slices/common";

type RegisterSyncChangeHooksArgs = {
  syncSubDb: SubscribableDB;
  syncableDBTables: TableDefinition[];
  clientId: string;
  nextClock: HlcClock;
};

export const registerSyncChangeHooks = ({
  syncSubDb,
  syncableDBTables,
  clientId,
  nextClock,
}: RegisterSyncChangeHooksArgs) => {
  const syncableTables = new Set(syncableDBTables);
  const shouldTrack = (table: TableDefinition, traits: { type: string }[]) =>
    table !== changesTable &&
    syncableTables.has(table) &&
    !traits.some((t) => t.type === "skip-sync");

  syncSubDb.afterInsert(function* (db, table, traits, ops) {
    if (!shouldTrack(table, traits)) {
      return;
    }

    const latest = yield* getLatestChangeCursor({});
    nextClock.observe([latest?.clock]);
    for (const op of ops) {
      yield* insertChangeFromInsert({
        tableDef: op.table,
        row: op.newValue as PrimitiveRow,
        clientId,
        nextClock: nextClock(),
      });
    }

    yield* noop();
  });

  syncSubDb.afterUpsert(function* (db, table, traits, ops) {
    if (!shouldTrack(table, traits)) {
      return;
    }

    const latest = yield* getLatestChangeCursor({});
    nextClock.observe([latest?.clock]);
    for (const op of ops) {
      if (!op.oldValue) {
        yield* insertChangeFromInsert({
          tableDef: op.table,
          row: op.newValue as PrimitiveRow,
          clientId,
          nextClock: nextClock(),
        });
        continue;
      }

      yield* insertChangeFromUpdate({
        tableDef: op.table,
        oldRow: op.oldValue as PrimitiveRow,
        newRow: op.newValue as PrimitiveRow,
        clientId,
        nextClock: nextClock(),
      });
    }

    yield* noop();
  });

  syncSubDb.afterDelete(function* (db, table, traits, ops) {
    if (!shouldTrack(table, traits)) {
      return;
    }

    const latest = yield* getLatestChangeCursor({});
    nextClock.observe([latest?.clock]);
    for (const op of ops) {
      yield* insertChangeFromDelete({
        tableDef: op.table,
        row: op.oldValue as PrimitiveRow,
        clientId,
        nextClock: nextClock(),
      });
    }

    yield* noop();
  });
};
