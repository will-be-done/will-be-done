import SQLiteAsyncESMFactory from "wa-sqlite/dist/wa-sqlite-async.mjs";
import { AsyncSqlDriver } from "@will-be-done/hyperdb";
import asyncSqlWasmUrl from "wa-sqlite/dist/wa-sqlite-async.wasm?url";
//@ts-expect-error no declarations
import { IDBBatchAtomicVFS } from "wa-sqlite/src/examples/IDBBatchAtomicVFS.js";
import * as SQLite from "wa-sqlite";

export async function initAsyncDriver(dbName: string) {
  const module = await SQLiteAsyncESMFactory({
    locateFile: () => asyncSqlWasmUrl,
  });

  const sqlite3 = SQLite.Factory(module);

  console.log("initAsyncDriver - spaceId", dbName);

  const vfs = await IDBBatchAtomicVFS.create("db-" + dbName, module);
  sqlite3.vfs_register(vfs, true);

  const db = await sqlite3.open_v2("db-" + dbName);

  await sqlite3.exec(db, `PRAGMA cache_size=5000;`);
  await sqlite3.exec(db, `PRAGMA journal_mode=DELETE;`);

  // @ts-expect-error it's ok
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
