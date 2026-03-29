import SQLiteAsyncESMFactory from "wa-sqlite/dist/wa-sqlite-async.mjs";
import asyncSqlWasmUrl from "wa-sqlite/dist/wa-sqlite-async.wasm?url";
import * as SQLite from "wa-sqlite";
//@ts-expect-error no declarations
import { IDBBatchAtomicVFS } from "wa-sqlite/src/examples/IDBBatchAtomicVFS.js";
import { AsyncSqlDriver } from "./drivers/AsyncSqlDriver";

export async function initWasmIDBPersisted(dbName: string) {
  const module = await SQLiteAsyncESMFactory({
    locateFile: () => asyncSqlWasmUrl,
  });

  const sqlite3 = SQLite.Factory(module);

  const vfs = await IDBBatchAtomicVFS.create("db-" + dbName, module);
  sqlite3.vfs_register(vfs, true);

  const db = await sqlite3.open_v2("db-" + dbName);

  await sqlite3.exec(db, `PRAGMA cache_size=5000;`);
  await sqlite3.exec(db, `PRAGMA journal_mode=DELETE;`);
  try {
    await sqlite3.exec(db, `PRAGMA PAGE_SIZE=32768;`);
  } catch (e) {}

  return new AsyncSqlDriver(sqlite3, db);
}
