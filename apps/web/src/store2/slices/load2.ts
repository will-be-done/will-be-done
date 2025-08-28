import SQLiteAsyncESMFactory from "wa-sqlite/dist/wa-sqlite-async.mjs";
import { nanoid } from "nanoid";
import {
  action,
  asyncDispatch,
  AsyncSqlDriver,
  BptreeInmemDriver,
  DB,
  execAsync,
  execSync,
  HyperDB,
  HyperDBTx,
  insert,
  Row,
  runQuery,
  runSelectorAsync,
  selectFrom,
  selector,
  SubscribableDB,
  syncDispatch,
  table,
  TableDefinition,
  update,
} from "@will-be-done/hyperdb";
import AwaitLock from "await-lock";
import asyncSqlWasmUrl from "wa-sqlite/dist/wa-sqlite-async.wasm?url";
//@ts-expect-error no declarations
import { IDBBatchAtomicVFS } from "wa-sqlite/src/examples/IDBBatchAtomicVFS.js";
import { projectsSlice2, tables } from "./store";
import * as SQLite from "wa-sqlite";
import { DBCmd } from "@will-be-done/hyperdb/src/hyperdb/generators";
import { isEqual, uniq } from "es-toolkit";

const initClock = (clientId: string) => {
  let now = Date.now();
  let n = 0;

  return () => {
    const newNow = Date.now();

    if (newNow === now) {
      n++;
    } else if (newNow > now) {
      now = newNow;
      n = 0;
    }

    return `${now}-${n.toString().padStart(4, "0")}-${clientId}`;
  };
};

const getClientId = () => {
  const id = localStorage.getItem("clientId");

  if (id) return id;

  const newId = nanoid();
  localStorage.setItem("clientId", newId);

  return newId;
};

async function initAsyncDriver() {
  const module = await SQLiteAsyncESMFactory({
    locateFile: () => asyncSqlWasmUrl,
  });

  const sqlite3 = SQLite.Factory(module);

  const vfs = await IDBBatchAtomicVFS.create("my-db", module);
  sqlite3.vfs_register(vfs, true);

  const db = await sqlite3.open_v2("test-db");

  await sqlite3.exec(db, `PRAGMA cache_size=5000;`);
  await sqlite3.exec(db, `PRAGMA journal_mode=DELETE;`);

  window.execQuery = async (q: string) => {
    const res: unknown[] = [];
    for await (const stmt of sqlite3.statements(db, q)) {
      while ((await sqlite3.step(stmt)) === SQLite.SQLITE_ROW) {
        const row = sqlite3.row(stmt);
        const record = JSON.parse(row[0] as string) as unknown;
        res.push(record);
      }
    }

    return res;
  };

  return new AsyncSqlDriver(sqlite3, db);
}

type Change = {
  id: string;
  tableName: string;
  createdAt: string;
  lastChangedAt: string;
  deletedAt: string | null;
  clientId: string;
  changes: Record<string, string>;
};
const changesTable = table<Change>("changes").withIndexes({
  byId: { cols: ["id"], type: "hash" },
  byIds: { cols: ["id"], type: "btree" },
});

type GenReturn<T> = Generator<unknown, T, unknown>;
const changesSlice = {
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
      clientId: getClientId(),
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

const lock = new AwaitLock();
let initedDb: SubscribableDB | null = null;
export const initDbStore2 = async (): Promise<SubscribableDB> => {
  await lock.acquireAsync();
  try {
    if (initedDb) {
      return initedDb;
    }
    const asyncDriver = await initAsyncDriver();
    const asyncDB = new DB(asyncDriver);

    await execAsync(
      asyncDB.loadTables([...tables.map((t) => t.table), changesTable]),
    );

    const syncDB = new DB(new BptreeInmemDriver());
    execSync(syncDB.loadTables(tables.map((t) => t.table)));
    const syncSubDb = new SubscribableDB(syncDB);

    // TODO: next
    // 1. Develop new sync protocol that will track changes in db
    //    maybe just track last change of each column?
    // the algo is such:
    // 1. get diff time and check what columns are changed
    // 2. select all rows that are changed from sync table
    // 3. merge new changes diff
    //
    // Suppose you have such table:
    // id | name | age
    // 1  | bob  | 23
    //
    // It will have this sync_statuses table:
    // id | recordId | table | changes                                    | isDeleted | clientId | lastChangedAt
    // 31 | 1        | users | {id: "10:23", name: "10:23", age: "11:00"} | false     | a1       | 11:00
    //
    // So each row will have they own sync_status record. Both server and client will have this table.
    //
    // And then, the sync algo:
    // 1. We receive sync_statuses + rows of sync_statuses from server starting from last serverAppliedClock(preferences table) time
    // 2. We take MAX(lastChangedAt) from sync_statuses of server and ours, and will
    //    take client col change if it's higher than server change.
    // 3. Then we send sync_statuses + rows of sync_statuses that lastChangedAt > lastSendAt(preferences table) to server and update lastSendAt to now
    // 4. Store new serverAppliedClock and lastSendAt time in preferences table

    //
    // So we have sync table that for each column it will store last changed time of that column
    //

    const clientId = getClientId();
    const nextClock = initClock(clientId);

    for (const table of tables) {
      const res = await runSelectorAsync(asyncDB, function* () {
        return yield* runQuery(selectFrom(table.table, "byIds"));
      });

      // no need to broadcast to sub db
      execSync(syncDB.insert(table.table, res));
    }

    syncSubDb.subscribe((ops) => {
      console.log("ops", ops);
      if (ops.length === 0) return;

      void (async () => {
        const tx = await execAsync(asyncDB.beginTx());
        for (const op of ops) {
          if (op.type === "insert") {
            await execAsync(tx.insert(op.table, [op.newValue]));
            await asyncDispatch(
              tx,
              changesSlice.insertChangeFromInsert(
                op.table,
                op.newValue,
                nextClock,
              ),
            );
          } else if (op.type === "update") {
            await execAsync(tx.update(op.table, [op.newValue]));
            await asyncDispatch(
              tx,
              changesSlice.insertChangeFromUpdate(
                op.oldValue,
                op.newValue,
                nextClock,
              ),
            );
          } else if (op.type === "delete") {
            await execAsync(tx.delete(op.table, [op.oldValue.id]));
            await asyncDispatch(
              tx,
              changesSlice.insertChangeFromDelete(op.oldValue, nextClock),
            );
          }
        }

        await execAsync(tx.commit());
      })();
    });

    syncDispatch(syncSubDb, projectsSlice2.createInboxIfNotExists());

    initedDb = syncSubDb;

    return syncSubDb;
  } finally {
    lock.release();
  }
};
