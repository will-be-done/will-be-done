import { Database } from "bun:sqlite";
import { AsyncSqlDriver } from "@will-be-done/hyperdb/drivers/sqlite";
import {
  asyncDispatch,
  DB,
  execAsync,
  SubscribableDB,
  TableDefinition,
  type HyperDB,
} from "@will-be-done/hyperdb";
import path from "path";
import { getEnvConfig } from "../env";
import { googleFlowsTable } from "../google/tables";
import { backfillUserEmails } from "../slices/authSlice";
import { accountEmailTables } from "../email/tables";
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
import { hyperDBStrictOptions } from "@will-be-done/slices";
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
  syncTableNamesInDependencyOrder: string[];
}

type Closers = Set<() => Promise<void> | void>;

const createLocalDB = (dbType: string, dbId: string, closers: Closers) => {
  const dbName = dbType + "-" + dbId;

  const dbDir = getEnvConfig().WBD_DB_PATH;
  fs.mkdirSync(dbDir, { recursive: true });

  const dbPath = path.join(dbDir, dbName + ".sqlite");
  console.log("Loading database...", dbPath);
  const sqliteDB = new Database(dbPath, { strict: true });
  closers.add(() => sqliteDB.close());

  sqliteDB.run("PRAGMA journal_mode=WAL;");
  sqliteDB.run("PRAGMA synchronous=NORMAL;");
  sqliteDB.run("PRAGMA journal_size_limit=6144000;");
  sqliteDB.run("PRAGMA foreign_keys = ON;");
  sqliteDB.run("PRAGMA busy_timeout=5000;");

  type SqlValue = number | string | Uint8Array | null;
  // Queue transactions for every request-serving database connection.
  const sqliteDriver = new AsyncSqlDriver({
    async exec(sql, params) {
      if (!params) {
        sqliteDB.run(sql);
      } else {
        sqliteDB.run(sql, params);
      }
    },
    prepare(sql: string) {
      const stmt = sqliteDB.prepare(sql);

      return {
        async values(values: SqlValue[]): Promise<SqlValue[][]> {
          return stmt.values(...values) as SqlValue[][];
        },
        finalize(): void {
          stmt.finalize();
        },
      };
    },
  });

  return new DB(sqliteDriver, {
    traits: [dbIdTrait(dbType, dbId)],
    ...hyperDBStrictOptions,
  });
};

const getDB = async (
  dbType: "main" | "user" | "space",
  dbId: string,
  closers: Closers,
) => {
  let db: DB;
  const env = getEnvConfig();
  if (env.WBD_DB_ENGINE === "sqlite") {
    db = createLocalDB(dbType, dbId, closers);
  } else if (env.WBD_DB_ENGINE === "turso-cloud") {
    const { name, url } = await getOrCreateTursoCloudDatabase(dbType, dbId);
    console.log(`Loading Turso Cloud database "${name}"...`, url);
    const { driver, close } = await createTursoCloudSqlDriver(name, url);
    closers.add(close);
    db = new DB(driver, {
      traits: [dbIdTrait(dbType, dbId)],
      ...hyperDBStrictOptions,
    });
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
    closers.add(close);
    db = new DB(driver, {
      traits: [dbIdTrait(dbType, dbId)],
      ...hyperDBStrictOptions,
    });
  }

  if (dbType === "space") {
    await execAsync(db.loadTables(spaceStorageMigrationTables));
    await asyncDispatch(db, migrateLegacySpaceStorage({}));
  }

  return db;
};

const openMainDB = async (closers: Closers) => {
  const db = await getDB("main", "main", closers);
  await execAsync(
    db.loadTables([
      ...accountEmailTables,
      googleFlowsTable,
      usersTable,
      tokensTable,
      dbsTable,
      backupStateTable,
      backupTierStateTable,
      backupFileTable,
    ]),
  );
  let after = await asyncDispatch(db, backfillUserEmails({}));
  while (after !== null) {
    after = await asyncDispatch(db, backfillUserEmails({ after }));
  }
  return db;
};

export type OpenedDatabase = {
  dbConfig: DBConfig;
  db: HyperDB;
  nextClock: HlcClock;
  clientId: string;
};

export type LoadedDatabase = {
  database: string;
  dbType: DBConfig["dbType"];
  db: HyperDB;
};

export type NotifyChanges = (
  dbId: string,
  dbType: DBConfig["dbType"],
) => Promise<void>;

export function installSyncNotificationHook(
  db: SubscribableDB,
  dbConfig: Pick<DBConfig, "dbId" | "dbType" | "tableNameMap">,
  notify: NotifyChanges,
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
      void notify(dbConfig.dbId, dbConfig.dbType).catch((error) => {
        console.error(
          `[Sync notifications] Failed to publish changes for ${dbConfig.dbType} database "${dbConfig.dbId}":`,
          error,
        );
      });
    });

    yield* noop();
  });
}

export function installServerChangeFeedHook(db: SubscribableDB) {
  db.afterUpsert(function* (_db, table, _traits, ops) {
    if (table !== changesTable || ops.length === 0) return;
    yield* recordServerChanges({
      changes: ops.map((op) => op.newValue as Change),
    });
  });
}

const openSyncedDB = async (
  dbConfig: DBConfig,
  closers: Closers,
  notify: NotifyChanges,
): Promise<OpenedDatabase> => {
  const dbName = dbConfig.dbType + "-" + dbConfig.dbId;
  const clientId = createServerClientId(dbName);
  const nextClock = createHlcClock(clientId);
  const hyperDB = new SubscribableDB(
    await getDB(dbConfig.dbType, dbConfig.dbId, closers),
  );
  const isSyncableTable = (table: TableDefinition) =>
    dbConfig.tableNameMap[table.tableName] !== undefined;

  if (dbConfig.dbType === "space") {
    installProjectTaskStatsHooks(hyperDB);
  }

  installSyncNotificationHook(hyperDB, dbConfig, notify);

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

  // Clock migration rewrites materialized metadata but is not a new domain
  // change. Install the feed hook only after that one-time rewrite so
  // `skip-sync` can retain its narrow meaning: suppress local change
  // generation while still publishing explicit canonical Change writes.
  installServerChangeFeedHook(hyperDB);

  if (dbConfig.dbType === "space") {
    await asyncDispatch(hyperDB, migrateProjectSectionTaskStats({}));
    await asyncDispatch(hyperDB, migrateScheduledTodoTasks({}));
    await asyncDispatch(hyperDB, createInboxIfNotExists({}));
  }

  return { db: hyperDB, dbConfig, nextClock, clientId };
};

export const createDatabaseRegistry = (notify: NotifyChanges) => {
  const closers: Closers = new Set();
  const opening = new Map<string, Promise<OpenedDatabase>>();
  const opened = new Map<string, OpenedDatabase>();
  let main: Promise<DB> | undefined;
  let closed = false;

  const assertOpen = () => {
    if (closed) throw new Error("Databases are closed");
  };

  const closeAll = async (pending: Closers) => {
    const results = await Promise.allSettled(
      [...pending].map(async (close) => close()),
    );
    for (const result of results) {
      if (result.status === "rejected") {
        console.error("Failed to close database", result.reason);
      }
    }
  };

  const openTracked = async <T>(open: (local: Closers) => Promise<T>) => {
    const local: Closers = new Set();
    try {
      const result = await open(local);
      assertOpen();
      for (const close of local) closers.add(close);
      return result;
    } catch (error) {
      await closeAll(local);
      throw error;
    }
  };

  // Failed opens are forgotten so the next request retries them.
  return {
    main: async () => {
      assertOpen();
      main ??= openTracked(openMainDB).catch((error: unknown) => {
        main = undefined;
        throw error;
      });
      return main;
    },
    open: async (dbConfig: DBConfig) => {
      assertOpen();
      const dbName = dbConfig.dbType + "-" + dbConfig.dbId;
      const existing = opened.get(dbName) ?? opening.get(dbName);
      if (existing) return existing;
      const promise = openTracked((local) =>
        openSyncedDB(dbConfig, local, notify),
      );
      opening.set(dbName, promise);
      try {
        const database = await promise;
        assertOpen();
        opened.set(dbName, database);
        return database;
      } finally {
        opening.delete(dbName);
      }
    },
    loaded: (): LoadedDatabase[] =>
      [...opened.entries()].map(([database, entry]) => ({
        database,
        dbType: entry.dbConfig.dbType,
        db: entry.db,
      })),
    close: async () => {
      closed = true;
      const inFlight = [...opening.values(), ...(main ? [main] : [])];
      main = undefined;
      opening.clear();
      opened.clear();
      await Promise.allSettled(inFlight);
      const pending = new Set(closers);
      closers.clear();
      await closeAll(pending);
    },
  };
};

export type DatabaseRegistry = ReturnType<typeof createDatabaseRegistry>;
