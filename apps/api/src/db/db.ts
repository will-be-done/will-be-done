import {
  asyncDispatch,
  DB,
  execAsync,
  SubscribableDB,
  TableDefinition,
  TursoServerlessAsyncSqlDriver,
  type TursoServerlessClient,
} from "@will-be-done/hyperdb";
import path from "path";
import { mkdirSync } from "fs";
import { createClient as createTursoApiClient } from "@tursodatabase/api";
import { createClient as createTursoServerlessClient } from "@tursodatabase/serverless/compat";
import { getEnvConfig } from "../env";
import { changesSlice, changesTable } from "@will-be-done/slices/common";
import {
  noop,
  type DBCmd,
} from "@will-be-done/hyperdb/src/hyperdb/generators";
import { usersTable, tokensTable } from "../slices/authSlice";
import { dbsTable } from "../slices/dbSlice";
import {
  backupStateTable,
  backupTierStateTable,
  backupFileTable,
} from "../slices/backupSlice";
import { dbIdTrait } from "@will-be-done/slices/traits";
import {
  createBunSqliteAsyncSqlDriver,
  createBunSqliteDatabase,
} from "./BunSqliteAsyncSqlDriver";
import {
  tursoDbTokensTable,
  tursoSlice,
  type TursoDbToken,
} from "../slices/tursoSlice";

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

const getDbRecordId = (dbType: "user" | "space", dbId: string) =>
  `${dbType}:${dbId}`;

const sanitizeTursoNamePart = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");

const hashName = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }

  return hash.toString(36);
};

const getTursoDatabaseName = (dbType: "user" | "space", dbId: string) => {
  const env = getEnvConfig();
  const prefix = sanitizeTursoNamePart(env.TURSO_DB_NAME_PREFIX) || "wbd";
  const base = `${prefix}-${dbType}-${sanitizeTursoNamePart(dbId) || hashName(dbId)}`;

  if (base.length <= 64) return base;

  const hash = hashName(base);
  return `${base.slice(0, 64 - hash.length - 1).replace(/-+$/g, "")}-${hash}`;
};

const getTursoDatabaseUrl = (hostname: string) => {
  if (hostname.startsWith("libsql://") || hostname.startsWith("https://")) {
    return hostname;
  }

  return `libsql://${hostname}`;
};

const createLocalDB = async (
  dbType: "main" | "user" | "space",
  dbId: string,
) => {
  const dbName = `${dbType}-${dbId}`;
  const dbPath = path.join(getEnvConfig().WBD_DB_PATH, `${dbName}.sqlite`);

  mkdirSync(path.dirname(dbPath), { recursive: true });
  console.log("Loading database...", dbPath);

  const sqliteDB = createBunSqliteDatabase(dbPath);
  const sqliteDriver = createBunSqliteAsyncSqlDriver(sqliteDB);

  return new DB(
    sqliteDriver,
    [],
    dbType === "main" ? [] : [dbIdTrait(dbType, dbId)],
  );
};

const createTursoDBFromCredentials = (
  databaseUrl: string,
  authToken: string,
  dbType?: "user" | "space",
  dbId?: string,
) => {
  const client = createTursoServerlessClient({
    url: databaseUrl,
    authToken,
  }) as unknown as TursoServerlessClient;

  return new DB(
    new TursoServerlessAsyncSqlDriver(client),
    [],
    dbType && dbId ? [dbIdTrait(dbType, dbId)] : [],
  );
};

const getMainDBTables = () => [
  usersTable,
  tokensTable,
  dbsTable,
  tursoDbTokensTable,
  backupStateTable,
  backupTierStateTable,
  backupFileTable,
];

let mainDB: DB | undefined = undefined;
let mainDBPromise: Promise<DB> | undefined = undefined;

export const getMainHyperDB = async () => {
  if (mainDB) {
    return mainDB;
  }

  if (mainDBPromise) {
    return mainDBPromise;
  }

  mainDBPromise = (async () => {
    const env = getEnvConfig();
    const db =
      env.DB_ENGINE === "turso-serverless"
        ? createTursoDBFromCredentials(
            env.TURSO_MAIN_DATABASE_URL!,
            env.TURSO_MAIN_DB_AUTH_TOKEN!,
          )
        : await createLocalDB("main", "main");

    await execAsync(db.loadTables(getMainDBTables()));

    mainDB = db;
    return db;
  })();

  return mainDBPromise;
};

const getOrCreateTursoCredentials = async (
  dbType: "user" | "space",
  dbId: string,
): Promise<TursoDbToken> => {
  const main = await getMainHyperDB();
  const id = getDbRecordId(dbType, dbId);
  const existing = await asyncDispatch(main, tursoSlice.getById(id));
  if (existing) return existing;

  const env = getEnvConfig();
  const turso = createTursoApiClient({
    org: env.TURSO_ORG_SLUG!,
    token: env.TURSO_API_KEY!,
  });
  const databaseName = getTursoDatabaseName(dbType, dbId);

  let hostname: string;
  try {
    const created = await turso.databases.create(databaseName, {
      group: env.TURSO_GROUP,
    });
    hostname = created.hostname;
  } catch (error) {
    if (
      error instanceof Error &&
      "status" in error &&
      error.status === 409
    ) {
      const existingDb = await turso.databases.get(databaseName);
      hostname = existingDb.hostname;
    } else {
      throw error;
    }
  }

  const token = await turso.databases.createToken(databaseName, {
    authorization: "full-access",
  });
  const now = new Date().toISOString();
  const credentials: TursoDbToken = {
    id,
    dbType,
    dbId,
    databaseName,
    databaseUrl: getTursoDatabaseUrl(hostname),
    authToken: token.jwt,
    createdAt: now,
    updatedAt: now,
  };

  return asyncDispatch(main, tursoSlice.upsert(credentials));
};

const getDB = async (dbType: "user" | "space", dbId: string) => {
  const env = getEnvConfig();

  if (env.DB_ENGINE === "sqlite-local") {
    return createLocalDB(dbType, dbId);
  }

  const credentials = await getOrCreateTursoCredentials(dbType, dbId);
  return createTursoDBFromCredentials(
    credentials.databaseUrl,
    credentials.authToken,
    dbType,
    dbId,
  );
};

type HyperDBCacheEntry = {
  dbConfig: DBConfig;
  db: SubscribableDB;
  nextClock: () => string;
  clientId: string;
};

const dbs = new Map<string, HyperDBCacheEntry>();
const dbPromises = new Map<string, Promise<HyperDBCacheEntry>>();

export const getHyperDB = async (dbConfig: DBConfig) => {
  const dbName = `${dbConfig.dbType}-${dbConfig.dbId}`;
  const db = dbs.get(dbName);
  if (db) {
    return db;
  }

  const dbPromise = dbPromises.get(dbName);
  if (dbPromise) {
    return dbPromise;
  }

  const nextDbPromise = (async () => {
    const clientId = `server-${dbName}`;
    const nextClock = initClock(clientId);
    const hyperDB = new SubscribableDB(
      await getDB(dbConfig.dbType, dbConfig.dbId),
    );

    hyperDB.afterInsert(function* (_db, table, traits, ops) {
      if (table === changesTable) return;
      if (traits.some((t) => t.type === "skip-sync")) {
        return;
      }

      for (const op of ops) {
        yield* (changesSlice.insertChangeFromInsert(
          op.table,
          op.newValue,
          clientId,
          nextClock,
        ) as Generator<DBCmd, unknown, unknown>);
      }

      yield* noop();
    });

    hyperDB.afterUpdate(function* (_db, table, traits, ops) {
      if (table === changesTable) return;
      if (traits.some((t) => t.type === "skip-sync")) {
        return;
      }

      for (const op of ops) {
        yield* (changesSlice.insertChangeFromUpdate(
          op.table,
          op.oldValue,
          op.newValue,
          clientId,
          nextClock,
        ) as Generator<DBCmd, unknown, unknown>);
      }

      yield* noop();
    });

    hyperDB.afterDelete(function* (_db, table, traits, ops) {
      if (table === changesTable) return;
      if (traits.some((t) => t.type === "skip-sync")) {
        return;
      }

      for (const op of ops) {
        yield* (changesSlice.insertChangeFromDelete(
          op.table,
          op.oldValue,
          clientId,
          nextClock,
        ) as Generator<DBCmd, unknown, unknown>);
      }

      yield* noop();
    });

    await execAsync(hyperDB.loadTables(dbConfig.persistDBTables));

    const res = {
      db: hyperDB,
      dbConfig: dbConfig,
      nextClock,
      clientId,
    };
    dbs.set(dbName, res);
    dbPromises.delete(dbName);

    return res;
  })();

  dbPromises.set(dbName, nextDbPromise);
  return nextDbPromise;
};
