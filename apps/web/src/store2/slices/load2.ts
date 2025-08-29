import SQLiteAsyncESMFactory from "wa-sqlite/dist/wa-sqlite-async.mjs";
import { nanoid } from "nanoid";
import {
  asyncDispatch,
  AsyncSqlDriver,
  BptreeInmemDriver,
  DB,
  execAsync,
  execSync,
  runQuery,
  runSelectorAsync,
  selectFrom,
  SubscribableDB,
  syncDispatch,
} from "@will-be-done/hyperdb";
import AwaitLock from "await-lock";
import asyncSqlWasmUrl from "wa-sqlite/dist/wa-sqlite-async.wasm?url";
//@ts-expect-error no declarations
import { IDBBatchAtomicVFS } from "wa-sqlite/src/examples/IDBBatchAtomicVFS.js";
import {
  changesSlice,
  changesTable,
  projectsSlice2,
  tables,
} from "@will-be-done/slices";
import * as SQLite from "wa-sqlite";

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
    // 1. We send changes to server starting from last lastSentAt(preferences table) time,
    // 2. Save new lastSentAt
    // 3. We poll server for changes that happened after last serverAppliedClock.
    //    Server even will send back changes that we sent on step 1 - it's ok for v1 of sync protocol
    // 4. Save new serverAppliedClock
    //
    // This will allow to ensure server authority. On our change send server may
    // perform thie own changes(uniq values unsurence for example), and send them to us.
    //
    //
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
                getClientId(),
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
