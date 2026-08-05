import { Database } from "bun:sqlite";
import { SqlDriver } from "@will-be-done/hyperdb/drivers/sqlite";
import {
  DB,
  execSync,
  SubscribableDB,
  syncDispatch,
  TableDefinition,
} from "@will-be-done/hyperdb";
import path from "path";
import { getEnvConfig } from "../env";
import {
  insertChangeFromInsert,
  insertChangeFromUpdate,
  insertChangeFromDelete,
  type PrimitiveRow,
} from "@will-be-done/slices/common";
import { noop } from "@will-be-done/hyperdb";
import { usersTable, tokensTable } from "../slices/authSlice";
import { dbsTable } from "../slices/dbSlice";
import {
  backupStateTable,
  backupTierStateTable,
  backupFileTable,
} from "../slices/backupSlice";
import { dbIdTrait } from "@will-be-done/slices/traits";
import fs from "fs";
import {
  createInboxIfNotExists,
  installProjectTaskStatsHooks,
  migrateLegacySpaceStorage,
  migrateProjectSectionTaskStats,
  migrateScheduledTodoTasks,
  spaceStorageMigrationTables,
} from "@will-be-done/slices/space";
import { subscriptionManager } from "../subscriptionManager";

export interface DBConfig {
  dbId: string;
  dbType: "user" | "space";
  persistDBTables: TableDefinition[];
  tableNameMap: Record<string, TableDefinition>;
}

const sqliteDatabases = new Set<Database>();

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

  const dbDir = getEnvConfig().WBD_DB_PATH;
  fs.mkdirSync(dbDir, { recursive: true });

  const dbPath = path.join(dbDir, dbName + ".sqlite");
  console.log("Loading database...", dbPath);
  const sqliteDB = new Database(dbPath, { strict: true });
  sqliteDatabases.add(sqliteDB);

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

  const db = new DB(sqliteDriver, { traits: [dbIdTrait(dbType, dbId)] });
  if (dbType === "space") {
    execSync(db.loadTables(spaceStorageMigrationTables));
    syncDispatch(db, migrateLegacySpaceStorage({}));
  }

  return db;
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
      backupFileTable,
    ]),
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

export function closeDatabases() {
  dbs.clear();
  mainDB = undefined;

  for (const sqliteDB of sqliteDatabases) {
    sqliteDB.close();
  }
  sqliteDatabases.clear();
}

export function installSyncNotificationHook(
  db: SubscribableDB,
  dbConfig: Pick<DBConfig, "dbId" | "dbType" | "tableNameMap">,
) {
  let notificationQueued = false;
  db.afterChange(function* notifySubscribers(_db, table, _traits, ops) {
    if (
      ops.length === 0 ||
      dbConfig.tableNameMap[table.tableName] === undefined ||
      notificationQueued
    ) {
      return;
    }

    notificationQueued = true;
    queueMicrotask(() => {
      notificationQueued = false;
      subscriptionManager.notifyChangesAvailable(
        dbConfig.dbId,
        dbConfig.dbType,
      );
    });

    yield* noop();
  });
}

export const getHyperDB = (dbConfig: DBConfig) => {
  const dbName = dbConfig.dbType + "-" + dbConfig.dbId;
  const db = dbs.get(dbName);
  if (db) {
    return db;
  }

  const clientId = "server-" + dbName;
  const nextClock = initClock(clientId);
  const hyperDB = new SubscribableDB(getDB(dbConfig.dbType, dbConfig.dbId));
  const isSyncableTable = (table: TableDefinition) =>
    dbConfig.tableNameMap[table.tableName] !== undefined;

  if (dbConfig.dbType === "space") {
    installProjectTaskStatsHooks(hyperDB);
  }

  installSyncNotificationHook(hyperDB, dbConfig);

  hyperDB.afterInsert(function* (db, table, traits, ops) {
    if (!isSyncableTable(table)) return;
    if (traits.some((t) => t.type === "skip-sync")) {
      return;
    }

    for (const op of ops) {
      syncDispatch(
        db,
        insertChangeFromInsert({ tableDef: op.table, row: op.newValue as PrimitiveRow, clientId: clientId, nextClock: nextClock() }),
      );
    }

    yield* noop();
  });

  hyperDB.afterUpsert(function* (db, table, traits, ops) {
    if (!isSyncableTable(table)) return;
    if (traits.some((t) => t.type === "skip-sync")) {
      return;
    }

    for (const op of ops) {
      if (!op.oldValue) {
        syncDispatch(
          db,
          insertChangeFromInsert({ tableDef: op.table, row: op.newValue as PrimitiveRow, clientId: clientId, nextClock: nextClock() }),
        );
        continue;
      }

      syncDispatch(
        db,
        insertChangeFromUpdate({ tableDef: op.table, oldRow: op.oldValue as PrimitiveRow, newRow: op.newValue as PrimitiveRow, clientId: clientId, nextClock: nextClock() }),
      );
    }

    yield* noop();
  });

  hyperDB.afterDelete(function* (db, table, traits, ops) {
    if (!isSyncableTable(table)) return;
    if (traits.some((t) => t.type === "skip-sync")) {
      return;
    }

    for (const op of ops) {
      syncDispatch(
        db,
        insertChangeFromDelete({ tableDef: op.table, row: op.oldValue as PrimitiveRow, clientId: clientId, nextClock: nextClock() }),
      );
    }

    yield* noop();
  });

  execSync(hyperDB.loadTables(dbConfig.persistDBTables));

  if (dbConfig.dbType === "space") {
    syncDispatch(hyperDB, migrateProjectSectionTaskStats({}));
    syncDispatch(hyperDB, migrateScheduledTodoTasks({}));
    syncDispatch(hyperDB, createInboxIfNotExists({}));
  }

  const res = {
    db: hyperDB,
    dbConfig: dbConfig,
    nextClock,
    clientId,
  };
  dbs.set(dbName, res);

  return res;
};
