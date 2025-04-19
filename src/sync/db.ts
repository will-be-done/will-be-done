import AwaitLock from "await-lock";
import { IDb, initDbClient, ISqlToRun } from "@kikko-land/kikko";
import sqlWasmUrl from "wa-sqlite/dist/wa-sqlite-async.wasm?url";
import { nanoid } from "nanoid";
import { Q, syncableTables } from "./schema";
import { waSqliteWebBackend } from "@/lib/wa-sqlite-backend/backend";

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
          .addColumn("lastUpdatedAt", "text")
          .addColumn("isDeleted", "boolean")
          .addColumn("data", "json"),
      );
    };

    for (const table of syncableTables) {
      await createSyncTable(table);
    }
  });
};

const lock = new AwaitLock();
let dbCtx: IDbCtx | undefined;
export const getDbCtx = async () => {
  await lock.acquireAsync();

  try {
    if (dbCtx) return dbCtx;

    const db = await initDbClient({
      dbName: "db-name",
      dbBackend: waSqliteWebBackend({
        wasmUrl: sqlWasmUrl,
        pageSize: 32 * 1024,
        cacheSize: 5000,
      }),
      plugins: [],
    });

    await createAppTables(db);

    dbCtx = initDbCtx(db);

    return dbCtx;
  } finally {
    lock.release();
  }
};
