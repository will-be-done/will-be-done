import AwaitLock from "await-lock";
import { IDb, initDbClient, ISqlToRun, sql } from "@kikko-land/kikko";
import sqlWasmUrl from "wa-sqlite/dist/wa-sqlite-async.wasm?url";
import { nanoid } from "nanoid";
import { preferencesTable, Q, syncableTables } from "./schema.ts";
import { waSqliteWebBackend } from "@/lib/wa-sqlite-backend/backend.ts";

export interface IDbCtx {
  db: IDb;
  clientId: string;
  nextClock: () => string;
}

export const initClock = (clientId: string) => {
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

export const getClientId = () => {
  const id = localStorage.getItem("clientId");

  if (id) return id;

  const newId = nanoid();
  localStorage.setItem("clientId", newId);

  return newId;
};

function initDbCtx(db: IDb): IDbCtx {
  const clientId = getClientId();

  return {
    db,
    clientId,
    nextClock: initClock(clientId),
  };
}

export const createAppTables = (db: IDb) => {
  return db.runInTransaction(async (db) => {
    const createSyncTable = async (table: string) => {
      await db.runQuery(
        Q.schema
          .createTable(table)
          .ifNotExists()
          .addColumn("id", "text", (col) => col.primaryKey())
          .addColumn("needSync", "boolean")
          .addColumn("lastUpdatedOnClientAt", "text")
          .addColumn("lastUpdatedOnServerAt", "text")
          .addColumn("hash", "text", (col) => col.unique())
          .addColumn("isDeleted", "boolean")
          .addColumn("data", "json"),
      );
    };

    for (const table of syncableTables) {
      await createSyncTable(table);
    }

    await db.runQuery(
      Q.schema
        .createTable(preferencesTable)
        .ifNotExists()
        .addColumn("key", "text", (col) => col.primaryKey().notNull())
        .addColumn("value", "text", (col) => col.notNull()),
    );
  });
};

const lock = new AwaitLock();
let dbCtx: IDbCtx | undefined;
export const getDbCtx = async () => {
  await lock.acquireAsync();

  try {
    if (dbCtx) return dbCtx;

    console.log("getDbCtx", "1");
    const db = await initDbClient({
      dbName: "db-name",
      dbBackend: waSqliteWebBackend({
        wasmUrl: sqlWasmUrl,
        pageSize: 32 * 1024,
        cacheSize: 5000,
      }),
      plugins: [],
    });
    console.log("getDbCtx", "2");

    await createAppTables(db);

    dbCtx = initDbCtx(db);

    // @ts-expect-error
    window.sql = sql;
    // @ts-expect-error
    window.db = db;

    return dbCtx;
  } finally {
    lock.release();
  }
};
