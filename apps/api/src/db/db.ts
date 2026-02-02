import { Database } from "bun:sqlite";
import {
  DB,
  execSync,
  SqlDriver,
  SubscribableDB,
  syncDispatch,
  TableDefinition,
} from "@will-be-done/hyperdb";
import path from "path";
import { changesSlice, changesTable } from "@will-be-done/slices/common";
import { noop } from "@will-be-done/hyperdb/src/hyperdb/generators";
import { usersTable, tokensTable } from "../slices/authSlice";
import { dbsTable } from "../slices/dbSlice";
import {
  backupStateTable,
  backupTierStateTable,
} from "../slices/backupSlice";

export interface DBConfig {
  dbId: string;
  dbType: "user" | "space";
  persistDBTables: TableDefinition[];
  tableNameMap: Record<string, TableDefinition>;
}

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

const getDB = (dbType: string, dbId: string) => {
  const dbName = dbType + "-" + dbId;

  const dbPath = path.join(__dirname, "..", "..", "dbs", dbName + ".sqlite");
  console.log("Loading database...", dbPath);
  const sqliteDB = new Database(dbPath, { strict: true });

  sqliteDB.run("PRAGMA journal_mode=WAL;");
  sqliteDB.run("PRAGMA synchronous=NORMAL;");
  sqliteDB.run("PRAGMA journal_size_limit=6144000;");
  sqliteDB.run("PRAGMA foreign_keys = ON;");
  sqliteDB.run("PRAGMA busy_timeout=5000;");

  type SqlValue = number | string | Uint8Array | null;
  const sqliteDriver = new SqlDriver({
    exec(sql: string, params?: SqlValue[]): void {
      if (!params) {
        sqliteDB.run(sql);
      } else {
        sqliteDB.run(sql, params);
      }
    },
    prepare(sql: string) {
      const stmt = sqliteDB.prepare(sql);

      return {
        values(values: SqlValue[]): SqlValue[][] {
          return stmt.values(...values) as SqlValue[][];
        },
        finalize(): void {
          stmt.finalize();
        },
      };
    },
  });

  return new DB(sqliteDriver);
};

let mainDB: DB | undefined = undefined;
export const getMainHyperDB = () => {
  if (mainDB) {
    return mainDB;
  }

  const db = getDB("main", "main");

  execSync(
    db.loadTables([
      usersTable,
      tokensTable,
      dbsTable,
      backupStateTable,
      backupTierStateTable,
    ])
  );

  mainDB = db;
  return db;
};

const dbs: Map<
  string,
  {
    dbConfig: DBConfig;
    db: SubscribableDB;
    nextClock: () => string;
    clientId: string;
  }
> = new Map();

export const getHyperDB = (dbConfig: DBConfig) => {
  const dbName = dbConfig.dbType + "-" + dbConfig.dbId;
  const db = dbs.get(dbName);
  if (db) {
    return db;
  }

  const clientId = "server-" + dbName;
  const nextClock = initClock(clientId);
  const hyperDB = new SubscribableDB(getDB(dbConfig.dbType, dbConfig.dbId));

  hyperDB.afterInsert(function* (db, table, traits, ops) {
    if (table === changesTable) return;
    if (traits.some((t) => t.type === "skip-sync")) {
      return;
    }

    for (const op of ops) {
      syncDispatch(
        db,
        changesSlice.insertChangeFromInsert(
          op.table,
          op.newValue,
          clientId,
          nextClock,
        ),
      );
    }

    yield* noop();
  });

  hyperDB.afterUpdate(function* (db, table, traits, ops) {
    if (table === changesTable) return;
    if (traits.some((t) => t.type === "skip-sync")) {
      return;
    }

    for (const op of ops) {
      syncDispatch(
        db,
        changesSlice.insertChangeFromUpdate(
          op.table,
          op.oldValue,
          op.newValue,
          clientId,
          nextClock,
        ),
      );
    }

    yield* noop();
  });

  hyperDB.afterDelete(function* (db, table, traits, ops) {
    if (table === changesTable) return;
    if (traits.some((t) => t.type === "skip-sync")) {
      return;
    }

    for (const op of ops) {
      syncDispatch(
        db,
        changesSlice.insertChangeFromDelete(
          op.table,
          op.oldValue,
          clientId,
          nextClock,
        ),
      );
    }

    yield* noop();
  });

  execSync(hyperDB.loadTables(dbConfig.persistDBTables));

  const res = {
    db: hyperDB,
    dbConfig: dbConfig,
    nextClock,
    clientId,
  };
  dbs.set(dbName, res);

  return res;
};
