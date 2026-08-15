import { Database } from "bun:sqlite";
import { SqlDriver } from "@will-be-done/hyperdb/drivers/sqlite";
import {
  asyncDispatch,
  DB,
  execAsync,
  SubscribableDB,
  TableDefinition,
} from "@will-be-done/hyperdb";
import path from "path";
import { getEnvConfig } from "../env";
import {
  insertChangeFromInsert,
  insertChangeFromUpdate,
  insertChangeFromDelete,
  type PrimitiveRow,
  type Change,
  type HlcClock,
  createHlcClock,
  changesTable,
  migrateSyncV4Clocks,
  getLatestChangeCursor,
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
import {
  createTursoCloudSqlDriver,
  getOrCreateTursoCloudDatabase,
} from "./turso";
import { createTursodSqlDriver } from "./tursod";
import { createServerClientId } from "../serverInstance";
import { initializeServerSyncFeed, recordServerChanges } from "../sync/actions";

export interface DBConfig {
  dbId: string;
  dbType: "user" | "space";
  persistDBTables: TableDefinition[];
  tableNameMap: Record<string, TableDefinition>;
}

const sqliteDatabases = new Set<Database>();
const asyncDatabaseClosers = new Set<() => Promise<void>>();

const createLocalDB = (dbType: string, dbId: string) => {
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

  return new DB(sqliteDriver, { traits: [dbIdTrait(dbType, dbId)] });
};

const getDB = async (dbType: "main" | "user" | "space", dbId: string) => {
  let db: DB;
  const env = getEnvConfig();
  if (env.WBD_DB_ENGINE === "sqlite") {
    db = createLocalDB(dbType, dbId);
  } else if (env.WBD_DB_ENGINE === "turso-cloud") {
    const { name, url } = await getOrCreateTursoCloudDatabase(dbType, dbId);
    console.log(`Loading Turso Cloud database "${name}"...`, url);
    const { driver, close } = await createTursoCloudSqlDriver(name, url);
    asyncDatabaseClosers.add(close);
    db = new DB(driver, { traits: [dbIdTrait(dbType, dbId)] });
  } else {
    const name = `${dbType}-${dbId}`;
    console.log(`Loading tursod database "${name}" from the tursod service...`);
    const { driver, close } = await createTursodSqlDriver(
      name,
      env.WBD_TURSOD_URL!,
      {
        authToken: env.WBD_TURSOD_AUTH_TOKEN!,
        requestTimeoutMs: env.WBD_TURSOD_REQUEST_TIMEOUT_MS,
      },
    );
    asyncDatabaseClosers.add(close);
    db = new DB(driver, { traits: [dbIdTrait(dbType, dbId)] });
  }

  if (dbType === "space") {
    await execAsync(db.loadTables(spaceStorageMigrationTables));
    await asyncDispatch(db, migrateLegacySpaceStorage({}));
  }

  return db;
};

let mainDB: DB | undefined = undefined;
let mainDBPromise: Promise<DB> | undefined;
export const getMainHyperDB = async () => {
  if (mainDB) {
    return mainDB;
  }
  if (mainDBPromise) return mainDBPromise;

  mainDBPromise = (async () => {
    const db = await getDB("main", "main");
    await execAsync(
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
  })();

  try {
    return await mainDBPromise;
  } finally {
    if (!mainDB) mainDBPromise = undefined;
  }
};

type HyperDBCacheEntry = {
  dbConfig: DBConfig;
  db: SubscribableDB;
  nextClock: HlcClock;
  clientId: string;
};

const dbs = new Map<string, HyperDBCacheEntry>();
const dbPromises = new Map<string, Promise<HyperDBCacheEntry>>();

export const getLoadedHyperDBs = () =>
  [...dbs.entries()].map(([database, entry]) => ({
    database,
    db: entry.db,
  }));

export async function closeDatabases() {
  dbs.clear();
  dbPromises.clear();
  mainDB = undefined;
  mainDBPromise = undefined;

  for (const sqliteDB of sqliteDatabases) {
    sqliteDB.close();
  }
  sqliteDatabases.clear();

  const closers = [...asyncDatabaseClosers];
  asyncDatabaseClosers.clear();
  await Promise.allSettled(closers.map((close) => close()));
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
      void subscriptionManager
        .notifyChangesAvailable(dbConfig.dbId, dbConfig.dbType)
        .catch((error) => {
          console.error(
            `[Sync notifications] Failed to publish changes for ${dbConfig.dbType} database "${dbConfig.dbId}":`,
            error,
          );
        });
    });

    yield* noop();
  });
}

export const getHyperDB = async (dbConfig: DBConfig) => {
  const dbName = dbConfig.dbType + "-" + dbConfig.dbId;
  const db = dbs.get(dbName);
  if (db) {
    return db;
  }
  const existingPromise = dbPromises.get(dbName);
  if (existingPromise) return existingPromise;

  const dbPromise = (async () => {
    const clientId = createServerClientId(dbName);
    const nextClock = createHlcClock(clientId);
    const hyperDB = new SubscribableDB(
      await getDB(dbConfig.dbType, dbConfig.dbId),
    );
    const isSyncableTable = (table: TableDefinition) =>
      dbConfig.tableNameMap[table.tableName] !== undefined;

    if (dbConfig.dbType === "space") {
      installProjectTaskStatsHooks(hyperDB);
    }

    installSyncNotificationHook(hyperDB, dbConfig);

    hyperDB.afterInsert(function* (_db, table, traits, ops) {
      if (!isSyncableTable(table)) return;
      if (traits.some((t) => t.type === "skip-sync")) return;

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

    hyperDB.afterUpsert(function* (_db, table, traits, ops) {
      if (!isSyncableTable(table)) return;
      if (traits.some((t) => t.type === "skip-sync")) return;

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

    hyperDB.afterDelete(function* (_db, table, traits, ops) {
      if (!isSyncableTable(table)) return;
      if (traits.some((t) => t.type === "skip-sync")) return;

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

    hyperDB.afterUpsert(function* (_db, table, _traits, ops) {
      if (table !== changesTable || ops.length === 0) return;
      yield* recordServerChanges({
        changes: ops.map((op) => op.newValue as Change),
      });
    });

    await execAsync(hyperDB.loadTables(dbConfig.persistDBTables));
    await asyncDispatch(
      hyperDB.withTraits({ type: "skip-sync" }),
      initializeServerSyncFeed({}),
    );
    const persistedClock = await asyncDispatch(
      hyperDB.withTraits({ type: "skip-sync" }),
      migrateSyncV4Clocks({}),
    );
    const latest = await asyncDispatch(hyperDB, getLatestChangeCursor({}));
    nextClock.observe([persistedClock, latest?.clock]);

    if (dbConfig.dbType === "space") {
      await asyncDispatch(hyperDB, migrateProjectSectionTaskStats({}));
      await asyncDispatch(hyperDB, migrateScheduledTodoTasks({}));
      await asyncDispatch(hyperDB, createInboxIfNotExists({}));
    }

    const result = { db: hyperDB, dbConfig, nextClock, clientId };
    dbs.set(dbName, result);
    return result;
  })();

  dbPromises.set(dbName, dbPromise);
  try {
    return await dbPromise;
  } finally {
    dbPromises.delete(dbName);
  }
};
