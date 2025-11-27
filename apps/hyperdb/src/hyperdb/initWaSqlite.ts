import SQLiteAsyncESMFactory from "wa-sqlite/dist/wa-sqlite-async.mjs";
import asyncSqlWasmUrl from "wa-sqlite/dist/wa-sqlite-async.wasm?url";
import * as SQLite from "wa-sqlite";
import { MemoryAsyncVFS } from "wa-sqlite/src/examples/MemoryAsyncVFS.js";
import { AsyncSqlDriver } from "./drivers/AsyncSqlDriver";

export async function initWasmIDBAsync() {
  const module = await SQLiteAsyncESMFactory({
    locateFile: () => asyncSqlWasmUrl,
  });

  const sqlite3 = SQLite.Factory(module);

  // @ts-expect-error wrong typing here
  const vfs = await MemoryAsyncVFS.create("my-db", module);
  sqlite3.vfs_register(vfs, true);

  const db = await sqlite3.open_v2("test-db");

  return new AsyncSqlDriver(sqlite3, db);
}
